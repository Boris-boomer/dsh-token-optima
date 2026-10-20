import { createRoot } from 'react-dom/client'
import { useState, useEffect, type FC } from 'react'
import { Panel } from './Panel.js'
import { detectDark, readInheritedFont, type InheritedFont } from './styles.js'
import { TYPERT_REMOTE } from './descriptors.js'

export const inject = ['remote']

interface SessionItem {
  sessionId: string
  updatedAt?: number
  projections?: { values?: { title?: string } }
}

function getService(ctx: any): any {
  try {
    return ctx?.remote?.namespaces?.get?.('tokenOptima')?.service
  } catch {
    return undefined
  }
}

function getSessionSvc(ctx: any): any {
  try {
    return ctx?.remote?.namespaces?.get?.('session')?.service
  } catch {
    return undefined
  }
}

interface RootProps {
  ctx: any
}

const Root: FC<RootProps> = ({ ctx }) => {
  const [open, setOpen] = useState(false)
  const [hostSessionId, setHostSessionId] = useState('')
  const [fetchSessionId, setFetchSessionId] = useState('')
  const [manualSessionId, setManualSessionId] = useState('')
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [dark, setDark] = useState<boolean>(() => detectDark())
  const [font, setFont] = useState<InheritedFont>(() => readInheritedFont())

  // 新增：状态——网格中是否有我们的图标
  const [hasGridIcon, setHasGridIcon] = useState(false)

  const activeSessionId = manualSessionId || hostSessionId || fetchSessionId

  /* ---------- 新增：轮询检测网格状态 ---------- */
  useEffect(() => {
    const checkGrid = () => {
      const registry = (window as any).__dshIconRegistry
      if (Array.isArray(registry) && registry.some((e: any) => e.id === 'token-optima')) {
        setHasGridIcon(true)
      } else {
        setHasGridIcon(false)
      }
    }
    // 初始化检查一次
    checkGrid()
    // 应对 DSH 可能延迟初始化或清空 registry 的情况
    const timer = setInterval(checkGrid, 1000)
    return () => clearInterval(timer)
  }, [])

  /* ---------- 主题 + 字体跟随 ---------- */
  useEffect(() => {
    const update = (): void => {
      setDark(detectDark())
      const f = readInheritedFont()
      setFont((prev: InheritedFont) =>
        prev.fontFamily === f.fontFamily &&
        prev.fontSize === f.fontSize &&
        prev.lineHeight === f.lineHeight
          ? prev
          : f,
      )
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener?.('change', update)
    const t = setInterval(update, 1500)
    return () => {
      observer.disconnect()
      media.removeEventListener?.('change', update)
      clearInterval(t)
    }
  }, [])

  /* ---------- 从 host 轮询当前会话 ---------- */
  useEffect(() => {
    let cancelled = false
    const refresh = async (): Promise<void> => {
      const svc = getService(ctx)
      if (!svc) return
      try {
        const r = await svc.report('')
        const v = (r?.value ?? r) as { currentSessionId?: string } | null
        if (cancelled) return
        const id = v?.currentSessionId ?? ''
        if (id) {
          setHostSessionId((prev) => {
            if (prev !== id && prev !== '') {
              setManualSessionId('')
            }
            return id
          })
        }
      } catch {
        // ignore
      }
    }
    void refresh()
    const t = setInterval(() => {
      void refresh()
    }, 2000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [ctx])

  /* ---------- fetch hook：兜底抓 sessionId ----------
   * 仅用于读取 URL 中携带的 sessionId，绝不修改请求或发送数据。
   */
  useEffect(() => {
    const origFetch = window.fetch
    const origOpen = XMLHttpRequest.prototype.open

    const scan = (url: string): void => {
      try {
        const m = url.match(/[?&]sessionId=(session-[0-9a-f-]+)/i)
        const captured = m?.[1]
        if (captured) {
          setFetchSessionId((prev) => (prev === captured ? prev : captured))
        }
      } catch {
        // ignore
      }
    }

    const fetchHandler = function (
      this: typeof window,
      ...args: Parameters<typeof fetch>
    ): ReturnType<typeof fetch> {
      try {
        const first = args[0]
        const url =
          typeof first === 'string'
            ? first
            : first instanceof URL
              ? first.href
              : first && typeof first === 'object' && 'url' in first
                ? String((first as Request).url)
                : ''
        scan(url)
      } catch {
        // ignore
      }
      return origFetch.apply(this, args)
    }

    const openHandler = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ): void {
      try {
        scan(typeof url === 'string' ? url : url.href)
      } catch {
        // ignore
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (origOpen as any).apply(this, [method, url, ...rest])
    }

    window.fetch = fetchHandler as typeof fetch
    XMLHttpRequest.prototype.open = openHandler as typeof XMLHttpRequest.prototype.open

    return () => {
      window.fetch = origFetch
      XMLHttpRequest.prototype.open = origOpen
    }
  }, [])

  /* ---------- 拉会话标题 ---------- */
  useEffect(() => {
    const svc = getSessionSvc(ctx)
    if (!svc) return

    let cancelled = false
    const refresh = async (): Promise<void> => {
      try {
        const r = await svc.list({})
        const items: SessionItem[] = r?.value?.items ?? r?.items ?? []
        if (cancelled || !Array.isArray(items)) return
        const map: Record<string, string> = {}
        for (const it of items) {
          const t = it?.projections?.values?.title
          if (it?.sessionId && typeof t === 'string' && t.length > 0) {
            map[it.sessionId] = t
          }
        }
        setTitles((prev) => {
          const same =
            Object.keys(prev).length === Object.keys(map).length &&
            Object.keys(map).every((k) => prev[k] === map[k])
          return same ? prev : map
        })
      } catch {
        // ignore
      }
    }

    void refresh()
    const t = setInterval(() => {
      void refresh()
    }, 5000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [ctx])

  /* ---------- icon-grid 点击 ---------- */
  useEffect(() => {
    const handler = (): void => setOpen((prev) => !prev)
    window.addEventListener('token-optima:toggle', handler)
    return () => window.removeEventListener('token-optima:toggle', handler)
  }, [])

  /* ---------- 从 host 拿 debug 开关 ---------- */
  useEffect(() => {
    const svc = getService(ctx)
    if (!svc) return
    let cancelled = false
    Promise.resolve(svc.report(''))
      .then((r: any) => {
        const v = r?.value ?? r
        if (!cancelled && v?.debug === true) {
          ;(window as any).__tokenOptimaDebug = {
            ctx,
            remote: ctx?.remote,
            namespaces: ctx?.remote?.namespaces,
            get service() {
              return getService(ctx)
            },
            get sessionSvc() {
              return getSessionSvc(ctx)
            },
            get currentSessionId() {
              return activeSessionId
            },
            get titles() {
              return titles
            },
          }
        } else {
          delete (window as any).__tokenOptimaDebug
        }
      })
      .catch(() => {
        delete (window as any).__tokenOptimaDebug
      })
    return () => {
      cancelled = true
      delete (window as any).__tokenOptimaDebug
    }
  }, [ctx, activeSessionId, titles])

  // 决定是否显示悬浮球（条件：面板未打开，且网格中没有我们的图标）
  const showFloatingBall = !open && !hasGridIcon

  return (
    <>
      {/* 悬浮球兜底（仅在网格不可用时显示） */}
      {showFloatingBall && (
        <div
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            right: '24px',
            bottom: '24px',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: dark ? 'rgba(20, 22, 28, 0.9)' : '#ffffff',
            border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 99998,
            fontSize: '20px',
            color: dark ? '#fff' : '#000',
            transition: 'transform 0.2s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          title="Token Optima"
        >
          ◎
        </div>
      )}

      {/* 面板本体 */}
      {open && (
        <Panel
          ctx={ctx}
          sessionId={activeSessionId}
          title={titles[activeSessionId] ?? ''}
          dark={dark}
          font={font}
          onClose={() => setOpen(false)}
          onSessionChange={(id) => {
            if (id === hostSessionId) {
              setManualSessionId('')
            } else {
              setManualSessionId(id)
            }
          }}
        />
      )}
    </>
  )
}

let root: ReturnType<typeof createRoot> | null = null
let host: HTMLDivElement | null = null

export async function apply(ctx: any) {
  // 强力清理上一次残留的 DOM 容器和 React 实例
  document.querySelectorAll('[data-dsh-token-optima="1"]').forEach((el) => {
    try { el.remove() } catch { /* ignore */ }
  })
  
  if (root) {
    try { root.unmount() } catch { /* ignore */ }
    root = null
  }
  if (host) {
    try { host.remove() } catch { /* ignore */ }
    host = null
  }

  if (typeof ctx?.remote?.$mount === 'function') {
    try {
      await ctx.remote.$mount(TYPERT_REMOTE)
    } catch (err) {
      console.error('[dsh-token-optima/client] $mount failed:', err)
    }
  } else {
    console.error('[dsh-token-optima/client] ctx.remote.$mount not available')
  }

  host = document.createElement('div')
  host.dataset.dshTokenOptima = '1'
  document.body.appendChild(host)
  root = createRoot(host)
  root.render(<Root ctx={ctx} />)

  // 尝试注入网格。如果 DSH 未提供 __dshIconRegistry，则不创建它。
  // 这样可以确保在没有网格的环境下，悬浮球能正常兜底。
  const registry = (window as any).__dshIconRegistry as Array<{
    id: string
    icon: string
    label: string
    packageName?: string
    onClick?: () => void
  }> | undefined

  if (registry) {
    const existingIndex = registry.findIndex((e) => e.id === 'token-optima')
    if (existingIndex >= 0) {
      registry.splice(existingIndex, 1)
    }
    registry.push({
      id: 'token-optima',
      icon: '◎',
      label: 'Token Optima',
      packageName: 'dsh-token-optima',
      onClick: () => window.dispatchEvent(new CustomEvent('token-optima:toggle')),
    })
  } else {
    console.log('[dsh-token-optima] DSH icon grid not found, falling back to floating ball.')
  }

  ctx.on('dispose', () => {
    root?.unmount()
    root = null
    host?.remove()
    host = null
    const r = (window as any).__dshIconRegistry as Array<{ id: string }> | undefined
    if (r) {
      const i = r.findIndex((e) => e.id === 'token-optima')
      if (i >= 0) r.splice(i, 1)
    }
  })
}
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
  const [manualSessionId, setManualSessionId] = useState('') // 新增：手动选择的历史会话
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [dark, setDark] = useState<boolean>(() => detectDark())
  const [font, setFont] = useState<InheritedFont>(() => readInheritedFont())

  // 优先级：手动选择 > 宿主当前会话 > fetch 兜底
  const activeSessionId = manualSessionId || hostSessionId || fetchSessionId

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
            // 如果宿主当前会话变了（比如发了新消息），清空手动选择，自动切回最新
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

  /* ---------- fetch hook：兜底抓 sessionId ---------- */
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

  if (!open) return null

  return (
    <Panel
      ctx={ctx}
      sessionId={activeSessionId}
      title={titles[activeSessionId] ?? ''}
      dark={dark}
      font={font}
      onClose={() => setOpen(false)}
      onSessionChange={(id) => {
        if (id === hostSessionId) {
          setManualSessionId('') // 如果选的正好是当前活跃会话，取消手动锁定
        } else {
          setManualSessionId(id)
        }
      }}
    />
  )
}

let root: ReturnType<typeof createRoot> | null = null
let host: HTMLDivElement | null = null

export async function apply(ctx: any) {
  // 1. 强力清理上一次残留的 DOM 容器和 React 实例
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

  // 2. 创建全新的挂载点
  host = document.createElement('div')
  host.dataset.dshTokenOptima = '1'
  document.body.appendChild(host)
  root = createRoot(host)
  root.render(<Root ctx={ctx} />)

  // 3. 清理并重新注册全局图标，防止出现多个重复的 icon
  const registry = ((window as any).__dshIconRegistry ||= []) as Array<{
    id: string
    icon: string
    label: string
    packageName?: string
    onClick?: () => void
  }>
  
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

  // 4. 清理逻辑
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
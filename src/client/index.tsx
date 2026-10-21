import { createRoot } from 'react-dom/client'
import { useState, useEffect, type FC } from 'react'
import { Panel } from './Panel.js'
import { detectDark, ensureGlobalStyles, readInheritedFont, type InheritedFont } from './styles.js'
import { DARK, LIGHT } from './theme.js'
import { LogoIcon } from './Icon.js'
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

const FloatingButton: FC<{
  dark: boolean
  onClick: () => void
}> = ({ dark, onClick }) => {
  const theme = dark ? DARK : LIGHT
  const [hover, setHover] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Token Optima"
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        width: 52,
        height: 52,
        borderRadius: 16,
        border: 'none',
        padding: 0,
        background: dark
          ? `linear-gradient(140deg, ${theme.surface} 0%, ${theme.bgElevated} 100%)`
          : `linear-gradient(140deg, #FFFFFF 0%, ${theme.surfaceHover} 100%)`,
        color: theme.accent,
        cursor: 'pointer',
        boxShadow: hover
          ? `0 12px 32px ${theme.accent}40, 0 0 0 1px ${theme.borderStrong}, inset 0 1px 0 rgba(255,255,255,${dark ? '0.06' : '0.9'})`
          : `0 6px 20px rgba(0,0,0,${dark ? '0.5' : '0.12'}), 0 0 0 1px ${theme.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99998,
        transform: hover ? 'translateY(-2px) scale(1.04)' : 'translateY(0) scale(1)',
        transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 200ms ease',
        fontFamily: theme.fontFamily,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 1,
          borderRadius: 15,
          background: hover ? theme.accentSoft : 'transparent',
          transition: 'background 200ms ease',
          pointerEvents: 'none',
        }}
      />
      <LogoIcon size={24} />
    </button>
  )
}

const Root: FC<RootProps> = ({ ctx }) => {
  const [open, setOpen] = useState(false)
  const [hostSessionId, setHostSessionId] = useState('')
  const [fetchSessionId, setFetchSessionId] = useState('')
  const [manualSessionId, setManualSessionId] = useState('')
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [dark, setDark] = useState<boolean>(() => detectDark())
  const [font, setFont] = useState<InheritedFont>(() => readInheritedFont())
  const [hasGridIcon, setHasGridIcon] = useState(false)

  const activeSessionId = manualSessionId || hostSessionId || fetchSessionId

  useEffect(() => {
    ensureGlobalStyles()
  }, [])

  useEffect(() => {
    const checkGrid = () => {
      const registry = (window as any).__dshIconRegistry
      setHasGridIcon(
        Array.isArray(registry) && registry.some((e: any) => e.id === 'token-optima'),
      )
    }
    checkGrid()

    const observer = new MutationObserver(checkGrid)
    observer.observe(document.body, { childList: true, subtree: true })

    const t = setInterval(checkGrid, 30_000)
    return () => {
      observer.disconnect()
      clearInterval(t)
    }
  }, [])

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
            if (prev !== id && prev !== '') setManualSessionId('')
            return id
          })
        }
      } catch {
        // ignore
      }
    }
    void refresh()

    let off: (() => void) | undefined
    try {
      const on = ctx?.on
      if (typeof on === 'function') {
        const handler = () => void refresh()
        on.call(ctx, 'tokenOptima/updated', handler)
        off = () => {
          const offFn = ctx?.off
          if (typeof offFn === 'function') {
            offFn.call(ctx, 'tokenOptima/updated', handler)
          }
        }
      }
    } catch {
      // ignore
    }

    const t = setInterval(() => void refresh(), 10_000)
    return () => {
      cancelled = true
      clearInterval(t)
      off?.()
    }
  }, [ctx])

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
    const t = setInterval(() => void refresh(), 30_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [ctx])

  useEffect(() => {
    const handler = (): void => setOpen((prev) => !prev)
    window.addEventListener('token-optima:toggle', handler)
    return () => window.removeEventListener('token-optima:toggle', handler)
  }, [])

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

  const showFloatingBall = !open && !hasGridIcon

  return (
    <>
      {showFloatingBall && <FloatingButton dark={dark} onClick={() => setOpen(true)} />}
      {open && (
        <Panel
          ctx={ctx}
          sessionId={activeSessionId}
          title={titles[activeSessionId] ?? ''}
          dark={dark}
          font={font}
          onClose={() => setOpen(false)}
          onSessionChange={(id) => {
            if (id === hostSessionId) setManualSessionId('')
            else setManualSessionId(id)
          }}
        />
      )}
    </>
  )
}

let root: ReturnType<typeof createRoot> | null = null
let host: HTMLDivElement | null = null

export async function apply(ctx: any) {
  ensureGlobalStyles()

  document.querySelectorAll('[data-dsh-token-optima="1"]').forEach((el) => {
    try {
      el.remove()
    } catch {
      /* ignore */
    }
  })

  if (root) {
    try {
      root.unmount()
    } catch {
      /* ignore */
    }
    root = null
  }
  if (host) {
    try {
      host.remove()
    } catch {
      /* ignore */
    }
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

  const registry = (window as any).__dshIconRegistry as
    | Array<{
        id: string
        icon: string
        label: string
        packageName?: string
        onClick?: () => void
      }>
    | undefined

  if (registry) {
    const existingIndex = registry.findIndex((e) => e.id === 'token-optima')
    if (existingIndex >= 0) registry.splice(existingIndex, 1)
    registry.push({
      id: 'token-optima',
      // 水晶球：彩色 Emoji，寓意洞察与监测
      icon: '🔮',
      label: 'Token Optima',
      packageName: 'dsh-token-optima',
      onClick: () => window.dispatchEvent(new CustomEvent('token-optima:toggle')),
    })
  } else {
    console.log('[dsh-token-optima] DSH icon grid not found, falling back to floating button.')
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
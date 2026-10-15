import {
  useEffect,
  useRef,
  useState,
  type FC,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { Composition, type CompositionEntry, type GroupEntry } from './Composition.js'
import { Trend, type TrendEntry } from './Trend.js'
import { panelStyle, colors, type InheritedFont } from './styles.js'

interface Props {
  ctx: any
  sessionId: string
  title: string
  dark: boolean
  font: InheritedFont
  onClose: () => void
}

interface EffortDecision {
  sessionId: string
  previous: string
  decided: string
  reason: string
  at: number
}

interface CacheRisk {
  sessionId: string
  kind: 'append' | 'replace' | 'shrink' | 'compaction'
  at: number
  prevLen: number
  nextLen: number
  detail: string
}

interface Report {
  turns: number
  latest: {
    turnId: string
    model: string
    cacheBlocks: { hitBlocks: number; missBlocks: number; writeCandidateBlocks: number }
    alignmentDrift: number
    cacheEvents: Array<{ kind: string; atChunkIndex: number }>
    reasoning: { producedThisTurn: number; replayedInInput: number }
    categories: Record<number, { value: number; precision: string }>
  } | null
  history: Array<{
    turnId: string
    categories: Record<number, { value: number }>
    cacheBlocks: { hitBlocks: number; missBlocks: number; writeCandidateBlocks: number }
    cacheEvents: Array<{ kind: string }>
  }>
  budget: {
    usage: { session: number; daily: number; monthly: number }
    limits: { session?: number; daily?: number; monthly?: number }
  }
  tokenizer: { id: string; precision: string }
  effort: EffortDecision[]
  cacheRisks: CacheRisk[]
}

function getService(ctx: any): any {
  try {
    return ctx?.remote?.namespaces?.get?.('tokenOptima')?.service
  } catch {
    return undefined
  }
}

const POS_KEY = 'dsh-token-optima-panel-pos'

function loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? p : null
  } catch {
    return null
  }
}

function savePos(p: { x: number; y: number }): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p))
  } catch {
    // ignore
  }
}

export const Panel: FC<Props> = ({ ctx, sessionId, title, dark, font, onClose }) => {
  const [report, setReport] = useState<Report | null>(null)
  const [composition, setComposition] = useState<CompositionEntry[]>([])
  const [groups, setGroups] = useState<GroupEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => loadPos())
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      const p = panelRef.current
      if (!d || !p) return
      const w = p.offsetWidth
      const h = p.offsetHeight
      let x = e.clientX - d.offsetX
      let y = e.clientY - d.offsetY
      x = Math.max(0, Math.min(x, window.innerWidth - w))
      y = Math.max(0, Math.min(y, window.innerHeight - h))
      setPos({ x, y })
    }
    const onUp = () => {
      if (dragRef.current) {
        setPos((prev) => {
          if (prev) savePos(prev)
          return prev
        })
      }
      dragRef.current = null
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startDrag = (e: ReactMouseEvent) => {
    const p = panelRef.current
    if (!p) return
    const rect = p.getBoundingClientRect()
    dragRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    }
    if (!pos) setPos({ x: rect.left, y: rect.top })
    e.preventDefault()
  }

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      const svc = getService(ctx)
      if (!svc) {
        if (!cancelled) setReady(false)
        return
      }

      if (!sessionId) {
        if (!cancelled) {
          setReady(true)
          setReport(null)
          setError(null)
        }
        return
      }

      try {
        try {
          await svc.ensureSession()
        } catch {
          // ignore
        }

        const [r, c, g] = await Promise.all([
          svc.report(sessionId),
          svc.composition(sessionId),
          svc.groups(sessionId),
        ])
        if (!cancelled) {
          setReady(true)
          setReport((r?.value ?? r) as Report)
          setComposition(((c?.value ?? c) ?? []) as CompositionEntry[])
          setGroups(((g?.value ?? g) ?? []) as GroupEntry[])
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? String(err))
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
  }, [ctx, sessionId])

  const trend: TrendEntry[] = (report?.history ?? []).slice(-30).map((t) => {
    const groupsRecord: Record<string, number> = {}
    const groupIds: Record<string, number[]> = {
      input: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      cache: [10, 11, 12],
      output: [13],
      reasoning: [14],
    }
    for (const [gname, ids] of Object.entries(groupIds)) {
      groupsRecord[gname] = ids.reduce((a, id) => a + (t.categories[id]?.value ?? 0), 0)
    }
    return {
      turnId: t.turnId,
      total: Object.values(groupsRecord).reduce((a, b) => a + b, 0),
      groups: groupsRecord,
      hitBlocks: t.cacheBlocks.hitBlocks,
      missBlocks: t.cacheBlocks.missBlocks,
      writeBlocks: t.cacheBlocks.writeCandidateBlocks,
      compressed: false,
      cacheInvalidated: t.cacheEvents.length > 0,
    }
  })

  const sectionStyle: CSSProperties = {
    marginTop: '1.3em',
    paddingTop: '1.1em',
    borderTop: `1px solid ${dark ? colors.border : colors.borderLight}`,
  }

  const sectionTitleStyle: CSSProperties = {
    marginBottom: '0.7em',
    color: colors.muted,
    fontSize: '0.92em',
    fontWeight: 500,
    letterSpacing: 0.3,
  }

  const statRowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.2em',
    fontVariantNumeric: 'tabular-nums',
  }

  const statLabelStyle: CSSProperties = {
    color: colors.muted,
    marginRight: '0.4em',
    fontSize: '0.92em',
  }

  const statValueStyle: CSSProperties = {
    fontWeight: 600,
  }

  const positionStyle: CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : {}

  const merged = { ...panelStyle(dark, font), ...positionStyle }

  const latestEffort =
    report?.effort && report.effort.length > 0
      ? report.effort[report.effort.length - 1]
      : null

  const risks = (report?.cacheRisks ?? []).slice(-5).reverse()

  const formatTime = (ts: number): string => {
    try {
      const d = new Date(ts)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
    } catch {
      return ''
    }
  }

  const shortId = sessionId ? sessionId.slice(-8) : '—'

  return (
    <div ref={panelRef} style={merged}>
      <div
        onMouseDown={startDrag}
        style={{
          cursor: 'grab',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.6em',
          paddingBottom: '0.8em',
          borderBottom: `1px solid ${dark ? colors.border : colors.borderLight}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1.05em', fontWeight: 600 }}>Token Optima</div>
          <div
            style={{
              color: colors.muted,
              fontSize: '0.85em',
              marginTop: '0.15em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={sessionId}
          >
            {title || '（无标题）'} · {shortId}
          </div>
        </div>
        <button
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            background: 'none',
            border: 'none',
            color: colors.muted,
            cursor: 'pointer',
            fontSize: '1.4em',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {!sessionId && (
        <div style={{ marginTop: '0.8em', color: colors.muted, fontSize: '0.92em' }}>
          等待会话激活...
        </div>
      )}

      {sessionId && !ready && (
        <div style={{ marginTop: '0.8em', color: colors.muted, fontSize: '0.92em' }}>
          加载中...
        </div>
      )}

      {ready && error && (
        <div style={{ marginTop: '0.8em', color: '#E94B3C', fontSize: '0.92em' }}>
          {error}
        </div>
      )}

      {ready && !error && !report?.latest && (
        <div style={{ marginTop: '0.8em', color: colors.muted, fontSize: '0.92em' }}>
          等待首次对话...
        </div>
      )}

      {ready && report?.latest && (
        <>
          <div style={sectionStyle}>
            <Composition groups={groups} composition={composition} dark={dark} />
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>推理强度</div>
            {latestEffort ? (
              latestEffort.decided === 'unsupported' ? (
                <div style={{ color: colors.muted, fontSize: '0.92em' }}>
                  当前模型未启用 reasoningEffort 控制
                </div>
              ) : (
                <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.92em' }}>
                  <span style={{ fontWeight: 600 }}>{latestEffort.decided}</span>
                  {latestEffort.previous !== latestEffort.decided && (
                    <span style={{ color: colors.muted, marginLeft: '0.6em' }}>
                      （{latestEffort.previous} → {latestEffort.decided}）
                    </span>
                  )}
                  <div
                    style={{
                      color: colors.muted,
                      fontSize: '0.85em',
                      marginTop: '0.2em',
                    }}
                  >
                    {latestEffort.reason}
                  </div>
                </div>
              )
            ) : (
              <div style={{ color: colors.muted, fontSize: '0.92em' }}>
                等待下次请求...
              </div>
            )}
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>缓存块</div>
            <div style={statRowStyle}>
              <span>
                <span style={statLabelStyle}>命中</span>
                <span style={statValueStyle}>{report.latest.cacheBlocks.hitBlocks}</span>
              </span>
              <span>
                <span style={statLabelStyle}>未命中</span>
                <span style={statValueStyle}>{report.latest.cacheBlocks.missBlocks}</span>
              </span>
              <span>
                <span style={statLabelStyle}>写入候选</span>
                <span style={statValueStyle}>
                  {report.latest.cacheBlocks.writeCandidateBlocks}
                </span>
              </span>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>推理 Token</div>
            <div style={statRowStyle}>
              <span>
                <span style={statLabelStyle}>本轮新产生</span>
                <span style={statValueStyle}>{report.latest.reasoning.producedThisTurn}</span>
              </span>
              <span>
                <span style={statLabelStyle}>历史回传</span>
                <span style={statValueStyle}>{report.latest.reasoning.replayedInInput}</span>
              </span>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>缓存风险</div>
            {risks.length === 0 ? (
              <div style={{ color: colors.muted, fontSize: '0.92em' }}>
                无（缓存前缀未被破坏）
              </div>
            ) : (
              risks.map((r, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: '0.9em',
                    padding: '0.25em 0',
                    borderBottom:
                      i < risks.length - 1
                        ? `1px dashed ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`
                        : 'none',
                  }}
                >
                  <div>
                    <span style={{ color: '#E94B3C', marginRight: '0.4em' }}>
                      {r.kind === 'compaction' ? '⚡' : r.kind === 'shrink' ? '↓' : '↻'}
                    </span>
                    <span style={{ fontWeight: 600 }}>{r.kind}</span>
                    <span
                      style={{
                        color: colors.muted,
                        marginLeft: '0.6em',
                        fontSize: '0.85em',
                      }}
                    >
                      {formatTime(r.at)}
                    </span>
                  </div>
                  <div
                    style={{
                      color: colors.muted,
                      fontSize: '0.85em',
                      paddingLeft: '1.2em',
                    }}
                  >
                    {r.detail}
                  </div>
                </div>
              ))
            )}
          </div>

          {report.latest.cacheEvents.length > 0 && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>本轮缓存事件</div>
              {report.latest.cacheEvents.map((e, i) => (
                <div key={i} style={{ fontSize: '0.9em', padding: '0.15em 0' }}>
                  ⚡ {e.kind} @ block {e.atChunkIndex}
                </div>
              ))}
            </div>
          )}

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>趋势（近 {trend.length} 轮）</div>
            <Trend entries={trend} dark={dark} />
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>预算</div>
            <div
              style={{
                fontVariantNumeric: 'tabular-nums',
                fontSize: '0.92em',
                lineHeight: 1.9,
              }}
            >
              <div>
                <span style={statLabelStyle}>会话</span>
                {report.budget.usage.session} / {report.budget.limits.session || '∞'}
              </div>
              <div>
                <span style={statLabelStyle}>日</span>
                {report.budget.usage.daily} / {report.budget.limits.daily || '∞'}
              </div>
              <div>
                <span style={statLabelStyle}>月</span>
                {report.budget.usage.monthly} / {report.budget.limits.monthly || '∞'}
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={{ color: colors.muted, fontSize: '0.85em' }}>
              tokenizer: {report.tokenizer.id} ({report.tokenizer.precision})
            </div>
          </div>
        </>
      )}
    </div>
  )
}
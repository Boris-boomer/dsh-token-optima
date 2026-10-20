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
  onSessionChange: (id: string) => void // 新增：支持切换会话
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
  changedSources?: string[]
}

interface HealthReport {
  at: number
  ok: boolean
  failures: Array<{ item: string; detail: string }>
}

interface CostBreakdown {
  total: number
  savedByCache: number
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
    unattributed?: { value: number; precision: string }
    cost?: CostBreakdown
  } | null
  history: Array<{
    turnId: string
    timestamp: number
    model: string
    categories: Record<number, { value: number }>
    cacheBlocks: { hitBlocks: number; missBlocks: number; writeCandidateBlocks: number }
    cacheEvents: Array<{ kind: string }>
    cost?: CostBreakdown
  }>
  budget: {
    usage: { session: number; daily: number; monthly: number }
    limits: { session?: number; daily?: number; monthly?: number }
  }
  tokenizer: { id: string; precision: string }
  effort: EffortDecision[]
  cacheRisks: CacheRisk[]
  foldFailures: number
  debug: boolean
  health: HealthReport
}

interface SessionSummary {
  sessionId: string
  turns: number
  lastTs: number
  model: string
  totalTokens: number
  totalCost: number
  totalSaved: number
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

function downloadBlob(filename: string, content: string, mime: string): void {
  try {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (err) {
    console.error('[dsh-token-optima] download failed:', err)
  }
}

export const Panel: FC<Props> = ({ ctx, sessionId, title, dark, font, onClose, onSessionChange }) => {
  const [report, setReport] = useState<Report | null>(null)
  const [composition, setComposition] = useState<CompositionEntry[]>([])
  const [groups, setGroups] = useState<GroupEntry[]>([])
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [exporting, setExporting] = useState(false)

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

      try {
        const sessList = await svc.listSessions()
        if (!cancelled) {
          setSessions((sessList?.value ?? sessList) as SessionSummary[])
        }
      } catch {
        // ignore
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

  const handleExport = async (): Promise<void> => {
    const svc = getService(ctx)
    if (!svc || !sessionId || exporting) return
    setExporting(true)
    try {
      const r = await svc.exportCsv(sessionId)
      const csv = (r?.value ?? r) as string
      if (typeof csv !== 'string' || csv.length === 0) {
        setError('导出为空')
        return
      }
      const shortId = sessionId.slice(-8)
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      downloadBlob(`token-optima-${shortId}-${ts}.csv`, csv, 'text/csv;charset=utf-8')
    } catch (err) {
      setError(`导出失败：${(err as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  const historyList = report?.history ?? []
  const totalCostAllTime = historyList.reduce((sum, t) => sum + (t.cost?.total ?? 0), 0)
  const totalSavedAllTime = historyList.reduce((sum, t) => sum + (t.cost?.savedByCache ?? 0), 0)
  
  let totalHit = 0
  let totalMiss = 0
  for (const t of historyList) {
    totalHit += t.cacheBlocks.hitBlocks
    totalMiss += (t.cacheBlocks.missBlocks + t.cacheBlocks.writeCandidateBlocks)
  }
  const totalBlocks = totalHit + totalMiss
  const cacheHitRate = totalBlocks > 0 ? (totalHit / totalBlocks) * 100 : 0

  const trend: TrendEntry[] = historyList.slice(-30).map((t) => {
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

  const iconBtnStyle: CSSProperties = {
    background: 'none',
    border: `1px solid ${dark ? colors.border : colors.borderLight}`,
    borderRadius: 6,
    color: colors.muted,
    cursor: 'pointer',
    fontSize: '0.85em',
    padding: '0.2em 0.5em',
    lineHeight: 1.2,
    fontFamily: 'inherit',
  }

  const positionStyle: CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : {}

  const merged = { ...panelStyle(dark, font), ...positionStyle }

  const latestEffort = report?.effort && report.effort.length > 0 ? report.effort[report.effort.length - 1] : null
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
  const drift = report?.latest?.alignmentDrift ?? 0
  const unattributed = report?.latest?.unattributed?.value ?? 0
  const foldFailures = report?.foldFailures ?? 0
  const health = report?.health

  const issues: Array<{ level: 'warn' | 'error'; text: string }> = []

  if (health && !health.ok) {
    for (const f of health.failures) issues.push({ level: 'error', text: `DSH 接口变更：${f.item}（${f.detail}）` })
  }
  if (drift > 0.03) issues.push({ level: 'warn', text: `估算偏差 ${(drift * 100).toFixed(1)}% — 1-9 类为客户端估算，非精确值` })
  if (unattributed > 0) issues.push({ level: 'warn', text: `未归因 ${Math.round(unattributed)} tokens — 无法映射到任何来源` })
  if (foldFailures > 0) issues.push({ level: 'error', text: `${foldFailures} 个事件解析失败，数据可能不完整` })

  const cost = report?.latest?.cost
  const formatCurrency = (val: number) => `$${val.toFixed(5)}`

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
              display: 'flex',
              alignItems: 'center',
              gap: '0.4em'
            }}
          >
            {/* 新增：会话下拉选择器 */}
            <select
              value={sessionId}
              onChange={(e) => onSessionChange(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                color: dark ? colors.text : colors.textLight,
                border: 'none',
                borderRadius: 4,
                padding: '2px 4px',
                fontSize: '0.95em',
                maxWidth: '160px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {sessions.map(s => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.sessionId.slice(-8)} ({s.turns}轮)
                </option>
              ))}
              {!sessions.some(s => s.sessionId === sessionId) && sessionId && (
                <option value={sessionId}>{shortId} (当前)</option>
              )}
            </select>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>
              {title || '（无标题）'}
            </span>
          </div>
        </div>
        <div
          style={{ display: 'flex', gap: '0.4em', alignItems: 'center' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleExport}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={!sessionId || exporting || !report?.latest}
            style={{
              ...iconBtnStyle,
              opacity: !sessionId || exporting || !report?.latest ? 0.4 : 1,
              cursor: !sessionId || exporting || !report?.latest ? 'not-allowed' : 'pointer',
            }}
            title="导出 CSV"
          >
            {exporting ? '...' : 'CSV'}
          </button>
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
      </div>

      {!sessionId && <div style={{ marginTop: '0.8em', color: colors.muted, fontSize: '0.92em' }}>等待会话激活...</div>}
      {sessionId && !ready && <div style={{ marginTop: '0.8em', color: colors.muted, fontSize: '0.92em' }}>加载中...</div>}
      {ready && error && <div style={{ marginTop: '0.8em', color: '#E94B3C', fontSize: '0.92em' }}>{error}</div>}
      {ready && !error && !report?.latest && issues.length === 0 && <div style={{ marginTop: '0.8em', color: colors.muted, fontSize: '0.92em' }}>等待首次对话...</div>}

      {ready && !error && issues.length > 0 && (
        <div
          style={{
            marginTop: '0.9em',
            padding: '0.6em 0.7em',
            borderRadius: 6,
            background: dark ? 'rgba(245,166,35,0.08)' : 'rgba(245,166,35,0.10)',
            border: `1px solid ${dark ? 'rgba(245,166,35,0.35)' : 'rgba(245,166,35,0.45)'}`,
          }}
        >
          {issues.map((it, i) => (
            <div key={i} style={{ fontSize: '0.88em', lineHeight: 1.55, color: it.level === 'error' ? '#E94B3C' : '#C77A00' }}>
              ⚠ {it.text}
            </div>
          ))}
        </div>
      )}

      {ready && report?.latest && (
        <>
          <div style={sectionStyle}>
            <Composition groups={groups} composition={composition} dark={dark} />
          </div>

          {cost && (
            <div
              style={{
                marginTop: '1.2em',
                borderRadius: 8,
                background: dark ? 'rgba(80, 200, 120, 0.08)' : 'rgba(80, 200, 120, 0.12)',
                border: `1px solid ${dark ? 'rgba(80, 200, 120, 0.25)' : 'rgba(80, 200, 120, 0.3)'}`,
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8em' }}>
                <div>
                  <div style={{ color: colors.muted, fontSize: '0.85em', marginBottom: '0.2em' }}>本轮缓存为你省下</div>
                  <div style={{ fontSize: '1.2em', fontWeight: 700, color: colors.cache }}>{formatCurrency(cost.savedByCache)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: colors.muted, fontSize: '0.85em', marginBottom: '0.2em' }}>本轮总花费</div>
                  <div style={{ fontSize: '1.2em', fontWeight: 700, color: dark ? colors.text : colors.textLight }}>{formatCurrency(cost.total)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5em 0.8em', background: dark ? 'rgba(80, 200, 120, 0.1)' : 'rgba(80, 200, 120, 0.15)', borderTop: `1px dashed ${dark ? 'rgba(80, 200, 120, 0.3)' : 'rgba(80, 200, 120, 0.4)'}`, fontSize: '0.85em' }}>
                <span style={{ color: colors.cache, fontWeight: 600 }}>会话累计省下 {formatCurrency(totalSavedAllTime)}</span>
                <span style={{ color: colors.muted }}>累计花费 {formatCurrency(totalCostAllTime)} | 平均命中率 {cacheHitRate.toFixed(1)}%</span>
              </div>
            </div>
          )}

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>推理强度</div>
            {latestEffort ? (
              latestEffort.decided === 'unsupported' ? (
                <div style={{ color: colors.muted, fontSize: '0.92em' }}>{latestEffort.reason}</div>
              ) : (
                <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.92em' }}>
                  <span style={{ fontWeight: 600 }}>{latestEffort.decided}</span>
                  {latestEffort.previous !== latestEffort.decided && (
                    <span style={{ color: colors.muted, marginLeft: '0.6em' }}>（{latestEffort.previous} → {latestEffort.decided}）</span>
                  )}
                  <div style={{ color: colors.muted, fontSize: '0.85em', marginTop: '0.2em' }}>{latestEffort.reason}</div>
                </div>
              )
            ) : <div style={{ color: colors.muted, fontSize: '0.92em' }}>等待下次请求...</div>}
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>缓存块</div>
            <div style={statRowStyle}>
              <span><span style={statLabelStyle}>命中</span><span style={statValueStyle}>{report.latest.cacheBlocks.hitBlocks}</span></span>
              <span><span style={statLabelStyle}>未命中</span><span style={statValueStyle}>{report.latest.cacheBlocks.missBlocks}</span></span>
              <span><span style={statLabelStyle}>写入候选</span><span style={statValueStyle}>{report.latest.cacheBlocks.writeCandidateBlocks}</span></span>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>推理 Token</div>
            <div style={statRowStyle}>
              <span><span style={statLabelStyle}>本轮新产生</span><span style={statValueStyle}>{report.latest.reasoning.producedThisTurn}</span></span>
              <span><span style={statLabelStyle}>历史回传</span><span style={statValueStyle}>{report.latest.reasoning.replayedInInput}</span></span>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>缓存风险</div>
            {risks.length === 0 ? (
              <div style={{ color: colors.muted, fontSize: '0.92em' }}>无（缓存前缀未被破坏）</div>
            ) : (
              risks.map((r, i) => (
                <div key={i} style={{ fontSize: '0.9em', padding: '0.4em 0', borderBottom: i < risks.length - 1 ? `1px dashed ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` : 'none' }}>
                  <div>
                    <span style={{ color: '#E94B3C', marginRight: '0.4em' }}>{r.kind === 'compaction' ? '⚡' : r.kind === 'shrink' ? '↓' : '↔'}</span>
                    <span style={{ fontWeight: 600 }}>{r.kind}</span>
                    <span style={{ color: colors.muted, marginLeft: '0.6em', fontSize: '0.85em' }}>{formatTime(r.at)}</span>
                  </div>
                  <div style={{ color: colors.muted, fontSize: '0.85em', paddingLeft: '1.2em', marginTop: '0.2em' }}>{r.detail}</div>
                  {r.changedSources && r.changedSources.length > 0 && (
                    <div style={{ color: '#C77A00', fontSize: '0.82em', paddingLeft: '1.2em', marginTop: '0.2em', fontWeight: 500 }}>⚠ 涉及来源：{r.changedSources.join(', ')}</div>
                  )}
                </div>
              ))
            )}
          </div>

          {report.latest.cacheEvents.length > 0 && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>本轮缓存事件</div>
              {report.latest.cacheEvents.map((e, i) => (
                <div key={i} style={{ fontSize: '0.9em', padding: '0.15em 0' }}>⚡ {e.kind} @ block {e.atChunkIndex}</div>
              ))}
            </div>
          )}

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>趋势（近 {trend.length} 轮）</div>
            <Trend entries={trend} dark={dark} />
          </div>

          {/* 新增：同会话历史明细 */}
          <div style={sectionStyle}>
            <details>
              <summary style={{ cursor: 'pointer', color: colors.muted, fontSize: '0.92em', userSelect: 'none' }}>
                历史轮次明细（共 {historyList.length} 轮）
              </summary>
              <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: '0.8em' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em' }}>
                  <thead>
                    <tr style={{ color: colors.muted, textAlign: 'left', borderBottom: `1px solid ${dark ? colors.border : colors.borderLight}` }}>
                      <th style={{ padding: '0.4em 0' }}>轮次</th>
                      <th>花费</th>
                      <th>省下</th>
                      <th>命中/未中</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...historyList].reverse().map((t, idx) => (
                      <tr key={t.turnId} style={{ borderBottom: `1px dashed ${dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}>
                        <td style={{ padding: '0.4em 0' }}>#{historyList.length - idx}</td>
                        <td style={{ color: dark ? colors.text : colors.textLight }}>${(t.cost?.total ?? 0).toFixed(5)}</td>
                        <td style={{ color: colors.cache }}>${(t.cost?.savedByCache ?? 0).toFixed(5)}</td>
                        <td style={{ color: colors.muted }}>{t.cacheBlocks.hitBlocks} / {t.cacheBlocks.missBlocks + t.cacheBlocks.writeCandidateBlocks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>预算（tokens）</div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.92em', lineHeight: 1.9 }}>
              <div><span style={statLabelStyle}>会话</span>{report.budget.usage.session} / {report.budget.limits.session || '∞'}</div>
              <div><span style={statLabelStyle}>日</span>{report.budget.usage.daily} / {report.budget.limits.daily || '∞'}</div>
              <div><span style={statLabelStyle}>月</span>{report.budget.usage.monthly} / {report.budget.limits.monthly || '∞'}</div>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={{ color: colors.muted, fontSize: '0.85em' }}>tokenizer: {report.tokenizer.id} ({report.tokenizer.precision})</div>
          </div>
        </>
      )}
    </div>
  )
}
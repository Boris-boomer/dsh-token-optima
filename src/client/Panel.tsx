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
import { DARK, LIGHT, groupColor, type Theme } from './theme.js'
import { ensureGlobalStyles, themeToCssVars, type InheritedFont } from './styles.js'
import { formatCurrency, formatNumber, formatPercent, formatTime } from './format.js'
import {
  CloseIcon,
  DownloadIcon,
  LogoIcon,
  SparkIcon,
  WalletIcon,
  WarningIcon,
  ZapIcon,
  ShrinkIcon,
  ReplaceIcon,
  ClockIcon,
} from './Icon.js'

interface Props {
  ctx: any
  sessionId: string
  title: string
  dark: boolean
  font: InheritedFont
  onClose: () => void
  onSessionChange: (id: string) => void
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
  isPeak: boolean
  pricingVersion: string
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

/* ---------------- 小部件 ---------------- */

const Card: FC<{ theme: Theme; children: React.ReactNode; style?: CSSProperties }> = ({
  theme,
  children,
  style,
}) => (
  <div
    style={{
      padding: '14px 16px',
      borderRadius: 12,
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      ...style,
    }}
  >
    {children}
  </div>
)

const SectionLabel: FC<{ theme: Theme; children: React.ReactNode; right?: React.ReactNode }> = ({
  theme,
  children,
  right,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    }}
  >
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        color: theme.textTertiary,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}
    >
      {children}
    </div>
    {right}
  </div>
)

const StatCard: FC<{
  theme: Theme
  label: string
  value: string
  accent: string
  icon: React.ReactNode
  sub?: React.ReactNode
}> = ({ theme, label, value, accent, icon, sub }) => (
  <div
    style={{
      padding: '14px 15px',
      borderRadius: 11,
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        color: accent,
        opacity: 0.55,
        display: 'flex',
      }}
    >
      {icon}
    </div>
    <div
      style={{
        fontSize: 10.5,
        color: theme.textTertiary,
        textTransform: 'uppercase',
        letterSpacing: '0.09em',
        fontWeight: 600,
        marginBottom: 8,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        color: accent,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1,
      }}
    >
      {value}
    </div>
    {sub && (
      <div style={{ fontSize: 11, color: theme.textTertiary, marginTop: 6 }}>{sub}</div>
    )}
  </div>
)

const MiniMetric: FC<{
  theme: Theme
  label: string
  primary: string
  secondary?: string
}> = ({ theme, label, primary, secondary }) => (
  <div
    style={{
      padding: '10px 12px',
      borderRadius: 9,
      background: theme.bgElevated,
      border: `1px solid ${theme.border}`,
    }}
  >
    <div
      style={{
        fontSize: 10,
        color: theme.textTertiary,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontWeight: 600,
        marginBottom: 4,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 15,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        color: theme.text,
        letterSpacing: '-0.01em',
      }}
    >
      {primary}
    </div>
    {secondary && (
      <div style={{ fontSize: 10.5, color: theme.textTertiary, marginTop: 2 }}>
        {secondary}
      </div>
    )}
  </div>
)

const RiskIcon: FC<{ kind: CacheRisk['kind']; size?: number }> = ({ kind, size = 13 }) => {
  if (kind === 'compaction') return <ZapIcon size={size} />
  if (kind === 'shrink') return <ShrinkIcon size={size} />
  return <ReplaceIcon size={size} />
}

/* ---------------- 主体 ---------------- */

export const Panel: FC<Props> = ({
  ctx,
  sessionId,
  title,
  dark,
  font,
  onClose,
  onSessionChange,
}) => {
  const theme: Theme = dark ? DARK : LIGHT

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
    ensureGlobalStyles()
  }, [])

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
    let debounce: ReturnType<typeof setTimeout> | null = null

    const refresh = async () => {
      const svc = getService(ctx)
      if (!svc) {
        if (!cancelled) setReady(false)
        return
      }

      try {
        const sessList = await svc.listSessions()
        if (!cancelled) setSessions((sessList?.value ?? sessList) as SessionSummary[])
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

    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = null
        void refresh()
      }, 280)
    }

    void refresh()

    let off: (() => void) | undefined
    try {
      const on = ctx?.on
      if (typeof on === 'function') {
        on.call(ctx, 'tokenOptima/updated', scheduleRefresh)
        off = () => {
          const offFn = ctx?.off
          if (typeof offFn === 'function') {
            offFn.call(ctx, 'tokenOptima/updated', scheduleRefresh)
          }
        }
      }
    } catch {
      // ignore
    }

    const t = setInterval(() => void refresh(), 10_000)
    return () => {
      cancelled = true
      if (debounce) clearTimeout(debounce)
      clearInterval(t)
      off?.()
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
    totalMiss += t.cacheBlocks.missBlocks + t.cacheBlocks.writeCandidateBlocks
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

  const positionStyle: CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : { right: 24, bottom: 24 }

  const rootStyle: CSSProperties = {
    ...themeToCssVars(theme),
    position: 'fixed',
    width: 468,
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: '82vh',
    display: 'flex',
    flexDirection: 'column',
    background: theme.bg,
    color: theme.text,
    fontFamily: font.fontFamily || theme.fontFamily,
    fontSize: 13,
    lineHeight: 1.5,
    border: `1px solid ${theme.borderStrong}`,
    borderRadius: 16,
    boxShadow: theme.shadowLg,
    overflow: 'hidden',
    zIndex: 99999,
    animation: 'to-scale-in 220ms cubic-bezier(0.4, 0, 0.2, 1)',
    ...positionStyle,
  }

  const latestEffort = report?.effort?.[report.effort.length - 1] ?? null
  const risks = (report?.cacheRisks ?? []).slice(-5).reverse()

  const drift = report?.latest?.alignmentDrift ?? 0
  const unattributed = report?.latest?.unattributed?.value ?? 0
  const foldFailures = report?.foldFailures ?? 0
  const health = report?.health

  const issues: Array<{ level: 'warn' | 'error'; text: string }> = []
  if (health && !health.ok) {
    for (const f of health.failures) {
      issues.push({ level: 'error', text: `DSH 接口变更：${f.item}（${f.detail}）` })
    }
  }
  if (drift > 0.03) {
    issues.push({
      level: 'warn',
      text: `估算偏差 ${(drift * 100).toFixed(1)}% — 1-9 类为客户端估算`,
    })
  }
  if (unattributed > 0) {
    issues.push({
      level: 'warn',
      text: `未归因 ${Math.round(unattributed)} tokens`,
    })
  }
  if (foldFailures > 0) {
    issues.push({ level: 'error', text: `${foldFailures} 个事件解析失败` })
  }

  const cost = report?.latest?.cost
  const shortId = sessionId ? sessionId.slice(-6) : '—'

  return (
    <div ref={panelRef} className="dsh-to-root" style={rootStyle}>
      {/* header */}
      <header
        onMouseDown={startDrag}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: '13px 16px',
          borderBottom: `1px solid ${theme.border}`,
          background: theme.bg,
          cursor: 'grab',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: theme.accentSoft,
            color: theme.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <LogoIcon size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.005em' }}>
            Token Optima
          </div>
          <div
            style={{
              fontSize: 11,
              color: theme.textSecondary,
              marginTop: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                fontFamily: theme.fontMono,
                color: theme.textTertiary,
                fontSize: 10,
                letterSpacing: '0.02em',
              }}
            >
              #{shortId}
            </span>
            <span style={{ color: theme.textTertiary }}>·</span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={title}
            >
              {title || '未命名会话'}
            </span>
          </div>
        </div>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {sessions.length > 0 && (
            <select
              className="to-select"
              value={sessionId}
              onChange={(e) => onSessionChange(e.target.value)}
            >
              {sessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.sessionId.slice(-6)} · {s.turns}轮
                </option>
              ))}
              {!sessions.some((s) => s.sessionId === sessionId) && sessionId && (
                <option value={sessionId}>{shortId} · 当前</option>
              )}
            </select>
          )}
          <button
            className="to-icon-btn"
            onClick={handleExport}
            disabled={!sessionId || exporting || !report?.latest}
            title="导出 CSV"
          >
            <DownloadIcon size={15} />
          </button>
          <button className="to-icon-btn" onClick={onClose} title="关闭">
            <CloseIcon size={15} />
          </button>
        </div>
      </header>

      {/* body */}
      <div
        style={{
          overflowY: 'auto',
          padding: '14px 16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {!sessionId && (
          <Card theme={theme} style={{ textAlign: 'center', color: theme.textTertiary }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>
              <LogoIcon size={32} />
            </div>
            <div style={{ fontSize: 13 }}>等待会话激活...</div>
          </Card>
        )}

        {sessionId && !ready && (
          <Card theme={theme} style={{ textAlign: 'center', color: theme.textTertiary }}>
            <div style={{ display: 'inline-flex', marginBottom: 10, animation: 'to-spin 1s linear infinite' }}>
              <LogoIcon size={26} />
            </div>
            <div style={{ fontSize: 13 }}>加载中...</div>
          </Card>
        )}

        {ready && error && (
          <Card
            theme={theme}
            style={{
              borderColor: theme.dangerSoft,
              background: theme.dangerSoft,
              color: theme.danger,
              fontSize: 12,
            }}
          >
            {error}
          </Card>
        )}

        {ready && !error && !report?.latest && issues.length === 0 && (
          <Card theme={theme} style={{ textAlign: 'center', color: theme.textTertiary }}>
            <div style={{ fontSize: 26, marginBottom: 8, opacity: 0.35 }}>
              <SparkIcon size={30} />
            </div>
            <div style={{ fontSize: 13 }}>等待首次对话...</div>
          </Card>
        )}

        {ready && !error && issues.length > 0 && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: theme.warningSoft,
              border: `1px solid ${theme.warning}33`,
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
            }}
          >
            {issues.map((it, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 7,
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  color: it.level === 'error' ? theme.danger : theme.warning,
                }}
              >
                <span style={{ marginTop: 1, flexShrink: 0 }}>
                  <WarningIcon size={12} />
                </span>
                <span>{it.text}</span>
              </div>
            ))}
          </div>
        )}

        {ready && report?.latest && (
          <>
            {cost && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <StatCard
                  theme={theme}
                  label="本轮省下"
                  value={formatCurrency(cost.savedByCache)}
                  accent={theme.cache}
                  icon={<SparkIcon size={16} />}
                  sub={`累计 ${formatCurrency(totalSavedAllTime)}`}
                />
                <StatCard
                  theme={theme}
                  label="本轮花费"
                  value={formatCurrency(cost.total)}
                  accent={theme.text}
                  icon={<WalletIcon size={16} />}
                  sub={`累计 ${formatCurrency(totalCostAllTime)}`}
                />
              </div>
            )}

            {cost && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 9,
                  background: theme.bgElevated,
                  border: `1px solid ${theme.border}`,
                  fontSize: 11,
                  color: theme.textSecondary,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: cost.isPeak ? theme.warning : theme.success,
                      animation: 'to-pulse 2s ease-in-out infinite',
                    }}
                  />
                  {cost.isPeak ? '高峰时段' : '空闲时段'}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  命中率 {formatPercent(cacheHitRate, 1)}
                </span>
                <span style={{ color: theme.textTertiary, fontSize: 10 }}>
                  {cost.pricingVersion}
                </span>
              </div>
            )}

            <Card theme={theme}>
              <SectionLabel theme={theme}>Token 构成</SectionLabel>
              <Composition groups={groups} composition={composition} theme={theme} />
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <MiniMetric
                theme={theme}
                label="缓存块"
                primary={`${report.latest.cacheBlocks.hitBlocks} / ${report.latest.cacheBlocks.missBlocks + report.latest.cacheBlocks.writeCandidateBlocks}`}
                secondary={`命中 / 总计 · 写入候选 ${report.latest.cacheBlocks.writeCandidateBlocks}`}
              />
              <MiniMetric
                theme={theme}
                label="推理 Token"
                primary={`${formatNumber(report.latest.reasoning.producedThisTurn)}`}
                secondary={`回传 ${formatNumber(report.latest.reasoning.replayedInInput)}`}
              />
              <MiniMetric
                theme={theme}
                label="推理强度"
                primary={
                  latestEffort
                    ? latestEffort.decided === 'unsupported'
                      ? '不支持'
                      : latestEffort.decided
                    : '—'
                }
                secondary={
                  latestEffort && latestEffort.previous !== latestEffort.decided
                    ? `${latestEffort.previous} → ${latestEffort.decided}`
                    : latestEffort?.reason ?? '等待下次请求'
                }
              />
              <MiniMetric
                theme={theme}
                label="预算使用"
                primary={`${formatNumber(report.budget.usage.session)}`}
                secondary={`日 ${formatNumber(report.budget.usage.daily)} · 月 ${formatNumber(report.budget.usage.monthly)}`}
              />
            </div>

            <Card theme={theme}>
              <SectionLabel
                theme={theme}
                right={
                  risks.length > 0 ? (
                    <span
                      style={{
                        fontSize: 10,
                        color: theme.warning,
                        fontWeight: 500,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: theme.warningSoft,
                      }}
                    >
                      {risks.length}
                    </span>
                  ) : undefined
                }
              >
                缓存风险
              </SectionLabel>
              {risks.length === 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: theme.textTertiary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <span style={{ color: theme.success }}>
                    <SparkIcon size={13} />
                  </span>
                  前缀完整，无失效风险
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {risks.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: theme.bgElevated,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      <span
                        style={{
                          color: theme.warning,
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        <RiskIcon kind={r.kind} size={14} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            marginBottom: 2,
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>
                            {r.kind}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              color: theme.textTertiary,
                              fontFamily: theme.fontMono,
                            }}
                          >
                            {formatTime(r.at)}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: theme.textSecondary, lineHeight: 1.45 }}>
                          {r.detail}
                        </div>
                        {r.changedSources && r.changedSources.length > 0 && (
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 4,
                              marginTop: 5,
                            }}
                          >
                            {r.changedSources.map((s) => (
                              <span
                                key={s}
                                style={{
                                  fontSize: 9.5,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: theme.surfaceHover,
                                  color: theme.textSecondary,
                                  fontFamily: theme.fontMono,
                                }}
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {report.latest.cacheEvents.length > 0 && (
              <Card theme={theme}>
                <SectionLabel theme={theme}>本轮缓存事件</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {report.latest.cacheEvents.map((e, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 10.5,
                        padding: '3px 8px',
                        borderRadius: 5,
                        background: theme.warningSoft,
                        color: theme.warning,
                        fontWeight: 500,
                      }}
                    >
                      ⚡ {e.kind}
                      <span style={{ opacity: 0.6, marginLeft: 4 }}>#{e.atChunkIndex}</span>
                    </span>
                  ))}
                </div>
              </Card>
            )}

            <Card theme={theme}>
              <SectionLabel
                theme={theme}
                right={
                  <span style={{ fontSize: 10, color: theme.textTertiary }}>
                    近 {trend.length} 轮
                  </span>
                }
              >
                趋势
              </SectionLabel>
              <Trend entries={trend} theme={theme} />
            </Card>

            <Card theme={theme}>
              <details className="to-details">
                <summary
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11.5,
                    color: theme.textSecondary,
                    fontWeight: 500,
                  }}
                >
                  <span className="to-chevron">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                  历史轮次明细
                  <span style={{ color: theme.textTertiary, marginLeft: 4 }}>
                    · {historyList.length} 轮
                  </span>
                </summary>
                <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['#', '花费', '省下', '命中/未中'].map((h, i) => (
                          <th
                            key={h}
                            style={{
                              textAlign: i === 0 ? 'left' : 'right',
                              padding: '6px 0 8px',
                              fontSize: 10,
                              fontWeight: 500,
                              color: theme.textTertiary,
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...historyList].reverse().map((t, idx) => (
                        <tr
                          key={t.turnId}
                          style={{ borderTop: `1px solid ${theme.divider}` }}
                        >
                          <td
                            style={{
                              padding: '7px 0',
                              color: theme.textTertiary,
                              fontVariantNumeric: 'tabular-nums',
                              fontSize: 11,
                            }}
                          >
                            {historyList.length - idx}
                          </td>
                          <td
                            style={{
                              padding: '7px 0',
                              textAlign: 'right',
                              fontVariantNumeric: 'tabular-nums',
                              color: theme.text,
                            }}
                          >
                            {formatCurrency(t.cost?.total ?? 0)}
                          </td>
                          <td
                            style={{
                              padding: '7px 0',
                              textAlign: 'right',
                              fontVariantNumeric: 'tabular-nums',
                              color: theme.cache,
                            }}
                          >
                            {formatCurrency(t.cost?.savedByCache ?? 0)}
                          </td>
                          <td
                            style={{
                              padding: '7px 0',
                              textAlign: 'right',
                              fontVariantNumeric: 'tabular-nums',
                              color: theme.textSecondary,
                            }}
                          >
                            {t.cacheBlocks.hitBlocks}/
                            {t.cacheBlocks.missBlocks + t.cacheBlocks.writeCandidateBlocks}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </Card>
          </>
        )}
      </div>

      {/* footer */}
      {report?.tokenizer && (
        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '9px 16px',
            borderTop: `1px solid ${theme.border}`,
            fontSize: 10.5,
            color: theme.textTertiary,
            background: theme.bgElevated,
            fontFamily: theme.fontMono,
            flexShrink: 0,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background:
                  report.tokenizer.precision === 'exact' ? theme.success : theme.warning,
              }}
            />
            {report.tokenizer.id}
          </span>
          <span>{report.tokenizer.precision}</span>
        </footer>
      )}
    </div>
  )
}
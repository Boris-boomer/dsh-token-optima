import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Config } from '../config.js'
import { attributeTurn } from '../core/attribution.js'
import { EstimatedTokenizer, type TokenizerAdapter } from '../core/tokenizer.js'
import { ReasoningTracker } from '../core/reasoning.js'
import { CATEGORIES, CATEGORY_GROUPS } from '../core/categories.js'
import { toCsv } from './store-csv.js'
import type {
  AssignableSource,
  DeepSeekUsage,
  SourceSegment,
  TurnAttribution,
} from '../core/types.js'
import type { CacheChunk } from '../core/cache-model.js'
import { BudgetTracker } from '../core/budget.js'

interface SurfaceNode {
  seq: number
  source: AssignableSource
  text: string
  isReasoning: boolean
  tokens: number
}

interface InternalState {
  sessionId: string
  consumed: number
  surface: SurfaceNode[]
  header: unknown
  chunks: CacheChunk[] | null
  turns: TurnAttribution[]
  lastReasoningHash: string | null
  surfaceSignature: string | null
  surfaceLength: number
}

export interface CacheRisk {
  sessionId: string
  kind: 'append' | 'replace' | 'shrink' | 'compaction'
  at: number
  prevLen: number
  nextLen: number
  detail: string
}

export class SessionFold {
  private readonly byWeak = new WeakMap<object, InternalState>()
  private readonly byId = new Map<string, InternalState>()
  private readonly tokenizer: TokenizerAdapter
  private readonly reasoning: ReasoningTracker
  private readonly budget: BudgetTracker
  private readonly maxTurns: number

  private observedEventCount = 0
  private recentEventTypes: string[] = []
  private seenEventTypes = new Set<string>()
  private loggedShapes = new Set<unknown>()
  private foldFailures = 0

  private effortDecisions: Array<{
    sessionId: string
    previous: string
    decided: string
    reason: string
    at: number
  }> = []

  private reportedUnsupported = new Set<string>()

  private cacheRisks: CacheRisk[] = []

  constructor(private readonly ctx: Context, private readonly config: Config) {
    void ctx
    this.tokenizer = new EstimatedTokenizer()
    this.reasoning = new ReasoningTracker(config.hashSalt)
    this.budget = new BudgetTracker({
      session: config.budgetSession || undefined,
      daily: config.budgetDaily || undefined,
      monthly: config.budgetMonthly || undefined,
    })
    this.maxTurns = 200
  }

  /* ---------------- 诊断 ---------------- */

  noteEvent(line: string): void {
    this.observedEventCount++
    this.recentEventTypes.push(line)
    if (this.recentEventTypes.length > 500) {
      this.recentEventTypes.splice(0, this.recentEventTypes.length - 500)
    }
  }

  getObservedEventCount(): number {
    return this.observedEventCount
  }

  getRecentEventTypes(): string[] {
    return [...this.recentEventTypes]
  }

  getFoldFailures(): number {
    return this.foldFailures
  }

  getSeenEventTypes(): string[] {
    return [...this.seenEventTypes].sort()
  }

  /* ---------------- 对外查询 ---------------- */

  getBudgetTracker(): BudgetTracker {
    return this.budget
  }

  getCacheRisks(sessionId?: string): CacheRisk[] {
    if (sessionId) {
      return this.cacheRisks.filter((r) => r.sessionId === sessionId).slice(-20)
    }
    return this.cacheRisks.slice(-20)
  }

  hasReportedUnsupported(sessionId: string): boolean {
    return this.reportedUnsupported.has(sessionId)
  }

  markReportedUnsupported(sessionId: string): void {
    this.reportedUnsupported.add(sessionId)
  }

  recordEffortDecision(d: {
    sessionId: string
    previous: string
    decided: string
    reason: string
  }): void {
    this.effortDecisions.push({ ...d, at: Date.now() })
    if (this.effortDecisions.length > 100) {
      this.effortDecisions.splice(0, this.effortDecisions.length - 100)
    }
  }

  getEffortDecisions(sessionId?: string): Array<{
    sessionId: string
    previous: string
    decided: string
    reason: string
    at: number
  }> {
    if (sessionId) {
      return this.effortDecisions.filter((e) => e.sessionId === sessionId).slice(-20)
    }
    return this.effortDecisions.slice(-20)
  }

  /* ---------------- observe ---------------- */

  observe(session: unknown): void {
    if (!session || typeof session !== 'object') return
    const s = session as Record<string, unknown>

    const seq = typeof s['seq'] === 'number' ? (s['seq'] as number) : 0
    const eventAt = s['eventAt']

    const state = this.stateOf(s as object)

    if (!this.loggedShapes.has(session)) {
      this.loggedShapes.add(session)
      this.noteEvent(
        `OBSERVE: id=${state.sessionId} seq=${seq} hasEventAt=${typeof eventAt === 'function'}`,
      )
    }

    if (typeof eventAt !== 'function') return
    if (seq <= state.consumed) return

    let failures = 0

    while (state.consumed < seq) {
      const cursor = state.consumed

      let event: unknown
      try {
        event = (eventAt as (n: number) => unknown).call(s, cursor)
      } catch {
        failures++
        this.foldFailures++
        state.consumed = cursor + 1
        continue
      }

      if (event) {
        try {
          this.foldEvent(state, event as Record<string, unknown>)
        } catch {
          failures++
          this.foldFailures++
        }
      }

      state.consumed = cursor + 1
    }

    if (state.turns.length > 0) {
      this.noteEvent(
        `OBSERVE: done id=${state.sessionId} turns=${state.turns.length} failures=${failures}`,
      )
    }
  }

  private stateOf(session: object): InternalState {
    const cached = this.byWeak.get(session)
    if (cached) return cached

    const id = this.idOf(session)
    const existing = this.byId.get(id)
    if (existing) {
      this.byWeak.set(session, existing)
      return existing
    }

    const s: InternalState = {
      sessionId: id,
      consumed: 0,
      surface: [],
      header: null,
      chunks: null,
      turns: [],
      lastReasoningHash: null,
      surfaceSignature: null,
      surfaceLength: 0,
    }
    this.byWeak.set(session, s)
    this.byId.set(id, s)
    return s
  }

  private idOf(session: object): string {
    const s = session as Record<string, unknown>
    return String(s['id'] ?? s['sessionId'] ?? s['key'] ?? 'unknown')
  }

  /* ---------------- 事件折叠 ---------------- */

  private foldEvent(state: InternalState, event: Record<string, unknown>): void {
    const type = typeof event['type'] === 'string' ? (event['type'] as string) : ''
    if (type && !this.seenEventTypes.has(type)) {
      this.seenEventTypes.add(type)
    }

    const data = (event['data'] ?? {}) as Record<string, unknown>

    switch (type) {
      case 'request/header':
        state.header = data['header'] ?? null
        return

      case 'system/message':
      case 'user/message':
      case 'assistant/message':
      case 'tool/message':
      case 'tool/result': {
        this.applySurfaceOp(state, event)
        const node = this.buildSurfaceNode(event)
        if (node) state.surface.push(node)
        this.checkSurfaceChange(state)
        if (type === 'assistant/message') this.settleTurn(state, event)
        return
      }

      case 'compaction/summary':
      case 'compaction/prune': {
        const prevLen = state.surface.length
        this.recordCacheRisk({
          sessionId: state.sessionId,
          kind: 'compaction',
          at: Date.now(),
          prevLen,
          nextLen: 0,
          detail: type === 'compaction/summary' ? '上下文被摘要替换' : '上下文被裁剪',
        })
        state.chunks = null
        return
      }

      case 'llm/retry-started': {
        const turn = data['turn']
        const step = data['step']
        const last = state.surface[state.surface.length - 1]
        if (last && turn !== undefined && step !== undefined) {
          state.surface.pop()
          this.checkSurfaceChange(state)
        }
        return
      }

      default:
        return
    }
  }

  /**
   * 每次 surface 变动后调用。
   *
   * - 纯尾部追加 → 不破坏缓存
   * - 中间替换     → 破坏缓存
   * - 缩短 ≥ 2 条 → 破坏缓存（多半是 compaction）
   * - 缩短 1 条   → 忽略（llm/retry-started 的正常回退）
   */
  private checkSurfaceChange(state: InternalState): void {
    const seqs = state.surface.map((n) => n.seq)
    const nextSig = signatureOf(seqs)
    const nextLen = seqs.length

    if (state.surfaceSignature === null) {
      state.surfaceSignature = nextSig
      state.surfaceLength = nextLen
      return
    }

    if (nextSig === state.surfaceSignature) return

    const prevLen = state.surfaceLength
    state.surfaceSignature = nextSig
    state.surfaceLength = nextLen

    // 长度增加 → 纯追加（或替换后变长，但那种情况会紧接着 shrink/replace 事件）
    if (nextLen > prevLen) return

    if (nextLen < prevLen) {
      // 缩短 1 条多半是 llm/retry-started 的正常回退，不报
      if (prevLen - nextLen >= 2) {
        this.recordCacheRisk({
          sessionId: state.sessionId,
          kind: 'shrink',
          at: Date.now(),
          prevLen,
          nextLen,
          detail: `surface 从 ${prevLen} 条缩短到 ${nextLen} 条，下一轮缓存将部分失效`,
        })
      }
      return
    }

    this.recordCacheRisk({
      sessionId: state.sessionId,
      kind: 'replace',
      at: Date.now(),
      prevLen,
      nextLen,
      detail: 'surface 中间被替换，从其位置起的缓存前缀失效',
    })
  }

  private recordCacheRisk(r: CacheRisk): void {
    this.cacheRisks.push(r)
    if (this.cacheRisks.length > 100) {
      this.cacheRisks.splice(0, this.cacheRisks.length - 100)
    }
  }

  private applySurfaceOp(state: InternalState, event: Record<string, unknown>): void {
    const op = event['surfaceOp']
    if (!op || typeof op !== 'object') return
    const o = op as Record<string, unknown>
    if (o['startSeq'] === undefined || o['endSeq'] === undefined) return
    const start = Number(o['startSeq'])
    const end = Number(o['endSeq'])
    const startIdx = state.surface.findIndex((n) => n.seq === start)
    const endIdx = state.surface.findIndex((n) => n.seq === end)
    if (startIdx >= 0 && endIdx >= startIdx) {
      state.surface.splice(startIdx, endIdx - startIdx + 1)
    }
  }

  private buildSurfaceNode(event: Record<string, unknown>): SurfaceNode | null {
    const type = String(event['type'] ?? '')
    const seq = typeof event['seq'] === 'number' ? (event['seq'] as number) : -1
    if (seq < 0) return null

    const text = extractText(event)
    const source = classifySource(type, text)
    const isReasoning =
      type === 'assistant/message' && extractReasoningText(event).length > 0
    const tokens = text ? this.tokenizer.count(text) : 0
    return { seq, source, text, isReasoning, tokens }
  }

  /* ---------------- 单轮结算 ---------------- */

  private settleTurn(state: InternalState, event: Record<string, unknown>): void {
    const data = (event['data'] ?? {}) as Record<string, unknown>
    const usage = data['usage'] as Record<string, unknown> | undefined

    const segments: SourceSegment[] = state.surface
      .filter((n) => !n.isReasoning)
      .map((n) => ({
        source: n.source,
        text: n.text,
        tokenCount: n.tokens,
      }))

    const reasoningText = extractReasoningText(event)
    if (reasoningText) {
      segments.push({
        source: 'assistant_msg',
        text: reasoningText,
        isReasoning: true,
      })
    }

    const normalized = normalizeUsage(usage)
    const hasTools = !!(
      state.header &&
      typeof state.header === 'object' &&
      Array.isArray((state.header as Record<string, unknown>)['tools']) &&
      ((state.header as Record<string, unknown>)['tools'] as unknown[]).length > 0
    )

    const model = this.modelOf(state)

    const { attribution, chunks } = attributeTurn(
      `${state.sessionId}#${state.turns.length + 1}`,
      model,
      segments,
      normalized,
      this.tokenizer,
      {
        blockSize: this.config.blockSize,
        driftThreshold: this.config.driftThreshold,
        hashSalt: this.config.hashSalt,
        previousChunks: state.chunks,
        contextChanged: {
          systemPrompt: false,
          toolsSchema: false,
          model: false,
        },
        hasTools,
        reasoningContent: reasoningText || null,
      },
    )

    state.turns.push(attribution)
    if (state.turns.length > this.maxTurns) {
      state.turns.splice(0, state.turns.length - this.maxTurns)
    }
    state.chunks = chunks

    this.reasoning.record(
      attribution.turnId,
      reasoningText,
      attribution.reasoning.producedThisTurn,
      hasTools,
    )
    state.lastReasoningHash = attribution.reasoning.contentHash

    const total = normalized.prompt_tokens + normalized.completion_tokens
    this.budget.record(state.sessionId, total)
  }

  private modelOf(state: InternalState): string {
    const h = state.header
    if (h && typeof h === 'object') {
      const config = (h as Record<string, unknown>)['config']
      if (config && typeof config === 'object') {
        const model = (config as Record<string, unknown>)['model']
        if (typeof model === 'string' && model) return model
      }
    }
    return 'deepseek-chat'
  }

  /* ---------------- 报告 ---------------- */

  report(sessionId: string): {
    sessionId: string
    turns: number
    latest: TurnAttribution | null
    history: TurnAttribution[]
    budget: ReturnType<BudgetTracker['getState']>
    tokenizer: { id: string; precision: string }
    effort: Array<{
      sessionId: string
      previous: string
      decided: string
      reason: string
      at: number
    }>
    cacheRisks: CacheRisk[]
  } {
    const state = this.byId.get(sessionId)
    const turns = state?.turns ?? []
    return {
      sessionId,
      turns: turns.length,
      latest: turns[turns.length - 1] ?? null,
      history: turns,
      budget: this.budget.getState(sessionId),
      tokenizer: { id: this.tokenizer.id, precision: this.tokenizer.precision },
      effort: this.getEffortDecisions(sessionId),
      cacheRisks: this.getCacheRisks(sessionId),
    }
  }

  composition(sessionId: string): Array<{
    id: number
    key: string
    label: string
    group: string
    value: number
    precision: string
  }> {
    const state = this.byId.get(sessionId)
    const latest = state?.turns[state.turns.length - 1]
    if (!latest) return []
    return CATEGORIES.map((c) => {
      const m = latest.categories[c.id]
      return {
        id: c.id,
        key: c.key,
        label: c.label,
        group: c.group,
        value: m?.value ?? 0,
        precision: m?.precision ?? 'inferred',
      }
    })
  }

  groups(sessionId: string): Array<{ group: string; label: string; value: number }> {
    const comp = this.composition(sessionId)
    return CATEGORY_GROUPS.map((g) => ({
      group: g.group,
      label: g.label,
      value: g.ids.reduce((a, id) => a + (comp.find((c) => c.id === id)?.value ?? 0), 0),
    }))
  }

  listSessions(): Array<{ sessionId: string; turns: number; lastTs: number }> {
    const out: Array<{ sessionId: string; turns: number; lastTs: number }> = []
    for (const [id, state] of this.byId) {
      const last = state.turns[state.turns.length - 1]
      out.push({
        sessionId: id,
        turns: state.turns.length,
        lastTs: last?.timestamp ?? 0,
      })
    }
    out.sort((a, b) => b.lastTs - a.lastTs)
    return out
  }

  exportCsv(sessionId: string): string {
    const state = this.byId.get(sessionId)
    return toCsv(state?.turns ?? [])
  }

  tokenizerInfo(): { id: string; precision: string } {
    return { id: this.tokenizer.id, precision: this.tokenizer.precision }
  }

  audit(
    sessionId: string,
    messageId: string,
  ): {
    sessionId: string
    messageId: string
    content: string | null
    note: string
  } {
    const state = this.byId.get(sessionId)
    if (!state) {
      return { sessionId, messageId, content: null, note: 'session not tracked' }
    }
    const node = state.surface.find((n) => String(n.seq) === messageId)
    if (!node) {
      return {
        sessionId,
        messageId,
        content: null,
        note: 'message not found in current retained surface (may have been compacted)',
      }
    }
    return {
      sessionId,
      messageId,
      content: node.text,
      note: `source=${node.source} tokens=${node.tokens}`,
    }
  }

  dispose(): void {
    this.byId.clear()
    this.reasoning.reset()
    this.loggedShapes.clear()
    this.effortDecisions.length = 0
    this.reportedUnsupported.clear()
    this.cacheRisks.length = 0
  }
}

/* ---------------- 辅助 ---------------- */

function signatureOf(seqs: number[]): string {
  return createHash('sha1').update(seqs.join(',')).digest('hex').slice(0, 16)
}

const SURFACE_MARKERS_AGENTS = /AGENTS\.md/i
const SURFACE_MARKERS_SKILL = /(?:^|\n)\s*(?:#+\s*)?skills?[:\s]/i

function classifySource(type: string, text: string): AssignableSource {
  if (type === 'system/message') {
    if (SURFACE_MARKERS_AGENTS.test(text)) return 'agents_md'
    if (SURFACE_MARKERS_SKILL.test(text)) return 'skills'
    return 'system'
  }
  if (type === 'user/message') return 'user_msg'
  if (type === 'assistant/message') return 'assistant_msg'
  if (type === 'tool/message' || type === 'tool/result') return 'tool_result'
  return 'injected_ctx'
}

function extractText(event: Record<string, unknown>): string {
  const data = (event['data'] ?? {}) as Record<string, unknown>
  const msg = (data['message'] ?? data) as Record<string, unknown>
  const content = msg['content']
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const block of content) {
      if (typeof block === 'string') {
        parts.push(block)
        continue
      }
      if (block && typeof block === 'object') {
        const b = block as Record<string, unknown>
        const t = b['text']
        if (typeof t === 'string') parts.push(t)
      }
    }
    return parts.join('')
  }
  return ''
}

function extractReasoningText(event: Record<string, unknown>): string {
  const data = (event['data'] ?? {}) as Record<string, unknown>
  const stream = data['stream']
  if (!Array.isArray(stream)) return ''
  const parts: string[] = []
  for (const chunk of stream) {
    if (!chunk || typeof chunk !== 'object') continue
    const c = chunk as Record<string, unknown>
    if (c['type'] === 'reasoning' && typeof c['text'] === 'string') {
      parts.push(c['text'] as string)
    }
  }
  return parts.join('')
}

function normalizeUsage(usage: Record<string, unknown> | undefined): DeepSeekUsage {
  const input = numberOr(usage?.['inputTokens'], 0)
  const cacheRead = numberOr(usage?.['cacheReadTokens'], 0)
  const cacheWrite = numberOr(usage?.['cacheWriteTokens'], 0)
  const output = numberOr(usage?.['outputTokens'], 0)

  const prompt = input + cacheRead + cacheWrite
  const miss = input + cacheWrite

  const details = usage?.['completion_tokens_details'] as
    | Record<string, unknown>
    | undefined
  const reasoning =
    numberOr(details?.['reasoning_tokens'], 0) ||
    numberOr(usage?.['reasoningTokens'], 0)

  return {
    prompt_tokens: prompt,
    prompt_cache_hit_tokens: cacheRead,
    prompt_cache_miss_tokens: miss,
    completion_tokens: output,
    completion_tokens_details: {
      reasoning_tokens: reasoning,
    },
  }
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
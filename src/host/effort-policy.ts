import type { Context } from '@deepseek-ai/cordis'
import type { Config } from '../config.js'
import type { SessionFold } from './session-fold.js'
import type { HealthProbe } from './health-probe.js'
import { classifyComplexity, extractSignals, type EffortLevel } from '../core/effort.js'

const VALID_LEVELS: ReadonlySet<string> = new Set(['low', 'high', 'max'])

function isLevel(s: unknown): s is EffortLevel {
  return typeof s === 'string' && VALID_LEVELS.has(s)
}

function downgradeOne(level: string): EffortLevel {
  if (level === 'max') return 'high'
  if (level === 'high') return 'low'
  return 'low'
}

function extractLatestUserText(session: unknown): string {
  if (!session || typeof session !== 'object') return ''
  const s = session as Record<string, unknown>
  const surface = s['surface'] as Record<string, unknown> | undefined
  const nodes = surface?.['nodes']
  if (!Array.isArray(nodes)) return ''
  const eventAt = s['eventAt']
  if (typeof eventAt !== 'function') return ''

  for (let i = nodes.length - 1; i >= 0; i--) {
    const seq = nodes[i]
    if (typeof seq !== 'number') continue
    let ev: unknown
    try {
      ev = (eventAt as (n: number) => unknown).call(s, seq)
    } catch {
      continue
    }
    if (!ev || typeof ev !== 'object') continue
    const e = ev as Record<string, unknown>
    if (e['type'] !== 'user/message') continue

    const data = (e['data'] ?? {}) as Record<string, unknown>
    const msg = (data['message'] ?? data) as Record<string, unknown>
    const content = msg['content']
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      const parts: string[] = []
      for (const b of content) {
        if (typeof b === 'string') parts.push(b)
        else if (b && typeof b === 'object') {
          const t = (b as Record<string, unknown>)['text']
          if (typeof t === 'string') parts.push(t)
        }
      }
      return parts.join('')
    }
    return ''
  }
  return ''
}

interface Decision {
  level: string
  reason: string
}

function decideEffort(
  fold: SessionFold,
  config: Config,
  sessionId: string,
  currentEffort: string,
  session: unknown,
  toolCalls: number,
): Decision {
  const advice = fold.getBudgetTracker().advise(sessionId)
  if (advice.downgrade) {
    const target = downgradeOne(currentEffort)
    if (target !== currentEffort) {
      return { level: target, reason: advice.reason }
    }
    return { level: currentEffort, reason: 'budget no-op' }
  }

  if (!config.dynamicEffort) {
    return { level: currentEffort, reason: 'dynamic-effort disabled' }
  }

  const userText = extractLatestUserText(session)
  if (!userText) {
    return { level: currentEffort, reason: 'no user text' }
  }

  const signals = extractSignals(
    [{ source: 'user_msg', text: userText }],
    toolCalls,
    null,
  )
  const decided = classifyComplexity(signals)

  if (isLevel(decided) && decided !== currentEffort) {
    return {
      level: decided,
      reason: `complexity heuristic (userTokens=${signals.userTokens} toolCalls=${toolCalls})`,
    }
  }
  return {
    level: currentEffort,
    reason: `keep (heuristic=${decided} userTokens=${signals.userTokens} toolCalls=${toolCalls})`,
  }
}

/* ---------------- adapter 探测 ---------------- */

interface EffortProbeResult {
  efforts: string[]
  defaultEffort: string
}

const effortProbeCache = new Map<string, EffortProbeResult | null>()

function safeGetLlm(rootCtx: unknown, ctx: unknown): unknown {
  const tryGet = (c: unknown): unknown => {
    if (!c || typeof c !== 'object') return undefined
    try {
      const getFn = (c as { get?: unknown }).get
      if (typeof getFn === 'function') {
        const r = (getFn as (k: string) => unknown).call(c, 'llm')
        if (r !== undefined) return r
      }
    } catch {
      // ignore
    }
    return undefined
  }
  return tryGet(rootCtx) ?? tryGet(ctx) ?? undefined
}

/**
 * 探测 adapter 支持的 effort level 列表。
 *
 * 防御性解析：
 * - info.reasoning 不存在 → 返回 null（adapter 不支持，本环境 amd-radeon 即如此）
 * - efforts 里元素是字符串或 { id: string } 都接受
 * - 抛错也返回 null
 */
async function resolveModelEfforts(
  llm: unknown,
  provider: string,
  model: string,
  signal: AbortSignal | undefined,
): Promise<EffortProbeResult | null> {
  if (!llm || typeof llm !== 'object') return null
  const fn = (llm as Record<string, unknown>)['resolveModelInfo']
  if (typeof fn !== 'function') return null

  try {
    const info = await (
      fn as (p: string, m: string, s?: AbortSignal) => Promise<unknown>
    ).call(llm, provider, model, signal)

    if (!info || typeof info !== 'object') return null
    const r = (info as Record<string, unknown>)['reasoning']
    if (!r || typeof r !== 'object') return null

    const ro = r as Record<string, unknown>
    const raw = ro['efforts']
    if (!Array.isArray(raw)) return null

    const efforts: string[] = []
    for (const e of raw) {
      if (typeof e === 'string') {
        efforts.push(e)
      } else if (e && typeof e === 'object') {
        const id = (e as Record<string, unknown>)['id']
        if (typeof id === 'string') efforts.push(id)
      }
    }
    if (efforts.length === 0) return null

    const defRaw = ro['defaultEffort']
    const def =
      typeof defRaw === 'string' && efforts.includes(defRaw) ? defRaw : efforts[0]!

    return { efforts, defaultEffort: def }
  } catch {
    return null
  }
}

/* ---------------- 安装 ---------------- */

export function installEffortPolicy(
  ctx: Context,
  config: Config,
  fold: SessionFold,
  health: HealthProbe,
): void {
  const rootCtx = ((ctx as unknown as { root?: Context }).root ?? ctx) as Context

  const llmService = safeGetLlm(rootCtx, ctx)
  fold.noteEvent(
    llmService
      ? 'EFFORT-POLICY: llm service available, probe enabled'
      : 'EFFORT-POLICY: llm service not found, probe disabled',
  )

  const makeHandler = () => {
    return async (
      payload: unknown,
      next: () => Promise<unknown>,
    ): Promise<unknown> => {
      const seed = await next()
      try {
        if (!seed || typeof seed !== 'object') return seed
        const p = (payload ?? {}) as Record<string, unknown>
        const signal = p['signal'] as AbortSignal | undefined
        if (signal?.aborted) return seed

        const agent = p['agent'] as Record<string, unknown> | undefined
        const session = agent?.['session']
        const sessionId =
          session && typeof session === 'object'
            ? String((session as Record<string, unknown>)['id'] ?? '')
            : ''
        if (!sessionId) return seed

        fold.setCurrentSession(sessionId)

        const toolCalls = fold.getToolCallCount(sessionId)

        const seedObj = seed as Record<string, unknown>

        // --------- 已知 effort：走复杂度 / 预算路径 ---------
        if (typeof seedObj['reasoningEffort'] === 'string') {
          const currentEffort = seedObj['reasoningEffort'] as string
          const decision = decideEffort(
            fold,
            config,
            sessionId,
            currentEffort,
            session,
            toolCalls,
          )
          fold.recordEffortDecision({
            sessionId,
            previous: currentEffort,
            decided: decision.level,
            reason: decision.reason,
          })
          if (decision.level !== currentEffort) {
            return { ...seedObj, reasoningEffort: decision.level }
          }
          return seed
        }

        // --------- 未知 effort：尝试探测 adapter 能力 ---------
        const provider =
          typeof seedObj['provider'] === 'string' ? (seedObj['provider'] as string) : ''
        const model =
          typeof seedObj['model'] === 'string' ? (seedObj['model'] as string) : ''

        if (llmService && provider && model) {
          const cacheKey = `${provider}#${model}`
          let probe = effortProbeCache.get(cacheKey)
          if (probe === undefined) {
            probe = await resolveModelEfforts(llmService, provider, model, signal)
            effortProbeCache.set(cacheKey, probe)
          }

          if (probe) {
            const userText = extractLatestUserText(session)
            const signals = extractSignals(
              [{ source: 'user_msg', text: userText }],
              toolCalls,
              null,
            )
            const decided = classifyComplexity(signals)
            const target = probe.efforts.includes(decided)
              ? decided
              : probe.defaultEffort

            fold.recordEffortDecision({
              sessionId,
              previous: 'n/a',
              decided: target,
              reason: `injected reasoningEffort=${target} (supported=[${probe.efforts.join(',')}])`,
            })

            return { ...seedObj, reasoningEffort: target }
          }
        }

        // --------- 探测失败 / adapter 不支持 ---------
        fold.recordEffortDecision({
          sessionId,
          previous: 'n/a',
          decided: 'unsupported',
          reason: '当前模型未启用 reasoningEffort 控制',
        })
        return seed
      } catch (err) {
        fold.noteEvent(`EFFORT-POLICY: error ${(err as Error).message}`)
      }
      return seed
    }
  }

  const handlerCtx = makeHandler()
  const handlerRoot = makeHandler()

  try {
    ;(ctx as unknown as { on: (name: string, fn: unknown) => void }).on(
      'agent/request',
      handlerCtx,
    )
    fold.noteEvent('EFFORT-POLICY: attached on ctx')
  } catch (err) {
    fold.noteEvent(`EFFORT-POLICY: ctx attach failed: ${(err as Error).message}`)
  }

  if (rootCtx !== ctx) {
    try {
      ;(rootCtx as unknown as { on: (name: string, fn: unknown) => void }).on(
        'agent/request',
        handlerRoot,
      )
      fold.noteEvent('EFFORT-POLICY: attached on root (2nd)')
    } catch (err) {
      fold.noteEvent(`EFFORT-POLICY: root attach failed: ${(err as Error).message}`)
    }
  }

  health.checkEffortPolicy(true)
}
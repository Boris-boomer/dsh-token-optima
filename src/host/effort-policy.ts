import type { Context } from '@deepseek-ai/cordis'
import type { Config } from '../config.js'
import type { SessionFold } from './session-fold.js'
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

  const signals = extractSignals([{ source: 'user_msg', text: userText }], 0, null)
  const decided = classifyComplexity(signals)

  if (isLevel(decided) && decided !== currentEffort) {
    return {
      level: decided,
      reason: `complexity heuristic (userTokens=${signals.userTokens})`,
    }
  }
  return { level: currentEffort, reason: `keep (heuristic=${decided})` }
}

export function installEffortPolicy(
  ctx: Context,
  config: Config,
  fold: SessionFold,
): void {
  const rootCtx = ((ctx as unknown as { root?: Context }).root ?? ctx) as Context

  fold.noteEvent('EFFORT-POLICY: install called')

  const handler = async (
    payload: unknown,
    next: () => Promise<unknown>,
  ): Promise<unknown> => {
    // 每次触发都记一行
    let payloadKeys = ''
    try {
      if (payload && typeof payload === 'object') {
        payloadKeys = Object.keys(payload as object).join(',')
      }
    } catch {
      payloadKeys = '<unreadable>'
    }
    fold.noteEvent(`EFFORT-POLICY: agent/request FIRED keys=[${payloadKeys}]`)

    const seed = await next()
    try {
      if (!seed || typeof seed !== 'object') {
        fold.noteEvent('EFFORT-POLICY: seed not object')
        return seed
      }
      const p = (payload ?? {}) as Record<string, unknown>
      const signal = p['signal'] as AbortSignal | undefined
      if (signal?.aborted) {
        fold.noteEvent('EFFORT-POLICY: signal aborted')
        return seed
      }

      const agent = p['agent'] as Record<string, unknown> | undefined
      if (!agent) {
        fold.noteEvent('EFFORT-POLICY: no agent in payload')
        return seed
      }
      const session = agent['session']
      const sessionId =
        session && typeof session === 'object'
          ? String((session as Record<string, unknown>)['id'] ?? '')
          : ''
      if (!sessionId) {
        fold.noteEvent('EFFORT-POLICY: no sessionId')
        return seed
      }

      const seedObj = seed as Record<string, unknown>
      const seedEffort = seedObj['reasoningEffort']
      fold.noteEvent(
        `EFFORT-POLICY: session=${sessionId} seedEffort=${String(seedEffort)}`,
      )

      if (typeof seedEffort !== 'string') {
        if (!fold.hasReportedUnsupported(sessionId)) {
          fold.markReportedUnsupported(sessionId)
          fold.recordEffortDecision({
            sessionId,
            previous: 'n/a',
            decided: 'unsupported',
            reason: '当前模型未启用 reasoningEffort 控制',
          })
        }
        return seed
      }

      const decision = decideEffort(fold, config, sessionId, seedEffort, session)
      fold.recordEffortDecision({
        sessionId,
        previous: seedEffort,
        decided: decision.level,
        reason: decision.reason,
      })
      fold.noteEvent(
        `EFFORT-POLICY: ${seedEffort} -> ${decision.level} (${decision.reason})`,
      )

      if (decision.level !== seedEffort) {
        return { ...seedObj, reasoningEffort: decision.level }
      }
    } catch (err) {
      fold.noteEvent(`EFFORT-POLICY: error ${(err as Error).message}`)
    }
    return seed
  }

  try {
    rootCtx.on('agent/request', handler)
    fold.noteEvent('EFFORT-POLICY: attached on root')
  } catch (err) {
    fold.noteEvent(`EFFORT-POLICY: root attach failed: ${(err as Error).message}`)
  }
}
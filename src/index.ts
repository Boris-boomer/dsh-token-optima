import type { Context } from '@deepseek-ai/cordis'
import {
  Remote,
  TypertRemoteService,
  remoteMethods,
} from '@deepseek-ai/dsh-typert-protocol'
import { Config, type Config as ConfigType } from './config.js'
import { SessionFold } from './host/session-fold.js'
import { HealthProbe } from './host/health-probe.js'
import { registerTools } from './host/tools.js'
import { installEffortPolicy } from './host/effort-policy.js'
import {
  resolveTokenizer,
  loadHfTokenizer,
  type TokenizerAdapter,
} from './core/tokenizer.js'

export const name = 'dsh-token-optima'
export const inject = ['tools']

export { Config, NS } from './config.js'
export type { Config as TokenOptimaConfig } from './config.js'

export * from './core/index.js'
export { SessionFold } from './host/session-fold.js'
export type { CacheRisk } from './host/session-fold.js'
export { HealthProbe } from './host/health-probe.js'
export type { HealthReport, HealthFailure } from './host/health-probe.js'

interface LooseCtx {
  on: (name: string, fn: (...args: unknown[]) => unknown) => void
  emit: (name: string, ...args: unknown[]) => void
  get?: (key: string, fallback?: unknown) => unknown
  root?: unknown
  effect?: <T>(execute: () => T, label?: string) => T
}

class TokenOptimaController extends TypertRemoteService {
  constructor(
    ctx: Context,
    private readonly fold: SessionFold,
    private readonly replayFn: () => void,
  ) {
    super(ctx, 'tokenOptima', { namespace: 'tokenOptima' })
  }

  @Remote
  async report(sessionId: string): Promise<unknown> {
    return this.fold.report(sessionId)
  }

  @Remote
  async composition(sessionId: string): Promise<unknown> {
    return this.fold.composition(sessionId)
  }

  @Remote
  async groups(sessionId: string): Promise<unknown> {
    return this.fold.groups(sessionId)
  }

  @Remote
  async listSessions(): Promise<unknown> {
    return this.fold.listSessions()
  }

  @Remote
  async exportCsv(sessionId: string): Promise<string> {
    return this.fold.exportCsv(sessionId)
  }

  @Remote
  async audit(sessionId: string, messageId: string): Promise<unknown> {
    return this.fold.audit(sessionId, messageId)
  }

  @Remote
  async tokenizerInfo(): Promise<unknown> {
    return this.fold.tokenizerInfo()
  }

  @Remote
  async getEffortDecisions(sessionId: string): Promise<unknown> {
    return this.fold.getEffortDecisions(sessionId)
  }

  @Remote
  async getCacheRisks(sessionId: string): Promise<unknown> {
    return this.fold.getCacheRisks(sessionId)
  }

  @Remote
  async ensureSession(): Promise<number> {
    const before = this.fold.listSessions().length
    this.replayFn()
    const after = this.fold.listSessions().length
    return after - before
  }

  @Remote
  async debugEventCount(): Promise<number> {
    if (!this.fold.isDebug()) return -1
    return this.fold.getObservedEventCount()
  }

  @Remote
  async debugLastEvents(): Promise<string[]> {
    if (!this.fold.isDebug()) return []
    return this.fold.getRecentEventTypes()
  }
}

function safeGet(obj: unknown, key: string): unknown {
  if (obj == null || typeof obj !== 'object') return undefined
  try {
    return Reflect.get(obj as object, key)
  } catch {
    return undefined
  }
}

function getServiceSafe(c: unknown, key: string): unknown {
  try {
    const getFn = (c as LooseCtx)?.get
    if (typeof getFn === 'function') {
      return getFn.call(c, key, false)
    }
  } catch {
    // ignore
  }
  return undefined
}

/**
 * 优先从环境变量指定的路径加载 tokenizer.json + tokenizer_config.json；
 * 任一文件缺失或加载失败时降级到字符估算。
 *
 *    DSH_TOKENIZER_JSON    tokenizer.json 路径（必需才启用 exact）
 *    DSH_TOKENIZER_CONFIG  tokenizer_config.json 路径（推荐，缺省也能工作）
 */
async function resolveHostTokenizer(): Promise<TokenizerAdapter> {
  const jsonPath = process.env.DSH_TOKENIZER_JSON
  if (!jsonPath) {
    const resolved = await resolveTokenizer()
    if (resolved.warning) {
      console.warn(`[dsh-token-optima] tokenizer: ${resolved.warning}`)
    }
    return resolved.tokenizer
  }

  const configPath = process.env.DSH_TOKENIZER_CONFIG

  try {
    const enc = await loadHfTokenizer(jsonPath, configPath)
    const resolved = await resolveTokenizer({ hfLoader: async () => enc })
    if (resolved.warning) {
      console.warn(`[dsh-token-optima] ${resolved.warning}`)
    }
    return resolved.tokenizer
  } catch (err) {
    const resolved = await resolveTokenizer()
    if (resolved.warning) {
      console.warn(
        `[dsh-token-optima] HF tokenizer load failed (${(err as Error).message}); ` +
        `falling back to estimation.`,
      )
    }
    return resolved.tokenizer
  }
}

export function apply(ctx: Context, config: ConfigType): void {
  const health = new HealthProbe()

  // 先挂一个估算 fold，精确 tokenizer 就绪后通过 setTokenizer 原地升级。
  //
  // 关键设计：fold 实例只创建一次。控制器 / effort-policy / tools 都持有
  // 同一个 fold 引用，所以「运行期升级 tokenizer」不能换实例，只能改内部字段，
  // 否则面板查的还是旧 fold，永远是 0 turns。
  const fold = new SessionFold(ctx, config, health)
  let disposed = false

  fold.noteEvent('APPLY: entered')

  void resolveHostTokenizer()
    .then((tokenizer) => {
      if (disposed) return
      if (tokenizer.precision === 'exact') {
        fold.setTokenizer(tokenizer)
        fold.noteEvent(`APPLY: exact tokenizer ready (${tokenizer.id})`)
      } else {
        fold.noteEvent(`APPLY: tokenizer fallback (${tokenizer.id})`)
      }
    })
    .catch((err) => {
      fold.noteEvent(`APPLY: tokenizer init error ${(err as Error).message}`)
    })

  if (!config.enabled) {
    fold.noteEvent('APPLY: disabled by config')
    return
  }

  const rootCtx = (safeGet(ctx, 'root') as Context | undefined) ?? ctx
  fold.noteEvent(`APPLY: rootCtx same as ctx = ${rootCtx === ctx}`)

  const checkSessionsSvc = (): void => {
    try {
      const svc = getServiceSafe(rootCtx, 'sessions') ?? getServiceSafe(ctx, 'sessions')
      health.checkSessionsService(svc)
    } catch (err) {
      health.fail('sessions 服务', `探测抛错：${(err as Error).message}`)
    }
  }

  const replay = (): void => {
    try {
      const sessionsSvc = getServiceSafe(rootCtx, 'sessions') ?? getServiceSafe(ctx, 'sessions')
      health.checkSessionsService(sessionsSvc)
      if (!sessionsSvc || typeof sessionsSvc !== 'object') {
        fold.noteEvent('REPLAY: sessions service not found')
        return
      }

      const svc = sessionsSvc as Record<string, unknown>
      const lists: unknown[][] = []
      for (const method of ['list', 'all', 'entries', 'values']) {
        try {
          const fn = svc[method]
          if (typeof fn === 'function') {
            const r = (fn as () => unknown).call(sessionsSvc)
            if (Array.isArray(r)) lists.push(r)
            else if (r instanceof Map) lists.push([...r.values()])
            else if (r && typeof r === 'object' && Symbol.iterator in r) {
              lists.push([...(r as Iterable<unknown>)])
            }
          }
        } catch {
          // ignore
        }
      }
      for (const prop of ['sessions', 'map', 'items', 'store', 'registry']) {
        try {
          const v = svc[prop]
          if (v instanceof Map) lists.push([...v.values()])
          else if (Array.isArray(v)) lists.push(v)
        } catch {
          // ignore
        }
      }

      let observed = 0
      const seen = new Set<unknown>()
      for (const list of lists) {
        for (const s of list) {
          if (!s || typeof s !== 'object' || seen.has(s)) continue
          seen.add(s)
          try {
            fold.observe(s)
            observed++
          } catch {
            // ignore
          }
        }
      }
      if (observed > 0) {
        fold.noteEvent(`REPLAY: observed=${observed} lists=${lists.length}`)
      }
    } catch (err) {
      fold.noteEvent(`REPLAY: error ${(err as Error).message}`)
    }
  }

  if (!getServiceSafe(ctx, 'tokenOptima')) {
    const controller = new TokenOptimaController(ctx, fold, replay)
    try {
      const methods = remoteMethods(controller)
      console.log(`[dsh-token-optima] loaded (${methods.length} remote methods)`)
    } catch {
      console.log('[dsh-token-optima] loaded')
    }
  } else {
    fold.noteEvent('APPLY: tokenOptima already registered, skipping controller')
    console.log('[dsh-token-optima] tokenOptima service already exists, skipping duplicate registration.')
  }

  installEffortPolicy(ctx, config, fold, health)

  const loose = ctx as unknown as LooseCtx

  const kick = (): void => {
    try {
      loose.emit('internal/service')
    } catch {
      // ignore
    }
    try {
      const gw = getServiceSafe(ctx, 'typertGateway') as Record<string, unknown> | undefined
      if (gw) gw['srcClaims'] = undefined
    } catch {
      // ignore
    }
  }

  // 所有定时器/监听器统一交给 ctx.effect 管理，热重载与卸载时自动回收
  const effect = loose.effect
  if (typeof effect === 'function') {
    effect(() => {
      const timers: Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>> = []
      timers.push(setTimeout(kick, 100))
      timers.push(setTimeout(kick, 1000))
      timers.push(setTimeout(kick, 5000))

      timers.push(setTimeout(replay, 500))
      timers.push(setTimeout(replay, 2000))
      timers.push(setTimeout(replay, 6000))

      timers.push(setInterval(replay, 5000))
      timers.push(setInterval(checkSessionsSvc, 30_000))

      return () => {
        for (const t of timers) {
          clearTimeout(t as ReturnType<typeof setTimeout>)
          clearInterval(t as ReturnType<typeof setInterval>)
        }
      }
    }, 'token-optima/timers')

    effect(() => {
      const handler = (s: unknown): void => {
        try {
          fold.observe(s)
        } catch (err) {
          fold.noteEvent(`EVENT: plugin-ctx error ${(err as Error).message}`)
        }
      }
      loose.on('session/event', handler)

      const rootHandler = (s: unknown): void => {
        try {
          fold.observe(s)
        } catch (err) {
          fold.noteEvent(`EVENT: root-ctx error ${(err as Error).message}`)
        }
      }
      let rootAttached = false
      if (rootCtx !== ctx) {
        ;(rootCtx as unknown as LooseCtx).on('session/event', rootHandler)
        rootAttached = true
      }

      return () => {
        // Cordis 通常会自动清理通过 ctx.on 注册的监听器；
        // 这里显式保留 disposer，避免不同版本行为差异。
        void handler
        void rootHandler
        void rootAttached
      }
    }, 'token-optima/session-event')

    effect(() => {
      return () => {
        disposed = true
        health.dispose()
        fold.dispose()
      }
    }, 'token-optima/dispose')
  } else {
    // 极老版本 Cordis 没有 effect：退化为手动清理，但保留 dispose 钩子
    setTimeout(kick, 100)
    setTimeout(kick, 1000)
    setTimeout(kick, 5000)
    setTimeout(replay, 500)
    setTimeout(replay, 2000)
    setTimeout(replay, 6000)

    const replayTimer = setInterval(replay, 5000)
    const healthTimer = setInterval(checkSessionsSvc, 30_000)

    loose.on('session/event', (s: unknown) => {
      try {
        fold.observe(s)
      } catch (err) {
        fold.noteEvent(`EVENT: plugin-ctx error ${(err as Error).message}`)
      }
    })
    if (rootCtx !== ctx) {
      ;(rootCtx as unknown as LooseCtx).on('session/event', (s: unknown) => {
        try {
          fold.observe(s)
        } catch (err) {
          fold.noteEvent(`EVENT: root-ctx error ${(err as Error).message}`)
        }
      })
    }

    loose.on('dispose', () => {
      disposed = true
      clearInterval(replayTimer)
      clearInterval(healthTimer)
      health.dispose()
      fold.dispose()
    })
  }

  if (config.inlineTools) {
    registerTools(ctx, fold)
  }
}
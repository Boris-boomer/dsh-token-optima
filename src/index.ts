import type { Context } from '@deepseek-ai/cordis'
import {
  Remote,
  TypertRemoteService,
  remoteMethods,
} from '@deepseek-ai/dsh-typert-protocol'
import { Config, type Config as ConfigType } from './config.js'
import { SessionFold } from './host/session-fold.js'
import { registerTools } from './host/tools.js'
import { installEffortPolicy } from './host/effort-policy.js'

export const name = 'dsh-token-optima'

export { Config, NS } from './config.js'
export type { Config as TokenOptimaConfig } from './config.js'

export * from './core/index.js'
export { SessionFold } from './host/session-fold.js'
export type { CacheRisk } from './host/session-fold.js'

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
  async debugEventCount(): Promise<number> {
    return this.fold.getObservedEventCount()
  }

  @Remote
  async debugLastEvents(): Promise<string[]> {
    return this.fold.getRecentEventTypes()
  }

  /** client 主动要求重放当前 session（幂等） */
  @Remote
  async ensureSession(): Promise<number> {
    const before = this.fold.listSessions().length
    this.replayFn()
    const after = this.fold.listSessions().length
    return after - before
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

export function apply(ctx: Context, config: ConfigType): void {
  const fold = new SessionFold(ctx, config)

  fold.noteEvent('APPLY: entered')

  if (!config.enabled) {
    fold.noteEvent('APPLY: disabled by config')
    return
  }

  const rootCtx = (safeGet(ctx, 'root') as Context | undefined) ?? ctx
  fold.noteEvent(`APPLY: rootCtx same as ctx = ${rootCtx === ctx}`)

  const replay = (): void => {
    try {
      const sessionsSvc: any =
        (rootCtx as any).get?.('sessions') ?? (ctx as any).get?.('sessions')
      if (!sessionsSvc) {
        fold.noteEvent('REPLAY: sessions service not found')
        return
      }

      const lists: unknown[][] = []
      for (const method of ['list', 'all', 'entries', 'values']) {
        try {
          const fn = sessionsSvc[method]
          if (typeof fn === 'function') {
            const r = fn.call(sessionsSvc)
            if (Array.isArray(r)) lists.push(r)
            else if (r instanceof Map) lists.push([...r.values()])
            else if (r && typeof r[Symbol.iterator] === 'function') lists.push([...r])
          }
        } catch {
          // ignore
        }
      }
      for (const prop of ['sessions', 'map', 'items', 'store', 'registry']) {
        try {
          const v = sessionsSvc[prop]
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

  const controller = new TokenOptimaController(rootCtx, fold, replay)

  installEffortPolicy(ctx, config, fold)

  const kick = (): void => {
    try {
      ctx.emit('internal/service')
    } catch {
      // ignore
    }
    try {
      const gw: any = (ctx as any).get?.('typertGateway')
      if (gw) gw.srcClaims = undefined
    } catch {
      // ignore
    }
  }
  setTimeout(kick, 100)
  setTimeout(kick, 1000)
  setTimeout(kick, 5000)

  // 首次立即 + 启动后快速重试
  setTimeout(replay, 500)
  setTimeout(replay, 2000)
  setTimeout(replay, 6000)

  // 持续每 5 秒 replay 一次（幂等，覆盖懒加载）
  const replayTimer = setInterval(replay, 5000)

  // 实时 session/event 订阅
  ctx.on('session/event', (s: unknown) => {
    try {
      fold.observe(s)
    } catch (err) {
      fold.noteEvent(`EVENT: plugin-ctx error ${(err as Error).message}`)
    }
  })

  if (rootCtx !== ctx) {
    rootCtx.on('session/event', (s: unknown) => {
      try {
        fold.observe(s)
      } catch (err) {
        fold.noteEvent(`EVENT: root-ctx error ${(err as Error).message}`)
      }
    })
  }

  if (config.inlineTools) {
    registerTools(ctx, fold)
  }

  ctx.on('dispose', () => {
    clearInterval(replayTimer)
    fold.dispose()
  })

  try {
    const methods = remoteMethods(controller)
    console.log(`[dsh-token-optima] loaded (${methods.length} remote methods)`)
  } catch {
    console.log('[dsh-token-optima] loaded')
  }
}

export default { name, apply, Config }
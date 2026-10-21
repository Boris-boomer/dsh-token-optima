import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { SessionFold } from '../src/host/session-fold.js'
import type { Config } from '../src/config.js'
import type { HealthProbe } from '../src/host/health-probe.js'
import type { Context } from '@deepseek-ai/cordis'

// --- Mock 依赖 ---
const mockCtx = {} as Context
const mockConfig = {
  enabled: true,
  blockSize: 64,
  driftThreshold: 0.03,
  hashSalt: 'test-salt',
  budgetSession: 0,
  budgetDaily: 0,
  budgetMonthly: 0,
  reasoningEffort: 'high',
  inlineTools: true,
  dynamicEffort: true,
  debug: false,
} as Config

const mockHealth = {
  checkSession: vi.fn(),
  snapshot: () => ({ at: Date.now(), ok: true, failures: [] }),
} as unknown as HealthProbe

/**
 * 计费断言必须固定时间，否则 isPeakHour() 取决于跑测试的时刻：
 *   北京时间周一至周五 9:00–12:00、14:00–18:00 = 高峰
 *   其余（含周末）= 空闲，价格为高峰的 50%
 *
 * 统一固定在「北京时间 2026-10-21（周三）10:00」= 高峰时段。
 */
const PEAK_TIME = new Date('2026-10-21T10:00:00+08:00').getTime()

describe('SessionFold', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(PEAK_TIME)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should fold events correctly and calculate cost', () => {
    const fold = new SessionFold(mockCtx, mockConfig, mockHealth)
    const sessionId = 'test-session-1'

    // 模拟 DSH 的 Session 对象
    const events = [
      { type: 'request/header', data: { header: { config: { model: 'deepseek-chat' } } } },
      { type: 'user/message', seq: 1, data: { message: { content: 'Hello' } } },
      {
        type: 'assistant/message',
        seq: 2,
        data: {
          message: { content: 'Hi there' },
          usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 100 },
        },
      },
    ]

    const mockSession = {
      id: sessionId,
      seq: events.length,
      eventAt: (n: number) => events[n],
    }

    fold.observe(mockSession)

    const report = fold.report(sessionId)

    // 验证事件是否被正确消费
    expect(report.turns).toBe(1)
    expect(fold.getObservedEventCount()).toBeGreaterThan(0)

    // 验证费用计算
    // deepseek-chat 按 PRICING_TABLE 映射到 flash 口径：
    //   高峰   hit 0.006, miss 0.30, output 1.20 (per 1M)
    //   空闲   hit 0.003, miss 0.15, output 0.60 (per 1M)
    // 归一化后：prompt=110, cache_hit=100, cache_miss=10, completion=5
    //
    // 高峰时段：
    //   100 hit    = 100 * 0.006 / 1M = 0.0000006
    //    10 miss   =  10 * 0.30  / 1M = 0.0000030
    //     5 output =   5 * 1.20  / 1M = 0.0000060
    //   total = 0.0000096
    expect(report.latest?.cost?.total).toBeCloseTo(0.0000096, 8)
    expect(report.latest?.cost?.isPeak).toBe(true)
    expect(report.latest?.cost?.pricingVersion).toBeTruthy()

    // 缓存省下: 100 * (miss - hit) / 1M = 100 * (0.30 - 0.006) / 1M = 0.0000294
    expect(report.latest?.cost?.savedByCache).toBeCloseTo(0.0000294, 8)
  })

  it('should apply off-peak pricing outside peak hours', () => {
    // 北京时间 2026-10-21（周三）20:00 = 空闲时段
    vi.setSystemTime(new Date('2026-10-21T20:00:00+08:00').getTime())

    const fold = new SessionFold(mockCtx, mockConfig, mockHealth)
    const sessionId = 'test-session-offpeak'

    const events = [
      { type: 'request/header', data: { header: { config: { model: 'deepseek-chat' } } } },
      { type: 'user/message', seq: 1, data: { message: { content: 'Hello' } } },
      {
        type: 'assistant/message',
        seq: 2,
        data: {
          message: { content: 'Hi there' },
          usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 100 },
        },
      },
    ]

    const mockSession = {
      id: sessionId,
      seq: events.length,
      eventAt: (n: number) => events[n],
    }

    fold.observe(mockSession)
    const report = fold.report(sessionId)

    // 空闲时段价格为高峰的 50%：
    //   100 hit    = 100 * 0.003 / 1M = 0.0000003
    //    10 miss   =  10 * 0.15  / 1M = 0.0000015
    //     5 output =   5 * 0.60  / 1M = 0.0000030
    //   total = 0.0000048
    expect(report.latest?.cost?.total).toBeCloseTo(0.0000048, 8)
    expect(report.latest?.cost?.isPeak).toBe(false)

    // 缓存省下: 100 * (0.15 - 0.003) / 1M = 0.0000147
    expect(report.latest?.cost?.savedByCache).toBeCloseTo(0.0000147, 8)
  })

  it('should track tool calls and cache risks (shrink)', () => {
    const fold = new SessionFold(mockCtx, mockConfig, mockHealth)
    const sessionId = 'test-session-2'

    // 构造一个真实的 shrink 场景：长度从 4 骤降到 2
    const events = [
      { type: 'tool/call', data: {} },
      { type: 'tool/result', seq: 1, data: { message: { content: 'a' } } },
      { type: 'user/message', seq: 2, data: { message: { content: 'b' } } },
      { type: 'assistant/message', seq: 3, data: { message: { content: 'c' } } },
      { type: 'tool/result', seq: 4, data: { message: { content: 'd' } } },
      // 此时 surface 长度为 4。
      // 模拟收到 assistant 消息，同时 surfaceOp 删除了 1,2,3 三个节点（新加入的 5 替代它们）
      // 最终 surface 长度变为 2 (节点 4 和 5)，prevLen(4) - nextLen(2) = 2，触发 shrink
      {
        type: 'assistant/message',
        seq: 5,
        surfaceOp: { startSeq: 1, endSeq: 3 },
        data: { message: { content: 'e' } },
      },
    ]

    const mockSession = {
      id: sessionId,
      seq: events.length,
      eventAt: (n: number) => events[n],
    }

    fold.observe(mockSession)

    expect(fold.getToolCallCount(sessionId)).toBe(1)
    const risks = fold.getCacheRisks(sessionId)
    expect(risks.length).toBeGreaterThan(0)

    // 因为事件序列被中间截断了，长度真的变短了，所以必然是 shrink
    expect(risks[0]?.kind).toBe('shrink')
    // 检查归因的 source 是否正确抓到了被删除的 tool_result 或 user_msg
    expect(risks[0]?.changedSources).toContain('tool_result')
  })
})
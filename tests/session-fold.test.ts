import { describe, it, expect, vi } from 'vitest'
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

describe('SessionFold', () => {
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
          usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 100 } 
        } 
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
    expect(report.latest?.cost).toBeDefined()
    // 按 deepseek-chat 费率：hit 0.014, miss 0.14, output 0.28 (per 1M)
    // 100 hit = 100 * 0.014 / 1M = 0.0000014
    // 10 miss = 10 * 0.14 / 1M = 0.0000014
    // 5 output = 5 * 0.28 / 1M = 0.0000014
    // total = 0.0000042
    expect(report.latest?.cost?.total).toBeCloseTo(0.0000042, 6)
    // 缓存省下: 100 * (0.14 - 0.014) / 1M = 0.0000126
    expect(report.latest?.cost?.savedByCache).toBeCloseTo(0.0000126, 6)
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
        data: { message: { content: 'e' } } 
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
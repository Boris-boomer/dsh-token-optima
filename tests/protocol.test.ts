import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  HOST_CAPABILITIES,
  envelope,
  isCompatible,
} from '../src/client/protocol.js';
import { renderDonut, renderStackedBars, renderTurnTable } from '../src/client/render-svg.js';
import { computeCost, StaticPricingAdapter } from '../src/pricing/index.js';

describe('协议', () => {
  it('envelope 带版本号', () => {
    const e = envelope('hello', { x: 1 });
    expect(e.v).toBe(PROTOCOL_VERSION);
    expect(e.type).toBe('hello');
  });

  it('主版本一致才兼容', () => {
    expect(isCompatible('1.0.0')).toBe(true);
    expect(isCompatible('1.5.0')).toBe(true);
    expect(isCompatible('2.0.0')).toBe(false);
  });

  it('能力清单包含 SSE/WS', () => {
    expect(HOST_CAPABILITIES.transport).toContain('sse');
    expect(HOST_CAPABILITIES.transport).toContain('websocket');
  });
});

describe('SVG 渲染', () => {
  it('圆环面板返回合法 SVG', () => {
    const svg = renderDonut([
      { group: 'input', label: '输入', value: 100 },
      { group: 'cache', label: '缓存', value: 50 },
    ], { size: 200 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('<circle');
  });

  it('趋势图带压缩/失效标记', () => {
    const svg = renderStackedBars([
      {
        turnId: 't1', timestamp: Date.now(), compressed: true, cacheInvalidated: true,
        groups: [
          { group: 'input', label: '输入', value: 100 },
          { group: 'output', label: '输出', value: 30 },
        ],
      },
    ]);
    expect(svg).toContain('✂');
    expect(svg).toContain('⚡');
  });

  it('明细表返回合法 HTML', () => {
    const html = renderTurnTable([
      { id: 1, key: 'system', label: '系统提示词', group: 'input', value: 100, precision: 'exact' },
    ]);
    expect(html).toContain('<table');
  });
});

describe('费率适配器', () => {
  const adapter = new StaticPricingAdapter({
    'deepseek-chat': {
      currency: 'CNY',
      cacheHitInputPerM: 0.1,
      cacheMissInputPerM: 1,
      outputPerM: 2,
      reasoningPerM: 0,
    },
  });

  it('正确计算成本', () => {
    const cost = computeCost(adapter, 'deepseek-chat', {
      cacheHitInput: 1_000_000,
      cacheMissInput: 1_000_000,
      cacheWriteCandidate: 0,
      output: 500_000,
      reasoning: 0,
    });
    expect(cost.currency).toBe('CNY');
    expect(cost.cacheHitInput).toBeCloseTo(0.1);
    expect(cost.cacheMissInput).toBeCloseTo(1);
    expect(cost.output).toBeCloseTo(1);
    expect(cost.total).toBeCloseTo(2.1);
  });

  it('未知模型返回 unknown', () => {
    const cost = computeCost(adapter, 'unknown-model', {
      cacheHitInput: 0, cacheMissInput: 0, cacheWriteCandidate: 0, output: 0, reasoning: 0,
    });
    expect(cost.unknown).toBe(true);
  });

  it('缓存写入候选不参与计费', () => {
    const cost = computeCost(adapter, 'deepseek-chat', {
      cacheHitInput: 0,
      cacheMissInput: 0,
      cacheWriteCandidate: 1_000_000,
      output: 0,
      reasoning: 0,
    });
    expect(cost.total).toBe(0);
    expect(cost.notes.some((n) => n.includes('not billed'))).toBe(true);
  });
});
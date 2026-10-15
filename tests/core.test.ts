import { describe, expect, it } from 'vitest';
import { attributeTurn } from '../src/core/attribution.js';
import { EstimatedTokenizer } from '../src/core/tokenizer.js';
import { buildChunks, compareChunks } from '../src/core/cache-model.js';
import type { DeepSeekUsage, SourceSegment } from '../src/core/types.js';

const tokenizer = new EstimatedTokenizer();

const baseSegments: SourceSegment[] = [
  { source: 'system', text: 'You are a helpful assistant.' },
  { source: 'user_msg', text: 'Hello there, how are you today?' },
];

function usage(over: Partial<DeepSeekUsage> = {}): DeepSeekUsage {
  return {
    prompt_tokens: 100,
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 100,
    completion_tokens: 50,
    completion_tokens_details: { reasoning_tokens: 20 },
    ...over,
  };
}

describe('坐标式归因', () => {
  it('第 10/12 类严格等于 API 真值', () => {
    const { attribution } = attributeTurn(
      't1',
      'deepseek-chat',
      baseSegments,
      usage({ prompt_cache_hit_tokens: 40, prompt_cache_miss_tokens: 60 }),
      tokenizer,
    );
    expect(attribution.categories[10]!.value).toBe(40);
    expect(attribution.categories[10]!.precision).toBe('exact');
    expect(attribution.categories[12]!.value).toBe(60);
    expect(attribution.categories[12]!.precision).toBe('exact');
  });

  it('第 13 + 14 类等于 completion_tokens', () => {
    const { attribution } = attributeTurn(
      't1',
      'deepseek-chat',
      baseSegments,
      usage({ completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 20 } }),
      tokenizer,
    );
    expect(attribution.categories[13]!.value + attribution.categories[14]!.value).toBe(50);
    expect(attribution.categories[14]!.value).toBe(20);
  });

  it('第 1–9 类之和不超过 prompt_tokens', () => {
    const { attribution } = attributeTurn(
      't1',
      'deepseek-chat',
      baseSegments,
      usage({ prompt_tokens: 100 }),
      tokenizer,
    );
    let sum = 0;
    for (let i = 1; i <= 9; i++) sum += attribution.categories[i]!.value;
    expect(sum).toBeLessThanOrEqual(100);
    expect(sum + attribution.unattributed.value).toBe(100);
  });

  it('无 reasoning_tokens 字段时降级为推断', () => {
    const { attribution } = attributeTurn(
      't1',
      'deepseek-chat',
      baseSegments,
      {
        prompt_tokens: 100,
        prompt_cache_hit_tokens: 0,
        prompt_cache_miss_tokens: 100,
        completion_tokens: 50,
      },
      tokenizer,
      { reasoningContent: 'thinking...' },
    );
    expect(attribution.categories[14]!.precision).toBe('inferred');
  });
});

describe('缓存建模', () => {
  const ctx = {
    modelId: 'deepseek-chat',
    tokenizerId: tokenizer.id,
    systemPromptHash: 'sys',
    toolsSchemaHash: 'tools',
  };

  it('相同前缀 → 块哈希一致', () => {
    const text = 'a'.repeat(2000);
    const c1 = buildChunks(text, tokenizer, ctx);
    const c2 = buildChunks(text, tokenizer, ctx);
    expect(c1.map((c) => c.hash)).toEqual(c2.map((c) => c.hash));
  });

  it('追加消息 → 已有前缀块全部命中', () => {
    const prefix = 'b'.repeat(2000);
    const c1 = buildChunks(prefix, tokenizer, ctx);
    const c2 = buildChunks(prefix + 'new content appended here', tokenizer, ctx);

    const { verdicts } = compareChunks(c2, c1, {
      systemPrompt: false,
      toolsSchema: false,
      model: false,
    });

    const commonLen = Math.min(c1.length, c2.length);
    for (let i = 0; i < commonLen - 1; i++) {
      expect(verdicts[i]).toBe('hit');
    }
  });

  it('中间内容变更 → 从变更点起全部未命中', () => {
    const head = 'h'.repeat(1500);
    const tail = 't'.repeat(1500);

    const c1 = buildChunks(head + tail, tokenizer, ctx);
    const c2 = buildChunks(head + 'CHANGED' + tail, tokenizer, ctx);

    const { verdicts, events } = compareChunks(c2, c1, {
      systemPrompt: false,
      toolsSchema: false,
      model: false,
    });

    // 前缀部分应当命中
    expect(verdicts[0]).toBe('hit');
    // 从第一个非 hit 开始，之后不应再出现 hit
    const firstNonHit = verdicts.findIndex((v) => v !== 'hit');
    expect(firstNonHit).toBeGreaterThan(0);
    if (firstNonHit >= 0) {
      const afterBreak = verdicts.slice(firstNonHit);
      expect(afterBreak.includes('hit')).toBe(false);
    }
    expect(events.some((e) => e.kind === 'prefix_broken')).toBe(true);
  });

  it('system prompt 变更 → 全部失效', () => {
    const text = 'x'.repeat(2000);
    const c1 = buildChunks(text, tokenizer, ctx);
    const c2 = buildChunks(text, tokenizer, ctx);

    const { verdicts, events } = compareChunks(c2, c1, {
      systemPrompt: true,
      toolsSchema: false,
      model: false,
    });

    expect(verdicts.every((v) => v !== 'hit')).toBe(true);
    expect(events.some((e) => e.kind === 'system_prompt_changed')).toBe(true);
  });

  it('不足 64 token 的尾块永不命中', () => {
    const short = 'short text';
    const chunks = buildChunks(short, tokenizer, ctx);
    const { verdicts } = compareChunks(chunks, chunks, {
      systemPrompt: false,
      toolsSchema: false,
      model: false,
    });
    expect(verdicts.every((v) => v !== 'hit')).toBe(true);
  });
});

describe('对齐', () => {
  it('偏差在阈值内时，1–9 类之和 = prompt_tokens', () => {
    const estimate = baseSegments.reduce(
      (a, s) => a + tokenizer.count(s.text),
      0,
    );
    const { attribution } = attributeTurn(
      't1',
      'deepseek-chat',
      baseSegments,
      usage({ prompt_tokens: estimate }),
      tokenizer,
      { driftThreshold: 0.5 },
    );
    let sum = 0;
    for (let i = 1; i <= 9; i++) sum += attribution.categories[i]!.value;
    expect(sum).toBe(estimate);
    expect(attribution.unattributed.value).toBe(0);
  });
});
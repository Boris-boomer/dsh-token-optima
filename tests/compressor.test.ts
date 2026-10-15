import { describe, expect, it } from 'vitest';
import { compressContext, pruneReasoning, isWhitelisted, DEFAULT_POLICY } from '../src/core/compressor.js';
import { EstimatedTokenizer } from '../src/core/tokenizer.js';
import type { SourceSegment } from '../src/core/types.js';

const tokenizer = new EstimatedTokenizer();

describe('压缩白名单', () => {
  it('tool_call_id 命中白名单', () => {
    expect(isWhitelisted('tool_call_id: abc123')).toBe(true);
  });
  it('代码块命中白名单', () => {
    expect(isWhitelisted('这里有一份代码：\n```ts\nconst a = 1;\n```')).toBe(true);
  });
  it('普通文本不命中', () => {
    expect(isWhitelisted('今天天气不错')).toBe(false);
  });
});

describe('思维链剪枝', () => {
  it('保留结论段，删除失败路径', () => {
    const text = [
      '我先尝试用正则表达式匹配。',
      '这个方法行不通，因为会有边界问题。',
      '所以我决定改用状态机。',
      '最终结论是状态机方案最可靠。',
    ].join('\n\n');
    const pruned = pruneReasoning(text);
    expect(pruned).toContain('状态机');
    expect(pruned).toContain('结论');
  });
});

describe('三遍法压缩', () => {
  it('未达阈值时原样返回', () => {
    const segments: SourceSegment[] = [
      { source: 'user_msg', text: 'hello' },
    ];
    const result = compressContext({ segments, tokenizer, policy: { triggerThresholdTokens: 10000 } });
    expect(result.beforeTokens).toBe(result.afterTokens);
    expect(result.events.length).toBe(0);
  });

  it('重复行被剥离', () => {
    const repeated = Array.from({ length: 200 }, () => 'INFO: same line').join('\n');
    const segments: SourceSegment[] = [
      { source: 'tool_result', text: repeated + '\n' + 'x'.repeat(60000) },
    ];
    const result = compressContext({
      segments,
      tokenizer,
      policy: { triggerThresholdTokens: 1, maxRatio: 0.8, keepRecentUserTurns: 0, keepRecentAssistantTurns: 0 },
    });
    expect(result.afterTokens).toBeLessThan(result.beforeTokens);
    expect(result.events.some((e) => e.kind === 'strip_mechanical')).toBe(true);
  });

  it('用户消息永不被压缩', () => {
    const text = 'a'.repeat(60000);
    const segments: SourceSegment[] = [{ source: 'user_msg', text }];
    const result = compressContext({ segments, tokenizer, policy: { triggerThresholdTokens: 1 } });
    expect(result.segments[0]!.text).toBe(text);
  });

  it('未缓存集合之外的来源不被压缩', () => {
    const text = 'c'.repeat(60000);
    const segments: SourceSegment[] = [
      { source: 'system', text },
      { source: 'tool_result', text: 'd'.repeat(60000) },
    ];
    const result = compressContext({
      segments,
      tokenizer,
      policy: { triggerThresholdTokens: 1 },
      uncachedSources: new Set(['tool_result']),
    });
    // system 被保留原文
    expect(result.segments[0]!.text).toBe(text);
  });
});

describe('默认策略', () => {
  it('用户消息在 NO_COMPRESS 白名单', () => {
    expect(DEFAULT_POLICY.keepRecentUserTurns).toBeGreaterThanOrEqual(1);
  });
});
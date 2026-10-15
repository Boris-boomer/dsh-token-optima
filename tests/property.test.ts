import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildChunks, compareChunks, CACHE_BLOCK_SIZE } from '../src/core/cache-model.js';
import { EstimatedTokenizer } from '../src/core/tokenizer.js';

const tokenizer = new EstimatedTokenizer();
const ctx = {
  modelId: 'deepseek-chat',
  tokenizerId: tokenizer.id,
  systemPromptHash: 'sys',
  toolsSchemaHash: 'tools',
};

describe('属性测试', () => {
  it('前缀哈希幂等性', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2000 }), (text) => {
        const a = buildChunks(text, tokenizer, ctx);
        const b = buildChunks(text, tokenizer, ctx);
        return a.map((c) => c.hash).join(',') === b.map((c) => c.hash).join(',');
      }),
      { numRuns: 30 },
    );
  });

  it('追加内容不破坏已有前缀块的哈希', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 100, maxLength: 500 }),
        fc.string({ maxLength: 200 }),
        (prefix, suffix) => {
          const a = buildChunks(prefix, tokenizer, ctx);
          const b = buildChunks(prefix + suffix, tokenizer, ctx);
          const n = Math.min(a.length, b.length);
          for (let i = 0; i < n; i++) {
            const ca = a[i]!;
            const cb = b[i]!;
            // 只比较完整块（>= 64 token）；不完整块的边界依赖总长度
            if (!ca.complete || !cb.complete) continue;
            if (ca.hash !== cb.hash) return false;
          }
          return true;
        },
      ),
      { numRuns: 30 },
    );
  });

  it('块切分覆盖完整文本，无空洞', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 1000 }), (text) => {
        const chunks = buildChunks(text, tokenizer, ctx);
        if (chunks.length === 0) return true;
        if (chunks[0]!.start !== 0) return false;
        if (chunks[chunks.length - 1]!.end !== text.length) return false;
        for (let i = 1; i < chunks.length; i++) {
          if (chunks[i]!.start !== chunks[i - 1]!.end) return false;
        }
        return true;
      }),
      { numRuns: 30 },
    );
  });

  it('同一文本比对自身 → 全部命中或不足 64 的尾块未命中', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 300, maxLength: 800 }), (text) => {
        const chunks = buildChunks(text, tokenizer, ctx);
        const { verdicts } = compareChunks(chunks, chunks, {
          systemPrompt: false, toolsSchema: false, model: false,
        });
        for (let i = 0; i < chunks.length; i++) {
          const c = chunks[i]!;
          if (c.complete && verdicts[i] !== 'hit') return false;
        }
        return true;
      }),
      { numRuns: 30 },
    );
  });

  it('CACHE_BLOCK_SIZE 是 64', () => {
    expect(CACHE_BLOCK_SIZE).toBe(64);
  });
});
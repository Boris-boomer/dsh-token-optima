// 直接运行：pnpm demo
// 用模拟 usage 跑通完整归因流程，无需 API Key

import { attributeTurn } from '../src/core/attribution.js';
import { EstimatedTokenizer } from '../src/core/tokenizer.js';
import { CATEGORIES } from '../src/core/categories.js';
import { compressContext } from '../src/core/compressor.js';
import type { DeepSeekUsage, SourceSegment } from '../src/core/types.js';

const tokenizer = new EstimatedTokenizer();

const segments: SourceSegment[] = [
  { source: 'system', text: 'You are a helpful assistant running in DSH.' },
  {
    source: 'tools_schema',
    text: JSON.stringify({
      name: 'read_file',
      description: 'Read a file from disk',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    }),
  },
  { source: 'agents_md', text: '# AGENTS.md\n\nProject rules go here.\n' },
  { source: 'user_msg', text: '帮我看看 src/index.ts 里有什么。' },
  {
    source: 'tool_result',
    text: 'export function main() {\n  console.log("hello");\n}\n',
  },
];

const usage1: DeepSeekUsage = {
  prompt_tokens: 220,
  prompt_cache_hit_tokens: 0,
  prompt_cache_miss_tokens: 220,
  completion_tokens: 64,
  completion_tokens_details: { reasoning_tokens: 40 },
};

const r1 = attributeTurn('turn-1', 'deepseek-chat', segments, usage1, tokenizer);

console.log('=== 第 1 轮 ===');
printCategories(r1.attribution.categories);
console.log('缓存块:', r1.attribution.cacheBlocks);
console.log('对齐偏差:', r1.attribution.alignmentDrift.toFixed(4));
console.log('矩阵:', r1.attribution.matrix);
console.log();

/* --- 第 2 轮：追加消息，前缀应命中 --- */

const segments2: SourceSegment[] = [
  ...segments,
  { source: 'assistant_msg', text: 'src/index.ts 导出了 main()。' },
  { source: 'user_msg', text: '那再帮我看看 package.json。' },
];

const usage2: DeepSeekUsage = {
  prompt_tokens: 300,
  prompt_cache_hit_tokens: 190,
  prompt_cache_miss_tokens: 110,
  completion_tokens: 88,
  completion_tokens_details: { reasoning_tokens: 52 },
};

const r2 = attributeTurn('turn-2', 'deepseek-chat', segments2, usage2, tokenizer, {
  previousChunks: r1.chunks,
});

console.log('=== 第 2 轮 ===');
printCategories(r2.attribution.categories);
console.log('缓存块:', r2.attribution.cacheBlocks);
console.log('缓存事件:', r2.attribution.cacheEvents);
console.log();

/* --- 第 3 轮：system prompt 变更，全部失效 --- */

const segments3: SourceSegment[] = [
  { source: 'system', text: 'You are a RELIABLE assistant running in DSH.' },
  ...segments.slice(1),
  { source: 'assistant_msg', text: 'src/index.ts 导出了 main()。' },
  { source: 'user_msg', text: '那再帮我看看 package.json。' },
];

const usage3: DeepSeekUsage = {
  prompt_tokens: 302,
  prompt_cache_hit_tokens: 0,
  prompt_cache_miss_tokens: 302,
  completion_tokens: 70,
  completion_tokens_details: { reasoning_tokens: 30 },
};

const r3 = attributeTurn('turn-3', 'deepseek-chat', segments3, usage3, tokenizer, {
  previousChunks: r2.chunks,
  contextChanged: { systemPrompt: true, toolsSchema: false, model: false },
});

console.log('=== 第 3 轮（system prompt 变更）===');
printCategories(r3.attribution.categories);
console.log('缓存块:', r3.attribution.cacheBlocks);
console.log('缓存事件:', r3.attribution.cacheEvents);
console.log();

/* --- 第 4 轮：演示压缩器 --- */

const longSegments: SourceSegment[] = [
  { source: 'system', text: 'You are helpful.' },
  { source: 'user_msg', text: '请分析下面的日志。' },
  {
    source: 'tool_result',
    text: Array.from({ length: 500 }, () => 'INFO: repeated log line').join('\n') + '\n' + 'x'.repeat(70000),
  },
];

const comp = compressContext({
  segments: longSegments,
  tokenizer,
  policy: { triggerThresholdTokens: 100, maxRatio: 0.8, keepRecentUserTurns: 1 },
  uncachedSources: new Set(['tool_result']),
});

console.log('=== 压缩器 ===');
console.log(`  before: ${comp.beforeTokens} tokens`);
console.log(`  after:  ${comp.afterTokens} tokens`);
console.log(`  events: ${comp.events.map((e) => e.kind).join(', ') || '(none)'}`);
console.log(`  user 消息保留:`, comp.segments[1]!.text === longSegments[1]!.text);

/* ------------------------------------------------------------------ */

function printCategories(categories: Record<number, { value: number; precision: string }>) {
  for (const c of CATEGORIES) {
    const m = categories[c.id];
    if (!m) continue;
    const tag = m.precision === 'exact' ? '实测' : m.precision === 'inferred' ? '推断' : '估算';
    console.log(
      `  ${String(c.id).padStart(2)}. ${c.label.padEnd(14, '　')} ${String(m.value).padStart(6)} tokens  [${tag}]`,
    );
  }
}
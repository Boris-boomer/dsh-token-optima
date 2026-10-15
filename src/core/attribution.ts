// 坐标式归因引擎主流程

import { createHash } from 'node:crypto';
import type {
  AssignableSource,
  DeepSeekUsage,
  Measured,
  Precision,
  ReasoningSnapshot,
  SourceMatrixEntry,
  SourceSegment,
  TokenSource,
  TurnAttribution,
} from './types.js';
import { measured } from './types.js';
import type { TokenizerAdapter } from './tokenizer.js';
import {
  CACHE_BLOCK_SIZE,
  buildChunks,
  compareChunks,
  distributeChunksBySource,
  summarizeBlocks,
  type CacheChunk,
  type ChunkContext,
  type ContextChanged,
  type SegmentLayout,
  type SourceCacheTally,
} from './cache-model.js';

export interface AttributionOptions {
  blockSize?: number;
  driftThreshold?: number;
  hashSalt?: string;
  previousChunks?: CacheChunk[] | null;
  contextChanged?: ContextChanged;
  hasTools?: boolean;
  reasoningContent?: string | null;
  replayedReasoningTokens?: number;
}

export interface AttributionResult {
  attribution: TurnAttribution;
  chunks: CacheChunk[];
}

export function attributeTurn(
  turnId: string,
  model: string,
  segments: SourceSegment[],
  usage: DeepSeekUsage,
  tokenizer: TokenizerAdapter,
  options: AttributionOptions = {},
): AttributionResult {
  const blockSize = options.blockSize ?? CACHE_BLOCK_SIZE;
  const driftThreshold = options.driftThreshold ?? 0.03;
  const salt = options.hashSalt ?? '';

  // 阶段一：请求组装前逐段计数
  const layout: SegmentLayout[] = [];
  const parts: string[] = [];
  let offset = 0;
  for (const seg of segments) {
    const tokens = seg.tokenCount ?? tokenizer.count(seg.text);
    layout.push({
      source: seg.source,
      start: offset,
      end: offset + seg.text.length,
      tokens,
      isReasoning: seg.isReasoning === true,
    });
    parts.push(seg.text);
    offset += seg.text.length;
  }
  const fullText = parts.join('');

  // 阶段三：64 token 块级归因
  const systemText = segments.find((s) => s.source === 'system')?.text ?? '';
  const toolsText = segments
    .filter((s) => s.source === 'tools_schema' || s.source === 'mcp_tools')
    .map((s) => s.text)
    .join('\u0000');

  const chunkCtx: ChunkContext = {
    modelId: model,
    tokenizerId: tokenizer.id,
    systemPromptHash: hashOf(systemText, salt),
    toolsSchemaHash: hashOf(toolsText, salt),
  };
  const chunks = buildChunks(fullText, tokenizer, chunkCtx, blockSize);

  const { verdicts, events } = compareChunks(
    chunks,
    options.previousChunks ?? null,
    options.contextChanged ?? { systemPrompt: false, toolsSchema: false, model: false },
  );
  const tally = distributeChunksBySource(chunks, verdicts, layout);

  // 阶段二 + 对齐：用 API usage 真值做校准
  const promptTokens = usage.prompt_tokens ?? 0;
  const hitTruth = usage.prompt_cache_hit_tokens ?? 0;
  const missTruth =
    usage.prompt_cache_miss_tokens ?? Math.max(0, promptTokens - hitTruth);

  const estimatedBySource = new Map<TokenSource, number>();
  for (const seg of layout) {
    estimatedBySource.set(
      seg.source,
      (estimatedBySource.get(seg.source) ?? 0) + seg.tokens,
    );
  }
  const estimatedTotal = sumValues(estimatedBySource);
  const alignmentDrift =
    promptTokens > 0 && estimatedTotal > 0
      ? Math.abs(estimatedTotal - promptTokens) / promptTokens
      : 0;

  // 命中/未命中的原始估算
  const hitBySource = new Map<TokenSource, number>();
  const missBySource = new Map<TokenSource, number>();
  for (const t of tally) {
    if (t.hit > 0) hitBySource.set(t.source, t.hit);
    if (t.miss > 0) missBySource.set(t.source, t.miss);
  }

  // 对齐决策：drift 在阈值内 → 按比例缩放到 API 真值
  //           drift 超阈     → 保留原始估算，残差归入 unattributed
  let alignedBySource: Map<TokenSource, number>;
  let alignedHit: Map<TokenSource, number>;
  let alignedMiss: Map<TokenSource, number>;
  let unattributedValue = 0;

  const inThreshold = estimatedTotal > 0 && alignmentDrift <= driftThreshold;

  if (estimatedTotal <= 0) {
    // 无客户端估算：全部归入 unattributed
    alignedBySource = new Map();
    alignedHit = new Map();
    alignedMiss = new Map();
    unattributedValue = promptTokens;
    if (unattributedValue > 0) {
      alignedBySource.set('unattributed', unattributedValue);
      alignedMiss.set('unattributed', unattributedValue);
    }
  } else if (inThreshold) {
    // 客户端估算可信：所有维度按比例缩放到 API 真值
    alignedBySource = scaleToTarget(estimatedBySource, promptTokens);
    alignedHit = scaleToTarget(hitBySource, hitTruth);
    alignedMiss = scaleToTarget(missBySource, missTruth);
  } else {
    // 客户端估算不可信：保留原始值，残差归入 unattributed
    alignedBySource = new Map(estimatedBySource);
    alignedHit = new Map(hitBySource);
    alignedMiss = new Map(missBySource);

    const residual = promptTokens - estimatedTotal;
    if (residual > 0) {
      unattributedValue = residual;
      alignedBySource.set('unattributed', residual);
      // unattributed 属于未命中：它不在客户端拼接的前缀里
      alignedMiss.set('unattributed', residual);
    } else {
      // 估算超出真值：退回缩放
      alignedBySource = scaleToTarget(estimatedBySource, promptTokens);
      alignedMiss = scaleToTarget(missBySource, missTruth);
    }
  }

  const writeCandidateTotal = tally.reduce((a, t) => a + t.writeCandidate, 0);

  // 阶段四：推理生命周期
  const hasReasoningTruth =
    typeof usage.completion_tokens_details?.reasoning_tokens === 'number';
  const reasoningValue = hasReasoningTruth
    ? (usage.completion_tokens_details!.reasoning_tokens as number)
    : options.reasoningContent
      ? tokenizer.count(options.reasoningContent)
      : 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const outputValue = Math.max(0, completionTokens - reasoningValue);

  const replayedInInput =
    options.replayedReasoningTokens ??
    layout
      .filter((s) => s.source === 'assistant_msg' && s.isReasoning)
      .reduce((a, s) => a + s.tokens, 0);

  const reasoningSnapshot: ReasoningSnapshot = {
    producedThisTurn: reasoningValue,
    replayedInInput,
    requiresReplay: options.hasTools === true,
    contentHash:
      options.reasoningContent && options.reasoningContent.length > 0
        ? hashOf(options.reasoningContent, salt)
        : null,
  };

  // 14 类投影的精度：
  //   tokenizer 非精确           → estimated（字符估算本身有偏差）
  //   tokenizer 精确 + 对齐良好   → exact
  //   tokenizer 精确 + 对齐超阈   → inferred（经过缩放或残差隔离）
  const sourcePrecision: Precision =
    tokenizer.precision !== 'exact'
      ? 'estimated'
      : alignmentDrift <= driftThreshold
        ? 'exact'
        : 'inferred';

  const categories: Record<number, Measured> = {};
  const sourceToCategory: Array<[AssignableSource, number]> = [
    ['system', 1],
    ['tools_schema', 2],
    ['agents_md', 3],
    ['skills', 4],
    ['mcp_tools', 5],
    ['user_msg', 6],
    ['assistant_msg', 7],
    ['tool_result', 8],
    ['injected_ctx', 9],
  ];
  for (const [source, catId] of sourceToCategory) {
    categories[catId] = measured(alignedBySource.get(source) ?? 0, sourcePrecision);
  }
  categories[10] = measured(hitTruth, 'exact');
  categories[12] = measured(missTruth, 'exact');
  categories[11] = measured(Math.round(writeCandidateTotal), 'inferred');
  categories[13] = measured(outputValue, hasReasoningTruth ? 'exact' : 'inferred');
  categories[14] = measured(reasoningValue, hasReasoningTruth ? 'exact' : 'inferred');

  const matrix = buildMatrix(alignedBySource, alignedHit, alignedMiss, tally);
  const cacheBlocks = summarizeBlocks(chunks, verdicts, blockSize);

  const attribution: TurnAttribution = {
    turnId,
    timestamp: Date.now(),
    model,
    categories,
    matrix,
    unattributed: measured(unattributedValue, unattributedValue > 0 ? 'inferred' : 'exact'),
    alignmentDrift,
    cacheBlocks,
    cacheEvents: events,
    reasoning: reasoningSnapshot,
    usage,
  };

  return { attribution, chunks };
}

/* ---------------- 辅助 ---------------- */

function hashOf(text: string, salt: string): string {
  if (!text) return '';
  return createHash('sha256').update(salt).update('\u0000').update(text).digest('hex');
}

function sumValues(map: Map<string, number>): number {
  let s = 0;
  for (const v of map.values()) s += v;
  return s;
}

function scaleToTarget(
  values: Map<TokenSource, number>,
  target: number,
): Map<TokenSource, number> {
  const out = new Map<TokenSource, number>();
  if (target <= 0) return out;
  const entries = [...values.entries()].filter(([, v]) => v > 0);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (total <= 0) return out;

  const scale = target / total;
  const scaled = entries.map(([k, v]) => {
    const exact = v * scale;
    const floor = Math.floor(exact);
    return { k, floor, frac: exact - floor };
  });

  let remaining = target - scaled.reduce((a, e) => a + e.floor, 0);
  scaled.sort((a, b) => b.frac - a.frac);
  for (const e of scaled) {
    if (remaining <= 0) break;
    e.floor += 1;
    remaining -= 1;
  }
  for (const e of scaled) out.set(e.k, e.floor);
  return out;
}

function buildMatrix(
  alignedBySource: Map<TokenSource, number>,
  alignedHit: Map<TokenSource, number>,
  alignedMiss: Map<TokenSource, number>,
  tally: SourceCacheTally[],
): SourceMatrixEntry[] {
  const sources = new Set<TokenSource>([
    ...alignedBySource.keys(),
    ...alignedHit.keys(),
    ...alignedMiss.keys(),
  ]);
  const tallyMap = new Map<AssignableSource, SourceCacheTally>(tally.map((t) => [t.source, t]));

  const rows: SourceMatrixEntry[] = [];
  for (const source of sources) {
    // 取整后再算 total，保证矩阵内每行自洽
    const hit = Math.round(alignedHit.get(source) ?? 0);
    const miss = Math.round(alignedMiss.get(source) ?? 0);
    const writeCandidate = Math.round(
      tallyMap.get(source as AssignableSource)?.writeCandidate ?? 0,
    );
    rows.push({ source, hit, miss, writeCandidate, total: hit + miss });
  }
  rows.sort((a, b) => b.total - a.total);
  return rows;
}
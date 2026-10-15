// 64 token 块前缀缓存建模

import { createHash } from 'node:crypto';
import type { TokenizerAdapter } from './tokenizer.js';
import type { AssignableSource, CacheBlockStats, CacheEvent } from './types.js';

export const CACHE_BLOCK_SIZE = 64;

export interface CacheChunk {
  index: number;
  start: number;
  end: number;
  text: string;
  tokens: number;
  hash: string;
  complete: boolean;
}

export interface ChunkContext {
  modelId: string;
  apiVersion?: string;
  tokenizerId: string;
  toolsSchemaHash?: string;
  systemPromptHash?: string;
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function buildSeed(ctx: ChunkContext): string {
  return [
    ctx.modelId,
    ctx.apiVersion ?? '',
    ctx.tokenizerId,
    ctx.toolsSchemaHash ?? '',
    ctx.systemPromptHash ?? '',
  ].join('\u0001');
}

export function buildChunks(
  text: string,
  tokenizer: TokenizerAdapter,
  ctx: ChunkContext,
  blockSize = CACHE_BLOCK_SIZE,
): CacheChunk[] {
  const boundaries = tokenizer.chunkBoundaries(text, blockSize);
  const seed = buildSeed(ctx);
  const chunks: CacheChunk[] = [];
  let prev = seed;

  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i]!;
    const slice = text.slice(b.start, b.end);
    const hash = sha256(`${prev}\u0000${slice}`);
    prev = hash;
    chunks.push({
      index: i,
      start: b.start,
      end: b.end,
      text: slice,
      tokens: b.tokens,
      hash,
      complete: b.tokens >= blockSize,
    });
  }
  return chunks;
}

export type ChunkVerdict = 'hit' | 'miss' | 'write_candidate';

export interface ChunkComparison {
  verdicts: ChunkVerdict[];
  events: CacheEvent[];
}

export interface ContextChanged {
  systemPrompt: boolean;
  toolsSchema: boolean;
  model: boolean;
}

export function compareChunks(
  current: CacheChunk[],
  previous: CacheChunk[] | null,
  contextChanged: ContextChanged,
): ChunkComparison {
  const events: CacheEvent[] = [];

  if (contextChanged.systemPrompt) {
    events.push({ kind: 'system_prompt_changed', atChunkIndex: 0 });
  }
  if (contextChanged.toolsSchema) {
    events.push({ kind: 'tools_schema_changed', atChunkIndex: 0 });
  }
  if (contextChanged.model) {
    events.push({ kind: 'model_switched', atChunkIndex: 0 });
  }

  const invalidateAll =
    contextChanged.systemPrompt ||
    contextChanged.toolsSchema ||
    contextChanged.model ||
    !previous ||
    previous.length === 0;

  if (invalidateAll) {
    return {
      verdicts: current.map((c) => (c.complete ? 'write_candidate' : 'miss')),
      events,
    };
  }

  const prevHashes = new Set(previous!.map((c) => c.hash));
  const verdicts: ChunkVerdict[] = [];
  let broken = false;
  let breakReported = false;

  for (const chunk of current) {
    if (!chunk.complete) {
      verdicts.push('miss');
      continue;
    }

    if (!broken && prevHashes.has(chunk.hash)) {
      verdicts.push('hit');
      continue;
    }

    if (!broken) {
      broken = true;
      if (!breakReported && chunk.index > 0) {
        events.push({
          kind: 'prefix_broken',
          atChunkIndex: chunk.index,
          detail: 'prefix hash mismatch; subsequent chunks invalidated',
        });
        breakReported = true;
      }
    }

    verdicts.push(prevHashes.has(chunk.hash) ? 'miss' : 'write_candidate');
  }

  return { verdicts, events };
}

export interface SegmentLayout {
  source: AssignableSource;
  start: number;
  end: number;
  tokens: number;
  isReasoning: boolean;
}

export interface SourceCacheTally {
  source: AssignableSource;
  hit: number;
  miss: number;
  writeCandidate: number;
}

/**
 * 按字符区间重叠比例，把每个块的 token 数分摊到各来源。
 *
 * 语义说明：
 *   - hit：本轮命中缓存
 *   - miss：本轮未命中缓存（含 write_candidate）
 *   - writeCandidate：首次出现且完整、可用于预热的块（miss 的子集）
 *
 * 即 write_candidate 同时计入 miss 与 writeCandidate，保证
 *   矩阵的 miss 列之和 = API 的 prompt_cache_miss_tokens。
 */
export function distributeChunksBySource(
  chunks: CacheChunk[],
  verdicts: ChunkVerdict[],
  layout: SegmentLayout[],
): SourceCacheTally[] {
  const tally = new Map<AssignableSource, SourceCacheTally>();

  const touch = (source: AssignableSource): SourceCacheTally => {
    let t = tally.get(source);
    if (!t) {
      t = { source, hit: 0, miss: 0, writeCandidate: 0 };
      tally.set(source, t);
    }
    return t;
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const verdict = verdicts[i] ?? 'miss';
    const chunkLen = chunk.end - chunk.start;
    if (chunkLen <= 0) continue;

    for (const seg of layout) {
      const lo = Math.max(chunk.start, seg.start);
      const hi = Math.min(chunk.end, seg.end);
      if (hi <= lo) continue;
      const share = (hi - lo) / chunkLen;
      const tokens = chunk.tokens * share;
      const t = touch(seg.source);

      if (verdict === 'hit') {
        t.hit += tokens;
      } else if (verdict === 'miss') {
        t.miss += tokens;
      } else {
        // write_candidate：本轮未命中，但完整且首次出现，可用于预热观察
        t.miss += tokens;
        t.writeCandidate += tokens;
      }
    }
  }

  return [...tally.values()];
}

export function summarizeBlocks(
  chunks: CacheChunk[],
  verdicts: ChunkVerdict[],
  blockSize: number,
): CacheBlockStats {
  let hit = 0;
  let miss = 0;
  let write = 0;
  for (const v of verdicts) {
    if (v === 'hit') hit++;
    else if (v === 'miss') miss++;
    else write++;
  }
  return {
    blockSize,
    totalBlocks: chunks.length,
    hitBlocks: hit,
    missBlocks: miss,
    writeCandidateBlocks: write,
    // 未命中的块 = miss 块 + write_candidate 块（二者互斥）
    invalidatedBlocks: miss + write,
  };
}
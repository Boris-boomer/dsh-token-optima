import type { TokenizerAdapter } from './tokenizer.js';
import type { AssignableSource, CacheBlockStats, CacheEvent } from './types.js';
export declare const CACHE_BLOCK_SIZE = 64;
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
export declare function sha256(input: string): string;
export declare function buildChunks(text: string, tokenizer: TokenizerAdapter, ctx: ChunkContext, blockSize?: number): CacheChunk[];
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
export declare function compareChunks(current: CacheChunk[], previous: CacheChunk[] | null, contextChanged: ContextChanged): ChunkComparison;
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
export declare function distributeChunksBySource(chunks: CacheChunk[], verdicts: ChunkVerdict[], layout: SegmentLayout[]): SourceCacheTally[];
export declare function summarizeBlocks(chunks: CacheChunk[], verdicts: ChunkVerdict[], blockSize: number): CacheBlockStats;

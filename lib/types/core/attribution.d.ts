import type { DeepSeekUsage, SourceSegment, TurnAttribution } from './types.js';
import type { TokenizerAdapter } from './tokenizer.js';
import { type CacheChunk, type ContextChanged } from './cache-model.js';
export interface AttributionOptions {
    blockSize?: number;
    driftThreshold?: number;
    hashSalt?: string;
    previousChunks?: CacheChunk[] | null;
    contextChanged?: ContextChanged;
    hasTools?: boolean;
    reasoningContent?: string | null;
    replayedReasoningTokens?: number;
    /** 用于峰谷计费判断 */
    timestamp?: number;
    extraOffPeakDates?: Set<string>;
}
export interface AttributionResult {
    attribution: TurnAttribution;
    chunks: CacheChunk[];
}
export declare function attributeTurn(turnId: string, model: string, segments: SourceSegment[], usage: DeepSeekUsage, tokenizer: TokenizerAdapter, options?: AttributionOptions): AttributionResult;

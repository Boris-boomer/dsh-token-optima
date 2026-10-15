// 坐标式 Token 归因模型 —— 类型定义（零运行时依赖）

export const SOURCES = [
  'system',
  'tools_schema',
  'agents_md',
  'skills',
  'mcp_tools',
  'user_msg',
  'assistant_msg',
  'tool_result',
  'injected_ctx',
  'unattributed',
] as const;

export type TokenSource = (typeof SOURCES)[number];
export type AssignableSource = Exclude<TokenSource, 'unattributed'>;

export type CacheStatus = 'hit' | 'miss' | 'write_candidate' | 'unknown';
export type Direction = 'input' | 'output';
export type Precision = 'exact' | 'inferred' | 'estimated';

export interface TokenCoordinate {
  source: TokenSource;
  cache_status: CacheStatus;
  direction: Direction;
  is_reasoning: boolean;
}

export interface Measured {
  value: number;
  precision: Precision;
}

export const measured = (value: number, precision: Precision): Measured => ({
  value,
  precision,
});

export interface SourceSegment {
  source: AssignableSource;
  text: string;
  isReasoning?: boolean;
  tokenCount?: number;
}

export interface DeepSeekUsage {
  prompt_tokens: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  completion_tokens: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface SourceMatrixEntry {
  source: TokenSource;
  hit: number;
  miss: number;
  writeCandidate: number;
  total: number;
}

export interface CacheBlockStats {
  blockSize: number;
  totalBlocks: number;
  hitBlocks: number;
  missBlocks: number;
  writeCandidateBlocks: number;
  invalidatedBlocks: number;
}

export interface CacheEvent {
  kind:
    | 'system_prompt_changed'
    | 'tools_schema_changed'
    | 'model_switched'
    | 'block_alignment_changed'
    | 'mid_context_edited'
    | 'prefix_broken';
  atChunkIndex: number;
  detail?: string;
}

export interface ReasoningSnapshot {
  producedThisTurn: number;
  replayedInInput: number;
  requiresReplay: boolean;
  contentHash: string | null;
}

export interface TurnAttribution {
  turnId: string;
  timestamp: number;
  model: string;
  categories: Record<number, Measured>;
  matrix: SourceMatrixEntry[];
  unattributed: Measured;
  alignmentDrift: number;
  cacheBlocks: CacheBlockStats;
  cacheEvents: CacheEvent[];
  reasoning: ReasoningSnapshot;
  usage: DeepSeekUsage;
}

export interface ClassifiedRequest {
  model: string;
  segments: SourceSegment[];
  hasTools: boolean;
  systemPromptHash: string;
  toolsSchemaHash: string;
}
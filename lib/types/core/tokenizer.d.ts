import type { Precision } from './types.js';
export interface ChunkBoundary {
    start: number;
    end: number;
    tokens: number;
}
export interface TokenizerAdapter {
    readonly id: string;
    readonly precision: Precision;
    count(text: string): number;
    chunkBoundaries(text: string, blockSize: number): ChunkBoundary[];
}
export declare class EstimatedTokenizer implements TokenizerAdapter {
    readonly id = "estimated-char-weighted";
    readonly precision: Precision;
    count(text: string): number;
    chunkBoundaries(text: string, blockSize: number): ChunkBoundary[];
}
export interface RawEncoder {
    id: string;
    encode(text: string): number[];
    encodeWithOffsets?(text: string): {
        ids: number[];
        offsets: number[];
    };
}
export declare class NativeTokenizer implements TokenizerAdapter {
    private readonly enc;
    readonly id: string;
    readonly precision: Precision;
    constructor(enc: RawEncoder);
    count(text: string): number;
    chunkBoundaries(text: string, blockSize: number): ChunkBoundary[];
}
export interface BpeVocab {
    encoder: Map<string, number>;
    decoder: string[];
    ranks: Map<string, number>;
}
export declare function createBpeEncoder(vocab: BpeVocab, id?: string): RawEncoder;
export type HfLoader = () => Promise<RawEncoder | null>;
export type WasmLoader = () => Promise<RawEncoder | null>;
export type BpeLoader = () => Promise<RawEncoder | null>;
export interface TokenizerResolution {
    tokenizer: TokenizerAdapter;
    warning: string | null;
}
/**
 * 使用 @huggingface/tokenizers 加载 tokenizer.json（+ 可选 tokenizer_config.json）。
 *
 * - 该包是 optionalDependency，未安装时本函数会抛错，由 resolveTokenizer 降级。
 * - 只接受本地文件路径；如果是 URL，调用方应先 fetch 到临时文件再传入。
 * - 首次加载后由调用方缓存 TokenizerAdapter 实例，不要每轮重复加载。
 */
export declare function loadHfTokenizer(tokenizerJsonPath: string, tokenizerConfigPath?: string): Promise<RawEncoder>;
export declare function resolveTokenizer(options?: {
    hfLoader?: HfLoader;
    wasmLoader?: WasmLoader;
    bpeLoader?: BpeLoader;
    timeoutMs?: number;
}): Promise<TokenizerResolution>;

// DeepSeek 原生 tokenizer 适配 + 三层降级链
//
// 精度优先级：HuggingFace tokenizer.json（exact）→ 自建 BPE（exact，需词表）
//            → 字符加权估算（estimated，~80-90%）

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

/* ---------------- 字符加权估算（最终兜底） ---------------- */

const W_CJK = 0.6;
const W_LATIN = 0.25;
const W_DIGIT = 0.3;
const W_SPACE = 0.12;
const W_PUNCT = 0.5;

function charWeight(code: number): number {
  if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) return W_SPACE;
  if (code >= 0x30 && code <= 0x39) return W_DIGIT;
  if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) return W_LATIN;
  if (code >= 0xc0 && code <= 0x24f) return W_LATIN;
  if (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0xac00 && code <= 0xd7af)
  ) return W_CJK;
  return W_PUNCT;
}

export class EstimatedTokenizer implements TokenizerAdapter {
  readonly id = 'estimated-char-weighted';
  readonly precision: Precision = 'estimated';

  count(text: string): number {
    if (!text) return 0;
    let acc = 0;
    for (let i = 0; i < text.length; i++) acc += charWeight(text.charCodeAt(i));
    return Math.max(1, Math.round(acc));
  }

  chunkBoundaries(text: string, blockSize: number): ChunkBoundary[] {
    const out: ChunkBoundary[] = [];
    if (!text) return out;
    let start = 0;
    let acc = 0;
    for (let i = 0; i < text.length; i++) {
      acc += charWeight(text.charCodeAt(i));
      if (acc >= blockSize) {
        out.push({ start, end: i + 1, tokens: Math.round(acc) });
        start = i + 1;
        acc = 0;
      }
    }
    if (start < text.length) {
      // 尾块必须用 floor，防止 acc ∈ [63.5,64) 被 round 成 64 而误判 complete
      out.push({ start, end: text.length, tokens: Math.max(1, Math.floor(acc)) });
    }
    return out;
  }
}

/* ---------------- 原生适配（WASM 或纯 TS BPE） ---------------- */

export interface RawEncoder {
  id: string;
  encode(text: string): number[];
  encodeWithOffsets?(text: string): { ids: number[]; offsets: number[] };
}

export class NativeTokenizer implements TokenizerAdapter {
  readonly id: string;
  readonly precision: Precision = 'exact';

  constructor(private readonly enc: RawEncoder) {
    this.id = enc.id;
  }

  count(text: string): number {
    return this.enc.encode(text).length;
  }

  chunkBoundaries(text: string, blockSize: number): ChunkBoundary[] {
    if (this.enc.encodeWithOffsets) {
      const { ids, offsets } = this.enc.encodeWithOffsets(text);
      const out: ChunkBoundary[] = [];
      for (let i = 0; i < ids.length; i += blockSize) {
        const last = Math.min(i + blockSize, ids.length) - 1;
        const prevOffset = i === 0 ? 0 : offsets[i - 1] ?? 0;
        const lastOffset = offsets[last] ?? text.length;
        out.push({ start: prevOffset, end: lastOffset, tokens: last - i + 1 });
      }
      if (out.length > 0) {
        out[0]!.start = 0;
        out[out.length - 1]!.end = text.length;
      }
      return out;
    }
    const ids = this.enc.encode(text);
    if (ids.length === 0) return [];
    const ratio = text.length / ids.length;
    const out: ChunkBoundary[] = [];
    for (let i = 0; i < ids.length; i += blockSize) {
      const end = Math.min(i + blockSize, ids.length);
      out.push({
        start: Math.floor(i * ratio),
        end: Math.min(text.length, Math.ceil(end * ratio)),
        tokens: end - i,
      });
    }
    if (out.length > 0) {
      out[0]!.start = 0;
      out[out.length - 1]!.end = text.length;
    }
    return out;
  }
}

/* ---------------- 纯 TS BPE（词表外部提供） ---------------- */

export interface BpeVocab {
  encoder: Map<string, number>;
  decoder: string[];
  ranks: Map<string, number>;
}

export function createBpeEncoder(vocab: BpeVocab, id = 'bpe-ts'): RawEncoder {
  const { encoder, decoder, ranks } = vocab;

  const byteEncode = (text: string): string[] => {
    const bytes = new TextEncoder().encode(text);
    const out: string[] = [];
    for (const b of bytes) {
      if (
        (b >= 0x21 && b <= 0x7e) ||
        (b >= 0xa1 && b <= 0xac) ||
        (b >= 0xae && b <= 0xff)
      ) {
        out.push(String.fromCharCode(b));
      } else {
        out.push(String.fromCharCode(0x100 + b));
      }
    }
    return out;
  };

  const mergePair = (tokens: string[], a: string, b: string, merged: string): string[] => {
    const out: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      if (i < tokens.length - 1 && tokens[i] === a && tokens[i + 1] === b) {
        out.push(merged);
        i += 2;
      } else {
        out.push(tokens[i]!);
        i += 1;
      }
    }
    return out;
  };

  const applyBpe = (chars: string[]): string[] => {
    let tokens = chars;
    while (tokens.length > 1) {
      let bestRank = Infinity;
      let bestIdx = -1;
      for (let i = 0; i < tokens.length - 1; i++) {
        const key = `${tokens[i]}\u0000${tokens[i + 1]}`;
        const rank = ranks.get(key);
        if (rank !== undefined && rank < bestRank) {
          bestRank = rank;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) break;
      const a = tokens[bestIdx]!;
      const b = tokens[bestIdx + 1]!;
      tokens = mergePair(tokens, a, b, a + b);
    }
    return tokens;
  };

  const encode = (text: string): number[] => {
    if (!text) return [];
    const chars = byteEncode(text);
    const tokens = applyBpe(chars);
    const ids: number[] = [];
    for (const t of tokens) {
      const id = encoder.get(t);
      if (id !== undefined) ids.push(id);
      else {
        for (const ch of t) {
          const cid = encoder.get(ch);
          if (cid !== undefined) ids.push(cid);
          else ids.push(decoder.length - 1);
        }
      }
    }
    return ids;
  };

  return { id, encode };
}

/* ---------------- HuggingFace tokenizer.json 加载（精确） ---------------- */

/**
 * @huggingface/tokenizers 0.1.3 的 API：
 *   const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig)
 *   const { ids, tokens, attention_mask } = tokenizer.encode(text)
 *
 * 注意：
 *   - Tokenizer 是构造函数，不是带静态 fromFile 的类。
 *   - 两个 JSON 必须先从磁盘读成对象，不能传路径。
 *   - 该包的纯 JS 实现不暴露 byte offsets，因此 encodeWithOffsets 不可用。
 *     NativeTokenizer 会退回到按比例估算边界，但 token 总数是 API 真值。
 *
 * 之所以不直接 import 该包的类型，是因为它是 optionalDependency：
 * 未安装时 tsc 会对字面量 import 报 TS2307。这里用变量名动态导入绕过静态解析。
 */
interface HfEncoded {
  ids?: number[];
  tokens?: string[];
  attention_mask?: number[];
}

interface HfTokenizerInstance {
  encode(text: string): HfEncoded;
}

interface HfTokenizerCtor {
  new (tokenizerJson: unknown, tokenizerConfig?: unknown): HfTokenizerInstance;
}

interface HfModuleLike {
  Tokenizer: HfTokenizerCtor;
}

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
export async function loadHfTokenizer(
  tokenizerJsonPath: string,
  tokenizerConfigPath?: string,
): Promise<RawEncoder> {
  const { readFile } = await import('node:fs/promises')

  // 关键：用变量名导入，避免 tsc 在 optionalDependency 未安装时做静态解析。
  const pkgName = '@huggingface/tokenizers'
  const mod = (await import(/* @vite-ignore */ pkgName)) as HfModuleLike

  if (typeof mod?.Tokenizer !== 'function') {
    throw new Error('@huggingface/tokenizers: Tokenizer 构造函数不可用')
  }

  const tokenizerJson = JSON.parse(await readFile(tokenizerJsonPath, 'utf8'))

  // tokenizer_config.json 是可选的，但强烈建议提供：
  // DeepSeek 的 tokenizer.json 里某些 post_processor 依赖它补 BOS/EOS 等特殊 token
  let tokenizerConfig: unknown = undefined
  if (tokenizerConfigPath) {
    try {
      tokenizerConfig = JSON.parse(await readFile(tokenizerConfigPath, 'utf8'))
    } catch {
      // 配置文件缺失不致命，继续用默认配置
    }
  }

  const tokenizer = new mod.Tokenizer(tokenizerJson, tokenizerConfig)

  return {
    id: `hf:${tokenizerJsonPath}`,
    encode(text: string): number[] {
      const encoded = tokenizer.encode(text)
      if (Array.isArray(encoded.ids)) return encoded.ids
      // 兜底：某些小版本可能返回 Uint32Array
      return encoded.ids ? Array.from(encoded.ids) : []
    },
    // 0.1.3 不提供 offsets，故意不实现 encodeWithOffsets。
    // NativeTokenizer 会走比例估算边界分支，token 总数仍是真值。
  }
}

export async function resolveTokenizer(
  options: {
    hfLoader?: HfLoader;
    wasmLoader?: WasmLoader;
    bpeLoader?: BpeLoader;
    timeoutMs?: number;
  } = {},
): Promise<TokenizerResolution> {
  const timeoutMs = options.timeoutMs ?? 3000;

  const withTimeout = async <T>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);

  // 1) HuggingFace tokenizer.json —— 最精确
  if (options.hfLoader) {
    try {
      const enc = await withTimeout(options.hfLoader());
      if (enc) return { tokenizer: new NativeTokenizer(enc), warning: null };
    } catch (err) {
      const msg = (err as Error).message;
      if (options.wasmLoader) {
        try {
          const enc = await withTimeout(options.wasmLoader());
          if (enc) {
            return {
              tokenizer: new NativeTokenizer(enc),
              warning: `HF tokenizer failed (${msg}); using WASM fallback.`,
            };
          }
        } catch {
          /* 继续降级 */
        }
      }
      if (options.bpeLoader) {
        try {
          const enc = await withTimeout(options.bpeLoader());
          if (enc) {
            return {
              tokenizer: new NativeTokenizer(enc),
              warning: `HF tokenizer failed (${msg}); using BPE fallback.`,
            };
          }
        } catch {
          /* 继续降级 */
        }
      }
      return {
        tokenizer: new EstimatedTokenizer(),
        warning: `HF tokenizer failed (${msg}); using character estimation (~80-90%).`,
      };
    }
  }

  // 2) WASM
  if (options.wasmLoader) {
    try {
      const enc = await withTimeout(options.wasmLoader());
      if (enc) return { tokenizer: new NativeTokenizer(enc), warning: null };
    } catch (err) {
      const msg = (err as Error).message;
      if (options.bpeLoader) {
        try {
          const enc = await withTimeout(options.bpeLoader());
          if (enc) {
            return {
              tokenizer: new NativeTokenizer(enc),
              warning: `WASM tokenizer failed (${msg}); using BPE fallback.`,
            };
          }
        } catch (err2) {
          return {
            tokenizer: new EstimatedTokenizer(),
            warning:
              `WASM failed (${msg}); BPE failed (${(err2 as Error).message}); ` +
              `using character estimation (~80-90%).`,
          };
        }
      }
      return {
        tokenizer: new EstimatedTokenizer(),
        warning: `WASM failed (${msg}); using character estimation (~80-90%).`,
      };
    }
  }

  // 3) BPE
  if (options.bpeLoader) {
    try {
      const enc = await withTimeout(options.bpeLoader());
      if (enc) return { tokenizer: new NativeTokenizer(enc), warning: null };
    } catch (err) {
      return {
        tokenizer: new EstimatedTokenizer(),
        warning: `BPE failed (${(err as Error).message}); using character estimation.`,
      };
    }
  }

  return {
    tokenizer: new EstimatedTokenizer(),
    warning:
      'Using character estimation (~80-90% accuracy). Provide hfLoader for exact counts.',
  };
}
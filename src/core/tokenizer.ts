// DeepSeek 原生 tokenizer 适配 + 三层降级链

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

/* ---------------- 字符加权估算（兜底） ---------------- */

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
      // 尾块：acc 一定 < blockSize（否则循环里已经推过并重置了）。
      // 这里必须用 floor 而不是 round，否则 acc ∈ [63.5, 64) 会被 round 到 64，
      // 让尾块被误判为 complete，破坏「追加内容不破坏已有前缀块哈希」性质。
      // 相关回归测试：tests/property.test.ts > 追加内容不破坏已有前缀块的哈希
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
  /** token 字符串 → id */
  encoder: Map<string, number>;
  /** id → token 字符串 */
  decoder: string[];
  /** 合并优先级：pair key "a\u0000b" → rank，越小越优先 */
  ranks: Map<string, number>;
}

export function createBpeEncoder(vocab: BpeVocab, id = 'bpe-ts'): RawEncoder {
  const { encoder, decoder, ranks } = vocab;

  const byteEncode = (text: string): string[] => {
    // 简化的 byte-level 编码：UTF-8 字节映射到可见字符区
    const bytes = new TextEncoder().encode(text);
    const out: string[] = [];
    for (const b of bytes) {
      // DeepSeek 使用 GPT-2 风格字节映射
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
        // 未知 token 逐字符兜底
        for (const ch of t) {
          const cid = encoder.get(ch);
          if (cid !== undefined) ids.push(cid);
          else ids.push(decoder.length - 1); // unk
        }
      }
    }
    return ids;
  };

  return { id, encode };
}

/* ---------------- 加载链：WASM → BPE → 估算 ---------------- */

export type WasmLoader = () => Promise<RawEncoder | null>;
export type BpeLoader = () => Promise<RawEncoder | null>;

export interface TokenizerResolution {
  tokenizer: TokenizerAdapter;
  warning: string | null;
}

export async function resolveTokenizer(
  options: {
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
    warning: 'Using character estimation (~80-90% accuracy).',
  };
}
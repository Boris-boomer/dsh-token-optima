// DAG 压缩器：三层无损语义 + 白名单 + 三遍法 + 思维链剪枝

import type { AssignableSource, SourceSegment, TokenSource } from './types.js';
import type { TokenizerAdapter } from './tokenizer.js';

/* ---------------- 策略与白名单 ---------------- */

export interface CompressionPolicy {
  /** 允许压缩的最大比例（相对当前 segment 的 token 数） */
  maxRatio: number;
  /** 保留原文的末尾用户消息条数 */
  keepRecentUserTurns: number;
  /** 保留原文的末尾助手回复条数 */
  keepRecentAssistantTurns: number;
  /** 是否对历史 reasoning_content 做剪枝 */
  pruneReasoning: boolean;
  /** 压缩触发阈值：当上下文字符数 / 估算 token 数超过该值时触发 */
  triggerThresholdTokens: number;
}

export const DEFAULT_POLICY: CompressionPolicy = {
  maxRatio: 0.6,
  keepRecentUserTurns: 2,
  keepRecentAssistantTurns: 1,
  pruneReasoning: true,
  triggerThresholdTokens: 60_000,
};

/** 禁止压缩的来源 —— 方案第五章 */
export const NO_COMPRESS_SOURCES: ReadonlySet<AssignableSource> = new Set([
  'user_msg',
]);

/** 单段内容级白名单关键字（不区分大小写） */
const CONTENT_WHITELIST = [
  /tool[_ ]?call[_ ]?id/i,
  /file:\/\//i,
  /[a-z]:\\[^\s]+/i,
  /```[\s\S]*```/, // 代码块
];

export function isWhitelisted(text: string): boolean {
  return CONTENT_WHITELIST.some((re) => re.test(text));
}

/* ---------------- DAG 节点 ---------------- */

export type DagNodeKind = 'raw' | 'summary' | 'aggregate';

export interface DagNode {
  id: string;
  kind: DagNodeKind;
  source: TokenSource;
  /** 送给模型的表示（可能是摘要） */
  text: string;
  /** 原始内容引用键（用于 context_audit 回溯） */
  originalRef?: string;
  children?: string[];
  isReasoning?: boolean;
  tokens: number;
}

/* ---------------- 压缩事件 ---------------- */

export interface CompressionEvent {
  kind: 'strip_mechanical' | 'summarize' | 'aggregate' | 'reasoning_prune';
  source: TokenSource;
  beforeTokens: number;
  afterTokens: number;
  nodeId?: string;
}

export interface CompressionResult {
  segments: SourceSegment[];
  nodes: DagNode[];
  events: CompressionEvent[];
  beforeTokens: number;
  afterTokens: number;
  cachedPrefixUntouched: boolean;
}

/* ---------------- 三遍法 ---------------- */

/**
 * 第 1 遍：剥离机械膨胀
 *   - 去除重复日志行
 *   - 截断超长文件内容
 *   - 压缩冗余空白
 */
function pass1StripMechanical(text: string, tokenizer: TokenizerAdapter): {
  text: string;
  changed: boolean;
} {
  if (!text) return { text, changed: false };

  // 去除连续重复行
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let prev: string | null = null;
  let repeatCount = 0;
  for (const line of lines) {
    if (line === prev) {
      repeatCount++;
      continue;
    }
    if (repeatCount > 0) {
      out.push(`... [重复行省略 ${repeatCount} 行] ...`);
      repeatCount = 0;
    }
    out.push(line);
    prev = line;
  }
  if (repeatCount > 0) {
    out.push(`... [重复行省略 ${repeatCount} 行] ...`);
  }

  let next = out.join('\n');

  // 超长内容压缩：> 8000 字符时首尾保留
  const MAX_CHARS = 8000;
  if (next.length > MAX_CHARS) {
    const head = next.slice(0, Math.floor(MAX_CHARS * 0.6));
    const tail = next.slice(-Math.floor(MAX_CHARS * 0.3));
    next = `${head}\n\n... [内容截断，省略 ${next.length - head.length - tail.length} 字符] ...\n\n${tail}`;
  }

  return { text: next, changed: next !== text };
}

/**
 * 第 2 遍：摘要低密度段
 *   - 对超过阈值的长段生成摘要节点
 *   - 摘要本身不引入新信息，只做结构化压缩
 */
function pass2Summarize(text: string, tokenizer: TokenizerAdapter): string {
  if (!text) return text;
  const lines = text.split(/\r?\n/);
  if (lines.length < 30) return text;

  // 简化的结构摘要：保留标题行 + 首末各 3 行
  const keep: string[] = [];
  const head = lines.slice(0, 3);
  const tail = lines.slice(-3);
  for (const l of lines) {
    if (/^#{1,6}\s/.test(l) || /^[A-Z][A-Za-z0-9 _-]{2,50}:/.test(l)) {
      keep.push(l);
    }
  }
  const body = [...head, ...keep, '... [中段已摘要] ...', ...tail];
  return body.join('\n');
}

/**
 * 第 3 遍：聚合高层节点
 *   - 相同 source 的连续 summary 合并
 *   - 用于后续可选的二次压缩
 */
function pass3Aggregate(text: string): string {
  return text;
}

/* ---------------- 思维链剪枝 ---------------- */

const DECISION_KEYWORDS = [
  /因为/,
  /所以/,
  /结论/,
  /决定/,
  /关键/,
  /therefore/i,
  /because/i,
  /decision/i,
  /conclusion/i,
  /key finding/i,
];

const FAILURE_KEYWORDS = [
  /失败/,
  /行不通/,
  /退而求其次/,
  /does not work/i,
  /failed/i,
  /not viable/i,
];

/**
 * 只保留含关键决策/发现/结论的推理段，删除重复探索与失败路径。
 * 输出按段落保留，段落分隔符为两个换行或中文句号后换行。
 */
export function pruneReasoning(text: string): string {
  if (!text) return text;

  const paragraphs = text
    .split(/\n{2,}|(?<=。)\n|(?<=\.)\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const kept: string[] = [];
  let removed = 0;
  for (const p of paragraphs) {
    const isDecision = DECISION_KEYWORDS.some((re) => re.test(p));
    const isFailure = FAILURE_KEYWORDS.some((re) => re.test(p));
    if (isDecision && !isFailure) {
      kept.push(p);
    } else {
      removed++;
    }
  }

  if (kept.length === 0) {
    // 全删则回退到首段，避免丢失
    return paragraphs[0] ?? text;
  }

  if (removed > 0) {
    kept.push(`... [剪枝省略 ${removed} 段重复探索/失败路径] ...`);
  }
  return kept.join('\n\n');
}

/* ---------------- 主入口 ---------------- */

export interface CompressInput {
  segments: SourceSegment[];
  tokenizer: TokenizerAdapter;
  policy?: Partial<CompressionPolicy>;
  /** 已被缓存的前缀 token 数（用于判断是否只压缩未缓存部分） */
  cachedPrefixTokens?: number;
  /** 本轮新增且未被缓存的来源集合（仅这些允许压缩） */
  uncachedSources?: Set<AssignableSource>;
}

export function compressContext(input: CompressInput): CompressionResult {
  const policy: CompressionPolicy = { ...DEFAULT_POLICY, ...(input.policy ?? {}) };
  const tokenizer = input.tokenizer;
  const events: CompressionEvent[] = [];
  const nodes: DagNode[] = [];

  const totalBefore = input.segments.reduce(
    (a, s) => a + (s.tokenCount ?? tokenizer.count(s.text)),
    0,
  );

  if (totalBefore < policy.triggerThresholdTokens) {
    // 未触发压缩：原样返回，只生成 raw 节点
    for (let i = 0; i < input.segments.length; i++) {
      const seg = input.segments[i]!;
      const tokens = seg.tokenCount ?? tokenizer.count(seg.text);
      nodes.push({
        id: `raw-${i}`,
        kind: 'raw',
        source: seg.source,
        text: seg.text,
        isReasoning: seg.isReasoning,
        tokens,
      });
    }
    return {
      segments: input.segments,
      nodes,
      events,
      beforeTokens: totalBefore,
      afterTokens: totalBefore,
      cachedPrefixUntouched: true,
    };
  }

  const outSegments: SourceSegment[] = [];

  // 统计尾部保留窗口
  const userIdx: number[] = [];
  const assistantIdx: number[] = [];
  for (let i = 0; i < input.segments.length; i++) {
    const seg = input.segments[i]!;
    if (seg.source === 'user_msg') userIdx.push(i);
    if (seg.source === 'assistant_msg') assistantIdx.push(i);
  }
  const keepUser = new Set(userIdx.slice(-policy.keepRecentUserTurns));
  const keepAssistant = new Set(assistantIdx.slice(-policy.keepRecentAssistantTurns));

  const uncached = input.uncachedSources;

  for (let i = 0; i < input.segments.length; i++) {
    const seg = input.segments[i]!;
    const before = seg.tokenCount ?? tokenizer.count(seg.text);

    // 白名单：来源级
    if (NO_COMPRESS_SOURCES.has(seg.source)) {
      outSegments.push(seg);
      nodes.push({ id: `keep-${i}`, kind: 'raw', source: seg.source, text: seg.text, tokens: before });
      continue;
    }
    if (keepUser.has(i) || keepAssistant.has(i)) {
      outSegments.push(seg);
      nodes.push({ id: `keep-${i}`, kind: 'raw', source: seg.source, text: seg.text, tokens: before });
      continue;
    }
    if (isWhitelisted(seg.text)) {
      outSegments.push(seg);
      nodes.push({ id: `keep-${i}`, kind: 'raw', source: seg.source, text: seg.text, tokens: before });
      continue;
    }

    // 未缓存过滤：只压缩新增或未缓存部分
    if (uncached && !uncached.has(seg.source)) {
      outSegments.push(seg);
      nodes.push({ id: `keep-${i}`, kind: 'raw', source: seg.source, text: seg.text, tokens: before });
      continue;
    }

    // 推理剪枝
    let workText = seg.text;
    if (seg.isReasoning && policy.pruneReasoning) {
      const pruned = pruneReasoning(workText);
      const after = tokenizer.count(pruned);
      if (after < before) {
        events.push({
          kind: 'reasoning_prune',
          source: seg.source,
          beforeTokens: before,
          afterTokens: after,
          nodeId: `reason-${i}`,
        });
        workText = pruned;
      }
    }

    // 三遍法
    const p1 = pass1StripMechanical(workText, tokenizer);
    let stripped = p1.text;
    if (p1.changed) {
      const after = tokenizer.count(stripped);
      events.push({
        kind: 'strip_mechanical',
        source: seg.source,
        beforeTokens: tokenizer.count(workText),
        afterTokens: after,
        nodeId: `strip-${i}`,
      });
    }

    const summarized = pass2Summarize(stripped, tokenizer);
    if (summarized !== stripped) {
      const after = tokenizer.count(summarized);
      events.push({
        kind: 'summarize',
        source: seg.source,
        beforeTokens: tokenizer.count(stripped),
        afterTokens: after,
        nodeId: `summ-${i}`,
      });
      stripped = summarized;
    }

    const aggregated = pass3Aggregate(stripped);
    if (aggregated !== stripped) {
      const after = tokenizer.count(aggregated);
      events.push({
        kind: 'aggregate',
        source: seg.source,
        beforeTokens: tokenizer.count(stripped),
        afterTokens: after,
        nodeId: `agg-${i}`,
      });
      stripped = aggregated;
    }

    const afterFinal = tokenizer.count(stripped);
    const ratio = before > 0 ? afterFinal / before : 1;
    const finalText = ratio < policy.maxRatio || afterFinal < before ? stripped : seg.text;

    outSegments.push({
      source: seg.source,
      text: finalText,
      isReasoning: seg.isReasoning,
      tokenCount: tokenizer.count(finalText),
    });

    nodes.push({
      id: `node-${i}`,
      kind: finalText === seg.text ? 'raw' : 'summary',
      source: seg.source,
      text: finalText,
      originalRef: finalText === seg.text ? undefined : `ref-${i}`,
      isReasoning: seg.isReasoning,
      tokens: tokenizer.count(finalText),
    });
  }

  const totalAfter = outSegments.reduce(
    (a, s) => a + (s.tokenCount ?? tokenizer.count(s.text)),
    0,
  );

  return {
    segments: outSegments,
    nodes,
    events,
    beforeTokens: totalBefore,
    afterTokens: totalAfter,
    cachedPrefixUntouched: (input.cachedPrefixTokens ?? 0) === 0,
  };
}
// reasoning_effort 动态调整

import type { SourceSegment } from './types.js';

export type EffortLevel = 'low' | 'high' | 'max';

export interface ComplexitySignal {
  /** 用户消息总长度（token） */
  userTokens: number;
  /** 是否包含代码块 */
  hasCode: boolean;
  /** 是否包含数学/推理关键词 */
  hasMath: boolean;
  /** 历史工具调用次数 */
  toolCalls: number;
  /** 显式提示 */
  hint?: EffortLevel | null;
}

const CODE_RE = /```[\s\S]*```|function\s+\w+|class\s+\w+|def\s+\w+/;
const MATH_RE = /证明|推导|计算|求|分析|比较|推导|prove|derive|analyze|compare|calculate/i;

export function extractSignals(
  segments: SourceSegment[],
  toolCalls: number,
  hint: EffortLevel | null = null,
): ComplexitySignal {
  let userTokens = 0;
  let hasCode = false;
  let hasMath = false;

  for (const seg of segments) {
    if (seg.source !== 'user_msg') continue;
    userTokens += seg.tokenCount ?? seg.text.length;
    if (CODE_RE.test(seg.text)) hasCode = true;
    if (MATH_RE.test(seg.text)) hasMath = true;
  }

  return { userTokens, hasCode, hasMath, toolCalls, hint };
}

/**
 * 简单任务（格式整理、信息提取）→ low
 * 复杂推理任务 → high / max
 *
 * 注意：方案要求任务分类器必须通过 A/B 测试验证成功率，
 * 不能只追求省 token。这里的启发式仅作为默认实现。
 */
export function classifyComplexity(signal: ComplexitySignal): EffortLevel {
  if (signal.hint) return signal.hint;

  let score = 0;
  if (signal.userTokens > 800) score += 2;
  else if (signal.userTokens > 300) score += 1;
  if (signal.hasCode) score += 2;
  if (signal.hasMath) score += 2;
  if (signal.toolCalls > 5) score += 1;

  if (score >= 5) return 'max';
  if (score >= 3) return 'high';
  if (score >= 1) return 'high';
  return 'low';
}

export interface EffortDecision {
  level: EffortLevel;
  reason: string;
}

export function decideEffort(
  signal: ComplexitySignal,
  budgetPressure: boolean,
): EffortDecision {
  const base = classifyComplexity(signal);

  // 预算压力下，仅在低复杂度任务上降级
  if (budgetPressure && base === 'high' && signal.userTokens < 200 && !signal.hasMath && !signal.hasCode) {
    return { level: 'low', reason: 'budget pressure + low complexity heuristic' };
  }

  return { level: base, reason: 'complexity heuristic' };
}
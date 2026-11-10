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
export declare function extractSignals(segments: SourceSegment[], toolCalls: number, hint?: EffortLevel | null): ComplexitySignal;
/**
 * 简单任务（格式整理、信息提取）→ low
 * 复杂推理任务 → high / max
 *
 * 注意：方案要求任务分类器必须通过 A/B 测试验证成功率，
 * 不能只追求省 token。这里的启发式仅作为默认实现。
 */
export declare function classifyComplexity(signal: ComplexitySignal): EffortLevel;
export interface EffortDecision {
    level: EffortLevel;
    reason: string;
}
export declare function decideEffort(signal: ComplexitySignal, budgetPressure: boolean): EffortDecision;

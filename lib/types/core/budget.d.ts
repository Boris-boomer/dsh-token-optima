export interface BudgetLimits {
    session?: number;
    daily?: number;
    monthly?: number;
}
export interface BudgetUsage {
    session: number;
    daily: number;
    monthly: number;
}
export interface BudgetState {
    limits: BudgetLimits;
    usage: BudgetUsage;
    /** 当前是否处于告警状态 */
    overBudget: boolean;
    /** 触发降级的阈值（使用率达到此比例即告警） */
    warnAt: number;
}
export interface BudgetAdvice {
    /** 是否应触发降级 */
    downgrade: boolean;
    /** 建议动作 */
    action: 'none' | 'lower_effort' | 'increase_compression' | 'both';
    reason: string;
}
interface DayBucket {
    startedAt: number;
    tokens: number;
}
interface MonthBucket {
    startedAt: number;
    tokens: number;
}
export declare class BudgetTracker {
    private sessionTokens;
    private day;
    private month;
    private readonly limits;
    private readonly warnAt;
    constructor(limits?: BudgetLimits, warnAt?: number);
    private rollover;
    record(sessionId: string, tokens: number, now?: number): void;
    getUsage(sessionId: string, now?: number): BudgetUsage;
    getState(sessionId: string, now?: number): BudgetState;
    private worstRatio;
    advise(sessionId: string, now?: number): BudgetAdvice;
    reset(sessionId?: string): void;
    export(): {
        limits: BudgetLimits;
        usage: {
            sessions: Record<string, number>;
            day: DayBucket;
            month: MonthBucket;
        };
    };
}
export {};

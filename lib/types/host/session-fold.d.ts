import type { Context } from '@deepseek-ai/cordis';
import type { Config } from '../config.js';
import { type TokenizerAdapter } from '../core/tokenizer.js';
import type { TurnAttribution } from '../core/types.js';
import { BudgetTracker } from '../core/budget.js';
import type { HealthProbe, HealthReport } from './health-probe.js';
export interface CacheRisk {
    sessionId: string;
    kind: 'append' | 'replace' | 'shrink' | 'compaction';
    at: number;
    prevLen: number;
    nextLen: number;
    detail: string;
    changedSources?: string[];
}
export interface SessionSummary {
    sessionId: string;
    turns: number;
    lastTs: number;
    model: string;
    totalTokens: number;
    totalCost: number;
    totalSaved: number;
}
export declare class SessionFold {
    private readonly ctx;
    private readonly config;
    private readonly health;
    private readonly byWeak;
    private readonly byId;
    private tokenizer;
    private readonly reasoning;
    private readonly budget;
    private readonly maxTurns;
    private observedEventCount;
    private recentEventTypes;
    private loggedShapes;
    private foldFailures;
    private effortDecisions;
    private cacheRisks;
    private currentSessionId;
    constructor(ctx: Context, config: Config, health: HealthProbe, tokenizer?: TokenizerAdapter);
    /** 暴露 tokenizer 精度给外部诊断 */
    getTokenizer(): TokenizerAdapter;
    /**
     * 运行期把估算 tokenizer 升级为精确 tokenizer。
     *
     * 只允许「估算 → 精确」单向升级，防止已被精确 tokenizer 覆盖的实例被回退。
     * 已经 fold 过的 turn 不重算（重算需要重新走 attributeTurn，成本高且容易
     * 与 consumed 游标冲突）；之后新产生的 turn 会用精确 tokenizer。
     */
    setTokenizer(tokenizer: TokenizerAdapter): void;
    isDebug(): boolean;
    noteEvent(line: string): void;
    getObservedEventCount(): number;
    getRecentEventTypes(): string[];
    getFoldFailures(): number;
    getBudgetTracker(): BudgetTracker;
    getCacheRisks(sessionId?: string): CacheRisk[];
    recordEffortDecision(d: {
        sessionId: string;
        previous: string;
        decided: string;
        reason: string;
    }): void;
    getEffortDecisions(sessionId?: string): {
        sessionId: string;
        previous: string;
        decided: string;
        reason: string;
        at: number;
    }[];
    setCurrentSession(sessionId: string): void;
    getCurrentSession(): string;
    getToolCallCount(sessionId: string): number;
    observe(session: unknown): void;
    private stateOf;
    private evictIfNeeded;
    private idOf;
    private foldEvent;
    private checkSurfaceChange;
    private recordCacheRisk;
    private applySurfaceOp;
    private buildSurfaceNode;
    private settleTurn;
    private emitUpdate;
    private modelOf;
    report(sessionId: string): {
        sessionId: string;
        turns: number;
        latest: TurnAttribution | null;
        history: TurnAttribution[];
        budget: import("../core/budget.js").BudgetState;
        tokenizer: {
            id: string;
            precision: import("../core/types.js").Precision;
        };
        effort: {
            sessionId: string;
            previous: string;
            decided: string;
            reason: string;
            at: number;
        }[];
        cacheRisks: CacheRisk[];
        foldFailures: number;
        debug: boolean;
        health: HealthReport;
        currentSessionId: string;
        toolCallCount: number;
    };
    composition(sessionId: string): {
        id: number;
        key: string;
        label: string;
        group: "input" | "output" | "cache" | "reasoning";
        value: number;
        precision: import("../core/types.js").Precision;
    }[];
    groups(sessionId: string): {
        group: "input" | "output" | "cache" | "reasoning";
        label: string;
        value: number;
    }[];
    listSessions(): SessionSummary[];
    exportCsv(sessionId: string): string;
    tokenizerInfo(): {
        id: string;
        precision: import("../core/types.js").Precision;
    };
    audit(sessionId: string, messageId: string): {
        sessionId: string;
        messageId: string;
        content: null;
        note: string;
    } | {
        sessionId: string;
        messageId: string;
        content: string;
        note: string;
    };
    dispose(): void;
}

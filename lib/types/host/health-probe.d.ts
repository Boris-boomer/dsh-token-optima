export interface HealthFailure {
    item: string;
    detail: string;
}
export interface HealthReport {
    at: number;
    ok: boolean;
    failures: HealthFailure[];
}
export declare class HealthProbe {
    private readonly failures;
    private flushPending;
    private flushTimer;
    fail(item: string, detail: string): void;
    pass(item: string): void;
    checkSession(session: unknown): void;
    checkSessionsService(svc: unknown): void;
    checkEffortPolicy(ok: boolean, detail?: string): void;
    snapshot(): HealthReport;
    /**
     * 异步 + 防抖写入：失败不阻塞主流程，同步 fail()/pass() 也不会卡事件循环。
     */
    private scheduleFlush;
    private flush;
    dispose(): void;
}

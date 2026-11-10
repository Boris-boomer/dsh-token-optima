export interface ReasoningState {
    turnId: string;
    contentHash: string;
    tokens: number;
    mustReplay: boolean;
}
export declare class ReasoningTracker {
    private readonly salt;
    private last;
    constructor(salt?: string);
    record(turnId: string, content: string, tokens: number, hasTools: boolean): void;
    pending(): ReasoningState | null;
    matchesPending(contentHash: string | null): boolean;
    reset(): void;
}

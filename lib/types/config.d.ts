import z from '@deepseek-ai/schemastery';
export declare const NS = "token-optima";
export interface Config {
    enabled: boolean;
    blockSize: number;
    driftThreshold: number;
    hashSalt: string;
    budgetSession: number;
    budgetDaily: number;
    budgetMonthly: number;
    reasoningEffort: string;
    inlineTools: boolean;
    dynamicEffort: boolean;
    debug: boolean;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    enabled: z<boolean, boolean, "defined">;
    blockSize: z<number, number, "defined">;
    driftThreshold: z<number, number, "defined">;
    hashSalt: z<string, string, "defined">;
    budgetSession: z<number, number, "defined">;
    budgetDaily: z<number, number, "defined">;
    budgetMonthly: z<number, number, "defined">;
    reasoningEffort: z<string, string, "defined">;
    inlineTools: z<boolean, boolean, "defined">;
    dynamicEffort: z<boolean, boolean, "defined">;
    debug: z<boolean, boolean, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: z<boolean, boolean, "defined">;
    blockSize: z<number, number, "defined">;
    driftThreshold: z<number, number, "defined">;
    hashSalt: z<string, string, "defined">;
    budgetSession: z<number, number, "defined">;
    budgetDaily: z<number, number, "defined">;
    budgetMonthly: z<number, number, "defined">;
    reasoningEffort: z<string, string, "defined">;
    inlineTools: z<boolean, boolean, "defined">;
    dynamicEffort: z<boolean, boolean, "defined">;
    debug: z<boolean, boolean, "defined">;
}>>, "plain">;

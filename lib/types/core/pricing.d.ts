export interface ModelPricing {
    /** 缓存命中输入 ($/M tokens) */
    hit: number;
    /** 缓存未命中输入 ($/M tokens)，缓存写入也按此单价 */
    miss: number;
    /** 输出 ($/M tokens) */
    output: number;
}
export interface PeakPricing {
    peak: ModelPricing;
    offPeak: ModelPricing;
}
export declare const PRICING_TABLE: Record<string, PeakPricing>;
export declare const PRICING_VERSION = "deepseek-2026-10-21";
export declare function getPricing(model: string): PeakPricing;
/**
 * 判断给定时间是否处于高峰时段。
 *
 * 规则（官方文档）：
 *   - 北京时间周一至周五 9:00–12:00、14:00–18:00 为高峰
 *   - 周末全天空闲
 *   - 法定节假日全天空闲（本函数不内置日历，可通过 options.extraOffPeakDates 覆盖）
 *
 * 实现上先把时间转成北京时间（UTC+8），再判断。
 */
export declare function isPeakHour(timestamp: number, options?: {
    /** 额外标记为空闲的日期，格式 'YYYY-MM-DD'（北京时间） */
    extraOffPeakDates?: Set<string>;
}): boolean;
export interface CostBreakdown {
    total: number;
    savedByCache: number;
    details: {
        hitCost: number;
        missCost: number;
        outputCost: number;
    };
    isPeak: boolean;
    pricingVersion: string;
}
export interface CalculateCostOptions {
    /** 请求时间，用于判断峰谷；缺省用 Date.now() */
    timestamp?: number;
    extraOffPeakDates?: Set<string>;
}
export declare function calculateCost(model: string, hitTokens: number, missTokens: number, outputTokens: number, options?: CalculateCostOptions): CostBreakdown;

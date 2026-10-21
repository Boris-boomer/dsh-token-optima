// 费率适配器（独立模块，不硬编码在使用逻辑中）
// 数据来源：https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
// 获取日期：2026-10-21
//
// 重要口径：
//   1. 缓存写入（write_candidate）按“缓存未命中”单价计费，没有独立的写入价格。
//   2. 峰谷计价：北京时间周一至周五 9:00–12:00、14:00–18:00 为高峰，其余（含周末）
//      为空闲；空闲价格为高峰的 50%。
//   3. 法定节假日按空闲计费，这里不内置节假日日历，允许调用方通过 options 覆盖。

export interface ModelPricing {
  /** 缓存命中输入 ($/M tokens) */
  hit: number
  /** 缓存未命中输入 ($/M tokens)，缓存写入也按此单价 */
  miss: number
  /** 输出 ($/M tokens) */
  output: number
}

export interface PeakPricing {
  peak: ModelPricing
  offPeak: ModelPricing
}

export const PRICING_TABLE: Record<string, PeakPricing> = {
  // deepseek-flash / V4.1-Flash
  'deepseek-flash': {
    peak: { hit: 0.006, miss: 0.30, output: 1.20 },
    offPeak: { hit: 0.003, miss: 0.15, output: 0.60 },
  },
  // deepseek-v4-pro
  'deepseek-v4-pro': {
    peak: { hit: 0.044, miss: 1.32, output: 3.96 },
    offPeak: { hit: 0.022, miss: 0.66, output: 1.98 },
  },
  // 兼容旧模型名，按 flash 口径
  'deepseek-chat': {
    peak: { hit: 0.006, miss: 0.30, output: 1.20 },
    offPeak: { hit: 0.003, miss: 0.15, output: 0.60 },
  },
  'deepseek-reasoner': {
    peak: { hit: 0.044, miss: 1.32, output: 3.96 },
    offPeak: { hit: 0.022, miss: 0.66, output: 1.98 },
  },
}

export const PRICING_VERSION = 'deepseek-2026-10-21'

export function getPricing(model: string): PeakPricing {
  const key = Object.keys(PRICING_TABLE).find(k => model.startsWith(k))
  return PRICING_TABLE[key ?? 'deepseek-chat']!
}

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
export function isPeakHour(
  timestamp: number,
  options: {
    /** 额外标记为空闲的日期，格式 'YYYY-MM-DD'（北京时间） */
    extraOffPeakDates?: Set<string>
  } = {},
): boolean {
  const beijing = new Date(timestamp + 8 * 60 * 60 * 1000)
  const day = beijing.getUTCDay() // 0=周日, 6=周六
  if (day === 0 || day === 6) return false

  const dateKey = beijing.toISOString().slice(0, 10)
  if (options.extraOffPeakDates?.has(dateKey)) return false

  const h = beijing.getUTCHours()
  return (h >= 9 && h < 12) || (h >= 14 && h < 18)
}

export interface CostBreakdown {
  total: number
  savedByCache: number
  details: {
    hitCost: number
    missCost: number
    outputCost: number
  }
  isPeak: boolean
  pricingVersion: string
}

export interface CalculateCostOptions {
  /** 请求时间，用于判断峰谷；缺省用 Date.now() */
  timestamp?: number
  extraOffPeakDates?: Set<string>
}

export function calculateCost(
  model: string,
  hitTokens: number,
  missTokens: number,
  outputTokens: number,
  options: CalculateCostOptions = {},
): CostBreakdown {
  const pricing = getPricing(model)
  const isPeak = isPeakHour(options.timestamp ?? Date.now(), {
    extraOffPeakDates: options.extraOffPeakDates,
  })
  const p = isPeak ? pricing.peak : pricing.offPeak

  const h = hitTokens / 1_000_000
  const m = missTokens / 1_000_000
  const o = outputTokens / 1_000_000

  const hitCost = h * p.hit
  const missCost = m * p.miss
  const outputCost = o * p.output

  const total = hitCost + missCost + outputCost
  const savedByCache = h * (p.miss - p.hit)

  return {
    total,
    savedByCache,
    details: { hitCost, missCost, outputCost },
    isPeak,
    pricingVersion: PRICING_VERSION,
  }
}
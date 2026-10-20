// 费率适配器（独立模块，不硬编码在使用逻辑中）
// 数据来源：https://api-docs.deepseek.com/quick_start/pricing
// 获取日期：2026-10-20
// 注意：价格可能随官方调整而变动，如有更新请及时修改此文件并提交 PR。

export interface ModelPricing {
  hit: number       // 缓存命中输入 ($/M tokens)
  miss: number      // 缓存未命中输入 ($/M tokens)
  output: number    // 输出 ($/M tokens)
}

export const PRICING_TABLE: Record<string, ModelPricing> = {
  'deepseek-chat': {
    hit: 0.014,
    miss: 0.14,
    output: 0.28,
  },
  'deepseek-reasoner': {
    hit: 0.14,
    miss: 0.55,
    output: 2.19,
  },
}

export function getPricing(model: string): ModelPricing {
  const key = Object.keys(PRICING_TABLE).find(k => model.startsWith(k))
  return PRICING_TABLE[key ?? 'deepseek-chat']!
}

export interface CostBreakdown {
  total: number
  savedByCache: number
  details: {
    hitCost: number
    missCost: number
    outputCost: number
  }
}

export function calculateCost(
  model: string,
  hitTokens: number,
  missTokens: number,
  outputTokens: number,
): CostBreakdown {
  const p = getPricing(model)
  
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
    details: {
      hitCost,
      missCost,
      outputCost,
    }
  }
}
export interface ModelPricing {
  hit: number       // 缓存命中输入 ($/M tokens)
  miss: number      // 缓存未命中输入 ($/M tokens)
  output: number    // 输出 ($/M tokens)
}

// 基于 DeepSeek 官方最新标准定价（单位：美元 / 1M tokens）
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
  // 简单前缀匹配，兼容带后缀的模型名
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
  
  // token 数转为百万单位
  const h = hitTokens / 1_000_000
  const m = missTokens / 1_000_000
  const o = outputTokens / 1_000_000

  const hitCost = h * p.hit
  const missCost = m * p.miss
  const outputCost = o * p.output

  const total = hitCost + missCost + outputCost
  
  // 缓存省下的钱：假设这些命中缓存如果没有命中，需要按未命中价格支付
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
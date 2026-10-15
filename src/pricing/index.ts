// 费率适配器：完全外挂，核心算法不硬编码任何价格

export interface TokenUsage {
  cacheHitInput: number;
  cacheMissInput: number;
  /** 缓存写入候选：不参与计费，仅供行为追踪 */
  cacheWriteCandidate: number;
  output: number;
  reasoning: number;
}

export interface PriceTable {
  /** 币种符号，如 "CNY" / "USD" */
  currency: string;
  /** 缓存命中输入：每 1M tokens 价格 */
  cacheHitInputPerM: number;
  /** 缓存未命中输入：每 1M tokens 价格 */
  cacheMissInputPerM: number;
  /** 输出：每 1M tokens 价格 */
  outputPerM: number;
  /** 推理：不单独计费时为 0，或等于 output 单价 */
  reasoningPerM: number;
}

export interface PricingAdapter {
  id: string;
  /** 返回某模型某时刻的价格表；返回 null 表示未知 */
  getPrice(model: string, at?: Date): PriceTable | null;
}

export interface CostBreakdown {
  currency: string;
  cacheHitInput: number;
  cacheMissInput: number;
  output: number;
  reasoning: number;
  total: number;
  /** 未收录的模型/费率缺失时为 true */
  unknown: boolean;
  notes: string[];
}

/**
 * 用户需要根据自己的合同价填入价格表。
 * 本插件不硬编码任何价格。
 */
export class StaticPricingAdapter implements PricingAdapter {
  readonly id = 'static';
  private readonly table: Map<string, PriceTable>;

  constructor(table: Record<string, PriceTable>) {
    this.table = new Map(Object.entries(table));
  }

  getPrice(model: string, at?: Date): PriceTable | null {
    void at;
    return this.table.get(model) ?? null;
  }
}

/** 兜底适配器：永远返回 null，调用方需处理 unknown 场景 */
export class UnknownPricingAdapter implements PricingAdapter {
  readonly id = 'unknown';
  getPrice(): PriceTable | null {
    return null;
  }
}

export function computeCost(
  adapter: PricingAdapter,
  model: string,
  usage: TokenUsage,
  at?: Date,
): CostBreakdown {
  const price = adapter.getPrice(model, at);
  if (!price) {
    return {
      currency: 'UNKNOWN',
      cacheHitInput: 0,
      cacheMissInput: 0,
      output: 0,
      reasoning: 0,
      total: 0,
      unknown: true,
      notes: [`no price for model ${model}; configure a PricingAdapter`],
    };
  }

  const M = 1_000_000;
  const notes: string[] = [];
  if (usage.cacheWriteCandidate > 0) {
    notes.push('cache write candidate not billed (DeepSeek does not charge separately)');
  }

  const cacheHitInput = (usage.cacheHitInput / M) * price.cacheHitInputPerM;
  const cacheMissInput = (usage.cacheMissInput / M) * price.cacheMissInputPerM;
  const output = (usage.output / M) * price.outputPerM;
  const reasoning = (usage.reasoning / M) * price.reasoningPerM;

  return {
    currency: price.currency,
    cacheHitInput,
    cacheMissInput,
    output,
    reasoning,
    total: cacheHitInput + cacheMissInput + output + reasoning,
    unknown: false,
    notes,
  };
}
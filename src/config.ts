import z from '@deepseek-ai/schemastery'

export const NS = 'token-optima'

export interface Config {
  enabled: boolean
  blockSize: number
  driftThreshold: number
  hashSalt: string
  budgetSession: number
  budgetDaily: number
  budgetMonthly: number
  reasoningEffort: string
  inlineTools: boolean
  dynamicEffort: boolean
  debug: boolean
}

export const Config = z.object({
  enabled: z.boolean().default(true),
  blockSize: z.number().default(64),
  driftThreshold: z.number().default(0.03),
  // 安全合规：默认不添加自定义盐值，仅用空字符串（避免用户误解为加密）
  hashSalt: z.string().default(''),
  budgetSession: z.number().default(0),
  budgetDaily: z.number().default(0),
  budgetMonthly: z.number().default(0),
  reasoningEffort: z.string().default('high'),
  inlineTools: z.boolean().default(true),
  dynamicEffort: z.boolean().default(true),
  // 安全合规：默认关闭调试模式，防止泄露上下文
  debug: z.boolean().default(false),
})
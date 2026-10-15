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
}

export const Config = z.object({
  enabled: z.boolean().default(true),
  blockSize: z.number().default(64),
  driftThreshold: z.number().default(0.03),
  hashSalt: z.string().default('dsh-token-optima-v1'),
  budgetSession: z.number().default(0),
  budgetDaily: z.number().default(0),
  budgetMonthly: z.number().default(0),
  reasoningEffort: z.string().default('high'),
  inlineTools: z.boolean().default(true),
  dynamicEffort: z.boolean().default(true),
})
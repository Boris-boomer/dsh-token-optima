import type { Context } from '@deepseek-ai/cordis'
import type { SessionFold } from './session-fold.js'

interface ToolRegistry {
  register?: (def: Record<string, unknown>) => void
}

export function registerTools(ctx: Context, fold: SessionFold): void {
  let tools: ToolRegistry | undefined
  try {
    const getFn = (ctx as any)?.get
    if (typeof getFn === 'function') {
      tools = getFn.call(ctx, 'tools', false) as ToolRegistry | undefined
    }
  } catch {
    tools = undefined
  }

  if (!tools?.register) {
    console.warn('[dsh-token-optima] ctx.tools unavailable; token_report / context_audit not registered')
    return
  }

  // token_report 工具
  tools.register({
    name: 'token_report',
    description:
      '返回当前会话的 14 类 Token 归因数据（只读）。每项标注精度：exact（API 真值）/ inferred（推断）/ estimated（估算）。',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '会话 ID' },
        format: { type: 'string', enum: ['json', 'csv'], description: '返回格式，默认 json' },
      },
      required: ['sessionId'],
    },
    output: {
      schema: { type: 'object' },
      render: (_args: unknown, value: unknown) => [
        { type: 'text', text: JSON.stringify(value, null, 2) },
      ],
    },
    async execute(args: Record<string, unknown>) {
      const sessionId = String(args['sessionId'] ?? '')
      const format = args['format'] === 'csv' ? 'csv' : 'json'
      if (format === 'csv') {
        return { format: 'csv', content: fold.exportCsv(sessionId) }
      }
      return {
        format: 'json',
        report: fold.report(sessionId),
        composition: fold.composition(sessionId),
        groups: fold.groups(sessionId),
      }
    },
  })

  // context_audit 工具
  tools.register({
    name: 'context_audit',
    description:
      '展开当前保留 surface 中指定消息的原始文本（只读）。已被压缩替换的消息不再可见。',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        messageId: { type: 'string', description: 'surface 节点的 seq' },
      },
      required: ['sessionId', 'messageId'],
    },
    output: {
      schema: { type: 'object' },
      render: (_args: unknown, value: unknown) => [
        { type: 'text', text: JSON.stringify(value, null, 2) },
      ],
    },
    async execute(args: Record<string, unknown>) {
      return fold.audit(String(args['sessionId'] ?? ''), String(args['messageId'] ?? ''))
    },
  })
}
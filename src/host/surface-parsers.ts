import { createHash } from 'node:crypto'
import type { AssignableSource, DeepSeekUsage } from '../core/types.js'

/**
 * 从事件对象里提取纯文本。
 *
 * 事件结构：event.data.message.content（也可能直接 event.data.content）。
 */
export function extractText(event: Record<string, unknown>): string {
  const data = (event['data'] ?? {}) as Record<string, unknown>
  const msg = (data['message'] ?? data) as Record<string, unknown>
  const content = msg['content']
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const block of content) {
      if (typeof block === 'string') {
        parts.push(block)
        continue
      }
      if (block && typeof block === 'object') {
        const b = block as Record<string, unknown>
        const t = b['text']
        if (typeof t === 'string') parts.push(t)
      }
    }
    return parts.join('')
  }
  return ''
}

/**
 * 从 stream 里提取 reasoning 文本（用于 reasoning lifecycle 统计）。
 */
export function extractReasoningText(event: Record<string, unknown>): string {
  const data = (event['data'] ?? {}) as Record<string, unknown>
  const stream = data['stream']
  if (!Array.isArray(stream)) return ''
  const parts: string[] = []
  for (const chunk of stream) {
    if (!chunk || typeof chunk !== 'object') continue
    const c = chunk as Record<string, unknown>
    if (c['type'] === 'reasoning' && typeof c['text'] === 'string') {
      parts.push(c['text'] as string)
    }
  }
  return parts.join('')
}

const SURFACE_MARKERS_AGENTS = /AGENTS\.md/i
const SURFACE_MARKERS_SKILL = /(?:^|\n)\s*(?:#+\s*)?skills?[:\s]/i

/**
 * 把事件类型 + 文本内容映射到来源分类。
 */
export function classifySource(type: string, text: string): AssignableSource {
  if (type === 'system/message') {
    if (SURFACE_MARKERS_AGENTS.test(text)) return 'agents_md'
    if (SURFACE_MARKERS_SKILL.test(text)) return 'skills'
    return 'system'
  }
  if (type === 'user/message') return 'user_msg'
  if (type === 'assistant/message') return 'assistant_msg'
  if (type === 'tool/message' || type === 'tool/result') return 'tool_result'
  return 'injected_ctx'
}

/**
 * 把原始 usage 结构规范化成 DeepSeekUsage。
 */
export function normalizeUsage(
  usage: Record<string, unknown> | undefined,
): DeepSeekUsage {
  const input = numberOr(usage?.['inputTokens'], 0)
  const cacheRead = numberOr(usage?.['cacheReadTokens'], 0)
  const cacheWrite = numberOr(usage?.['cacheWriteTokens'], 0)
  const output = numberOr(usage?.['outputTokens'], 0)

  const prompt = input + cacheRead + cacheWrite
  const miss = input + cacheWrite

  const details = usage?.['completion_tokens_details'] as
    | Record<string, unknown>
    | undefined
  const reasoning =
    numberOr(details?.['reasoning_tokens'], 0) ||
    numberOr(usage?.['reasoningTokens'], 0)

  return {
    prompt_tokens: prompt,
    prompt_cache_hit_tokens: cacheRead,
    prompt_cache_miss_tokens: miss,
    completion_tokens: output,
    completion_tokens_details: {
      reasoning_tokens: reasoning,
    },
  }
}

/**
 * 对 surface seq 列表生成短签名（用于检测 surface 变化）。
 */
export function signatureOf(seqs: number[]): string {
  return createHash('sha1').update(seqs.join(',')).digest('hex').slice(0, 16)
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
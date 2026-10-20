import type { TurnAttribution } from '../core/types.js'

/**
 * 防范 CSV 注入攻击 (CSV Injection)。
 * 如果单元格内容以 =, +, -, @ 等符号开头，Excel 会将其视为公式并执行。
 * 通过在前面加上单引号 ' 强制作为纯文本展示。
 */
function sanitizeCell(cell: string | number): string {
  const s = String(cell)
  // 检查危险前缀（包括制表符和回车）
  if (/^[=+\-@\t\r]/.test(s)) {
    return `'${s}`
  }
  // 如果包含逗号、双引号或换行，则需要转义包裹
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCsv(rows: TurnAttribution[]): string {
  const header = [
    'turnId',
    'timestamp',
    'model',
    ...Array.from({ length: 14 }, (_, i) => `c${i + 1}`),
    'unattributed',
    'alignmentDrift',
    'hitBlocks',
    'missBlocks',
    'writeBlocks',
    'reasoningProduced',
    'reasoningReplayed',
    'costTotal',
    'costSavedByCache'
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    const rawCells: Array<string | number> = [
      r.turnId,
      r.timestamp,
      r.model,
      ...Array.from({ length: 14 }, (_, i) => r.categories[i + 1]?.value ?? 0),
      r.unattributed.value,
      r.alignmentDrift.toFixed(4),
      r.cacheBlocks.hitBlocks,
      r.cacheBlocks.missBlocks,
      r.cacheBlocks.writeCandidateBlocks,
      r.reasoning.producedThisTurn,
      r.reasoning.replayedInInput,
      r.cost?.total ?? 0,
      r.cost?.savedByCache ?? 0,
    ]
    
    // 应用 sanitize 并拼接
    lines.push(rawCells.map(sanitizeCell).join(','))
  }
  return lines.join('\n')
}
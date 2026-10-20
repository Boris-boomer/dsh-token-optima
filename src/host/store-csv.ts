import type { TurnAttribution } from '../core/types.js'

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
    'costTotal',       // 新增
    'costSavedByCache' // 新增
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    const cells: Array<string | number> = [
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
      r.cost?.total ?? 0,         // 新增
      r.cost?.savedByCache ?? 0,  // 新增
    ]
    lines.push(cells.join(','))
  }
  return lines.join('\n')
}
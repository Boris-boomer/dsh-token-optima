import type { FC } from 'react'
import { colors, groupColors } from './styles.js'

export interface TrendEntry {
  turnId: string
  total: number
  groups: Record<string, number>
  hitBlocks: number
  missBlocks: number
  writeBlocks: number
  compressed: boolean
  cacheInvalidated: boolean
}

interface Props {
  entries: TrendEntry[]
  dark: boolean
}

export const Trend: FC<Props> = ({ entries }) => {
  if (entries.length === 0) {
    return <div style={{ color: colors.muted, fontSize: '0.92em' }}>暂无历史</div>
  }

  const width = 384
  const height = 120
  const gap = 2
  const maxTotal = Math.max(1, ...entries.map((e) => e.total))
  const barWidth = Math.max(2, (width - gap * (entries.length - 1)) / entries.length)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', maxWidth: '100%' }}
    >
      {entries.map((e, i) => {
        const x = i * (barWidth + gap)
        let y = height - 18
        const groupOrder = ['input', 'cache', 'output', 'reasoning']
        return (
          <g key={e.turnId}>
            {groupOrder.map((gk) => {
              const v = e.groups[gk] ?? 0
              if (v === 0) return null
              const h = (v / maxTotal) * (height - 30)
              const rect = (
                <rect
                  key={gk}
                  x={x}
                  y={y - h}
                  width={barWidth}
                  height={h}
                  fill={groupColors[gk] ?? colors.accent}
                />
              )
              y -= h
              return rect
            })}
            {e.cacheInvalidated && (
              <text
                x={x + barWidth / 2}
                y={12}
                textAnchor="middle"
                fontSize="0.78em"
                fill={colors.muted}
              >
                ⚡
              </text>
            )}
            {e.compressed && (
              <text
                x={x + barWidth / 2}
                y={height - 4}
                textAnchor="middle"
                fontSize="0.78em"
                fill={colors.muted}
              >
                ✂
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
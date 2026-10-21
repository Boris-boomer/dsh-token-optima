import { useState, type FC, type ReactElement } from 'react'
import { groupColor, type Theme } from './theme.js'
import { formatNumber } from './format.js'

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
  theme: Theme
}

const ORDER = ['input', 'cache', 'output', 'reasoning'] as const

export const Trend: FC<Props> = ({ entries, theme }) => {
  const [hover, setHover] = useState<number | null>(null)

  if (entries.length === 0) {
    return (
      <div style={{ color: theme.textTertiary, fontSize: 12, padding: '12px 0' }}>
        暂无历史
      </div>
    )
  }

  const width = 412
  const height = 132
  const paddingTop = 18
  const paddingBottom = 6
  const chartH = height - paddingTop - paddingBottom
  const gap = 3
  const barW = Math.max(3, (width - gap * (entries.length - 1)) / entries.length)

  const maxTotal = Math.max(1, ...entries.map((e) => e.total))

  const gridLines = [0.25, 0.5, 0.75, 1].map((r) => ({
    y: paddingTop + chartH - r * chartH,
    label: formatNumber(maxTotal * r),
  }))

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block', maxWidth: '100%' }}
        onMouseLeave={() => setHover(null)}
      >
        {gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={0}
              x2={width}
              y1={g.y}
              y2={g.y}
              stroke={theme.divider}
              strokeDasharray="2 4"
            />
            <text
              x={0}
              y={g.y - 3}
              fontSize="9"
              fill={theme.textTertiary}
              fontFamily={theme.fontMono}
            >
              {g.label}
            </text>
          </g>
        ))}

        {entries.map((e, i) => {
          const x = i * (barW + gap)
          let y = paddingTop + chartH
          const isHovered = hover === i
          const opacity = hover === null || isHovered ? 1 : 0.4

          const rects: ReactElement[] = []
          for (const g of ORDER) {
            const v = e.groups[g] ?? 0
            if (v === 0) continue
            const h = (v / maxTotal) * chartH
            rects.push(
              <rect
                key={g}
                x={x}
                y={y - h}
                width={barW}
                height={h}
                fill={groupColor(theme, g)}
                opacity={opacity}
                rx={i === 0 ? 1 : 0}
              />,
            )
            y -= h
          }

          return (
            <g
              key={e.turnId}
              onMouseEnter={() => setHover(i)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={x}
                y={paddingTop}
                width={barW}
                height={chartH}
                fill="transparent"
              />
              {rects}
              {e.cacheInvalidated && (
                <circle
                  cx={x + barW / 2}
                  cy={8}
                  r={2}
                  fill={theme.warning}
                  opacity={hover === null || isHovered ? 1 : 0.4}
                />
              )}
            </g>
          )
        })}

        {hover !== null && entries[hover] && (
          <line
            x1={hover * (barW + gap) + barW / 2}
            x2={hover * (barW + gap) + barW / 2}
            y1={paddingTop}
            y2={paddingTop + chartH}
            stroke={theme.borderStrong}
            strokeDasharray="2 3"
            pointerEvents="none"
          />
        )}
      </svg>

      {hover !== null && entries[hover] && (
        <div
          className="to-tooltip"
          style={{
            left: Math.min(
              width - 140,
              Math.max(0, hover * (barW + gap) + barW / 2 - 60),
            ),
            top: 0,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 3 }}>
            #{hover + 1} · {formatNumber(entries[hover].total)} tokens
          </div>
          {ORDER.map((g) => {
            const v = entries[hover]!.groups[g] ?? 0
            if (v === 0) return null
            return (
              <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: groupColor(theme, g),
                  }}
                />
                <span style={{ color: theme.textSecondary, flex: 1 }}>{g}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(v)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
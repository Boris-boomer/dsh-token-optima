import type { FC } from 'react'
import { colors, groupColors, precisionOpacity } from './styles'

export interface CompositionEntry {
  id: number
  key: string
  label: string
  group: string
  value: number
  precision: string
}

export interface GroupEntry {
  group: string
  label: string
  value: number
}

interface Props {
  groups: GroupEntry[]
  composition: CompositionEntry[]
  dark: boolean
}

export const Composition: FC<Props> = ({ groups, composition, dark }) => {
  const total = groups.reduce((a, g) => a + g.value, 0)
  const size = 170
  const stroke = 24
  const cx = size / 2
  const cy = size / 2
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r

  let offset = 0
  const arcs = total > 0
    ? groups.map((g) => {
        const frac = g.value / total
        const dash = frac * circumference
        const arc = {
          color: groupColors[g.group] ?? colors.accent,
          dash,
          gap: circumference - dash,
          offset,
        }
        offset += dash
        return arc
      })
    : []

  return (
    <div>
      <div style={{ display: 'flex', gap: '1em', alignItems: 'center' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
            strokeWidth={stroke}
          />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={stroke}
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeDashoffset={-a.offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          ))}
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            fontSize="1.5em"
            fontWeight="600"
            fill={dark ? colors.text : colors.textLight}
          >
            {total}
          </text>
          <text
            x={cx}
            y={cy + 20}
            textAnchor="middle"
            fontSize="0.85em"
            fill={colors.muted}
          >
            tokens
          </text>
        </svg>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5em' }}>
          {groups.map((g) => (
            <div key={g.group} style={{ display: 'flex', alignItems: 'center', gap: '0.7em' }}>
              <span
                style={{
                  width: '0.85em',
                  height: '0.85em',
                  borderRadius: '0.43em',
                  background: groupColors[g.group] ?? colors.accent,
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1 }}>{g.label}</span>
              <span
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 500,
                }}
              >
                {g.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {composition.length > 0 && (
        <div style={{ marginTop: '1em' }}>
          <details>
            <summary
              style={{
                cursor: 'pointer',
                color: colors.muted,
                marginBottom: '0.6em',
                fontSize: '0.92em',
                userSelect: 'none',
              }}
            >
              14 类明细
            </summary>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.92em',
              }}
            >
              <tbody>
                {composition.map((c) => (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: `1px solid ${
                        dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
                      }`,
                    }}
                  >
                    <td style={{ padding: '0.4em 0.4em', opacity: 0.6, width: '2.2em' }}>{c.id}</td>
                    <td
                      style={{
                        padding: '0.4em 0.4em',
                        color: groupColors[c.group],
                        opacity: precisionOpacity[c.precision] ?? 1,
                      }}
                    >
                      {c.label}
                    </td>
                    <td
                      style={{
                        padding: '0.4em 0.4em',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 500,
                      }}
                    >
                      {c.value}
                    </td>
                    <td
                      style={{
                        padding: '0.4em 0.4em',
                        color: colors.muted,
                        fontSize: '0.85em',
                        textAlign: 'right',
                        width: '3em',
                      }}
                    >
                      {c.precision === 'exact'
                        ? '实测'
                        : c.precision === 'inferred'
                          ? '推断'
                          : '估算'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </div>
  )
}
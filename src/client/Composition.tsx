import { useState, type FC } from 'react'
import { groupColor, type Theme } from './theme.js'
import { formatNumber, formatPercent } from './format.js'

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
  theme: Theme
}

const PrecisionPill: FC<{ theme: Theme; precision: string }> = ({ theme, precision }) => {
  const cfg =
    precision === 'exact'
      ? { label: '实测', color: theme.success, bg: theme.successSoft }
      : precision === 'inferred'
        ? { label: '推断', color: theme.warning, bg: theme.warningSoft }
        : { label: '估算', color: theme.textTertiary, bg: theme.surfaceHover }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 7px',
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 500,
        color: cfg.color,
        background: cfg.bg,
        letterSpacing: '0.02em',
      }}
    >
      {cfg.label}
    </span>
  )
}

export const Composition: FC<Props> = ({ groups, composition, theme }) => {
  const [hover, setHover] = useState<string | null>(null)
  const total = groups.reduce((a, g) => a + g.value, 0)

  const size = 168
  const stroke = 20
  const center = size / 2
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const gapRatio = 0.007

  let acc = 0
  const segments = groups
    .filter((g) => g.value > 0)
    .map((g) => {
      const frac = total > 0 ? g.value / total : 0
      const dash = Math.max(0, frac * circumference - circumference * gapRatio)
      const offset = acc * circumference
      acc += frac
      return {
        group: g.group,
        label: g.label,
        value: g.value,
        pct: frac * 100,
        color: groupColor(theme, g.group),
        dash,
        offset,
      }
    })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={theme.divider}
              strokeWidth={stroke}
            />
            {segments.map((s) => (
              <circle
                key={s.group}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === s.group ? stroke + 3 : stroke}
                strokeDasharray={`${s.dash} ${circumference - s.dash}`}
                strokeDashoffset={-s.offset}
                transform={`rotate(-90 ${center} ${center})`}
                style={{
                  transition: 'stroke-width 160ms ease, opacity 160ms ease',
                  opacity: hover && hover !== s.group ? 0.35 : 1,
                }}
              />
            ))}
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              {formatNumber(total)}
            </div>
            <div
              style={{
                fontSize: 9,
                color: theme.textTertiary,
                marginTop: 5,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                fontWeight: 500,
              }}
            >
              tokens
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {groups.map((g) => {
            const pct = total > 0 ? (g.value / total) * 100 : 0
            const active = hover === g.group
            return (
              <div
                key={g.group}
                onMouseEnter={() => setHover(g.group)}
                onMouseLeave={() => setHover(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: active ? theme.surfaceHover : 'transparent',
                  transition: 'background-color 130ms ease',
                  cursor: 'default',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: groupColor(theme, g.group),
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, fontSize: 12.5, color: theme.text }}>{g.label}</span>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    color: theme.text,
                  }}
                >
                  {formatNumber(g.value)}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: theme.textTertiary,
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 42,
                    textAlign: 'right',
                  }}
                >
                  {formatPercent(pct, 1)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {composition.length > 0 && (
        <details className="to-details" style={{ marginTop: 14 }}>
          <summary
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 0',
              fontSize: 12,
              color: theme.textSecondary,
              borderTop: `1px solid ${theme.divider}`,
            }}
          >
            <span className="to-chevron">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
            14 类明细
          </summary>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                {['#', '类别', 'Tokens', '精度'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      textAlign: i === 2 || i === 3 ? 'right' : 'left',
                      padding: '8px 0 10px',
                      fontSize: 10,
                      fontWeight: 500,
                      color: theme.textTertiary,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      width: i === 0 ? 28 : i === 3 ? 62 : undefined,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {composition.map((c) => (
                <tr key={c.id} style={{ borderTop: `1px solid ${theme.divider}` }}>
                  <td
                    style={{
                      padding: '8px 0',
                      color: theme.textTertiary,
                      fontFamily: theme.fontMono,
                      fontSize: 10.5,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {String(c.id).padStart(2, '0')}
                  </td>
                  <td style={{ padding: '8px 0', color: theme.text }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: groupColor(theme, c.group),
                        marginRight: 8,
                        verticalAlign: 'middle',
                      }}
                    />
                    {c.label}
                  </td>
                  <td
                    style={{
                      padding: '8px 0',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 500,
                      color: theme.text,
                    }}
                  >
                    {formatNumber(c.value)}
                  </td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>
                    <PrecisionPill theme={theme} precision={c.precision} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  )
}
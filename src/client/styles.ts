import type React from 'react'

export const colors = {
  bg: 'rgba(20, 22, 28, 0.96)',
  bgLight: 'rgba(255, 255, 255, 0.98)',
  border: 'rgba(255, 255, 255, 0.12)',
  borderLight: 'rgba(0, 0, 0, 0.12)',
  text: '#e8e8ea',
  textLight: '#1a1a1c',
  muted: '#8b8b95',
  accent: '#4A90E2',
  input: '#4A90E2',
  cache: '#50C878',
  output: '#F5A623',
  reasoning: '#9B59B6',
} as const

export const groupColors: Record<string, string> = {
  input: colors.input,
  cache: colors.cache,
  output: colors.output,
  reasoning: colors.reasoning,
}

export const precisionOpacity: Record<string, number> = {
  exact: 1.0,
  inferred: 0.75,
  estimated: 0.55,
}

export interface InheritedFont {
  fontFamily: string
  fontSize: string
  lineHeight: string
}

export function readInheritedFont(): InheritedFont {
  try {
    const s = getComputedStyle(document.body)
    return {
      fontFamily: s.fontFamily || 'system-ui, -apple-system, sans-serif',
      fontSize: s.fontSize || '14px',
      lineHeight: s.lineHeight && s.lineHeight !== 'normal' ? s.lineHeight : '1.5',
    }
  } catch {
    return {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      lineHeight: '1.5',
    }
  }
}

export function detectDark(): boolean {
  try {
    const el = document.documentElement
    let bg = getComputedStyle(document.body).backgroundColor
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
      bg = getComputedStyle(el).backgroundColor
    }
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (!m) return true
    return (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 < 128
  } catch {
    return true
  }
}

export function panelStyle(dark: boolean, font: InheritedFont): React.CSSProperties {
  return {
    position: 'fixed',
    right: 24,
    bottom: 24,
    width: 420,
    maxHeight: '80vh',
    overflow: 'auto',
    background: dark ? colors.bg : colors.bgLight,
    color: dark ? colors.text : colors.textLight,
    border: `1px solid ${dark ? colors.border : colors.borderLight}`,
    borderRadius: 14,
    boxShadow: '0 10px 40px rgba(0,0,0,0.36)',
    fontFamily: font.fontFamily,
    fontSize: font.fontSize,
    lineHeight: font.lineHeight,
    padding: '1.2em',
    zIndex: 99999,
    backdropFilter: 'blur(12px)',
  }
}

export function buttonStyle(dark: boolean, active = false): React.CSSProperties {
  return {
    position: 'fixed',
    right: 24,
    bottom: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    border: 'none',
    background: active ? colors.accent : dark ? colors.bg : colors.bgLight,
    color: dark ? colors.text : colors.textLight,
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(0,0,0,0.32)',
    fontSize: '1.4em',
    zIndex: 99999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
}
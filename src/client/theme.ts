export interface Theme {
  mode: 'light' | 'dark'
  bg: string
  bgElevated: string
  surface: string
  surfaceHover: string
  surfaceActive: string
  border: string
  borderStrong: string
  divider: string
  text: string
  textSecondary: string
  textTertiary: string
  textInverse: string
  accent: string
  accentSoft: string
  input: string
  inputSoft: string
  cache: string
  cacheSoft: string
  output: string
  outputSoft: string
  reasoning: string
  reasoningSoft: string
  danger: string
  dangerSoft: string
  warning: string
  warningSoft: string
  success: string
  successSoft: string
  shadowSm: string
  shadowMd: string
  shadowLg: string
  fontFamily: string
  fontMono: string
}

const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
const FONT_MONO =
  '"SF Mono", "Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace'

export const DARK: Theme = {
  mode: 'dark',
  bg: '#0B0B0F',
  bgElevated: '#121218',
  surface: '#16161D',
  surfaceHover: '#1C1C25',
  surfaceActive: '#232330',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.11)',
  divider: 'rgba(255,255,255,0.04)',
  text: '#EDEDF2',
  textSecondary: '#8B8B9A',
  textTertiary: '#5A5A68',
  textInverse: '#0B0B0F',
  accent: '#8B7CF6',
  accentSoft: 'rgba(139,124,246,0.14)',
  input: '#60A5FA',
  inputSoft: 'rgba(96,165,250,0.14)',
  cache: '#34D399',
  cacheSoft: 'rgba(52,211,153,0.14)',
  output: '#FBBF24',
  outputSoft: 'rgba(251,191,36,0.14)',
  reasoning: '#F472B6',
  reasoningSoft: 'rgba(244,114,182,0.14)',
  danger: '#F87171',
  dangerSoft: 'rgba(248,113,113,0.14)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251,191,36,0.14)',
  success: '#34D399',
  successSoft: 'rgba(52,211,153,0.14)',
  shadowSm: '0 1px 2px rgba(0,0,0,0.35)',
  shadowMd: '0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)',
  shadowLg: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
  fontFamily: FONT_FAMILY,
  fontMono: FONT_MONO,
}

export const LIGHT: Theme = {
  mode: 'light',
  bg: '#F7F7F9',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceHover: '#F2F2F5',
  surfaceActive: '#EAEAEF',
  border: 'rgba(0,0,0,0.06)',
  borderStrong: 'rgba(0,0,0,0.11)',
  divider: 'rgba(0,0,0,0.04)',
  text: '#14141A',
  textSecondary: '#6B6B7C',
  textTertiary: '#A0A0B0',
  textInverse: '#FFFFFF',
  accent: '#6D5DF0',
  accentSoft: 'rgba(109,93,240,0.10)',
  input: '#3B82F6',
  inputSoft: 'rgba(59,130,246,0.10)',
  cache: '#10B981',
  cacheSoft: 'rgba(16,185,129,0.10)',
  output: '#F59E0B',
  outputSoft: 'rgba(245,158,11,0.10)',
  reasoning: '#EC4899',
  reasoningSoft: 'rgba(236,72,153,0.10)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239,68,68,0.10)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245,158,11,0.10)',
  success: '#10B981',
  successSoft: 'rgba(16,185,129,0.10)',
  shadowSm: '0 1px 2px rgba(0,0,0,0.06)',
  shadowMd: '0 8px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
  shadowLg: '0 24px 64px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.06)',
  fontFamily: FONT_FAMILY,
  fontMono: FONT_MONO,
}

export function groupColor(theme: Theme, group: string): string {
  switch (group) {
    case 'input':
      return theme.input
    case 'cache':
      return theme.cache
    case 'output':
      return theme.output
    case 'reasoning':
      return theme.reasoning
    default:
      return theme.accent
  }
}

export function groupSoft(theme: Theme, group: string): string {
  switch (group) {
    case 'input':
      return theme.inputSoft
    case 'cache':
      return theme.cacheSoft
    case 'output':
      return theme.outputSoft
    case 'reasoning':
      return theme.reasoningSoft
    default:
      return theme.accentSoft
  }
}
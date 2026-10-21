import type { CSSProperties } from 'react'
import type { Theme } from './theme.js'

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

/** 把 Theme 映射成 CSS 变量，供全局样式表使用 */
export function themeToCssVars(t: Theme): CSSProperties {
  return {
    '--to-bg': t.bg,
    '--to-bg-elevated': t.bgElevated,
    '--to-surface': t.surface,
    '--to-surface-hover': t.surfaceHover,
    '--to-surface-active': t.surfaceActive,
    '--to-border': t.border,
    '--to-border-strong': t.borderStrong,
    '--to-divider': t.divider,
    '--to-text': t.text,
    '--to-text-secondary': t.textSecondary,
    '--to-text-tertiary': t.textTertiary,
    '--to-text-inverse': t.textInverse,
    '--to-accent': t.accent,
    '--to-accent-soft': t.accentSoft,
    '--to-input': t.input,
    '--to-cache': t.cache,
    '--to-output': t.output,
    '--to-reasoning': t.reasoning,
    '--to-danger': t.danger,
    '--to-warning': t.warning,
    '--to-success': t.success,
    '--to-shadow-sm': t.shadowSm,
    '--to-shadow-md': t.shadowMd,
    '--to-shadow-lg': t.shadowLg,
    '--to-font': t.fontFamily,
    '--to-font-mono': t.fontMono,
  } as CSSProperties
}

const STYLE_ID = 'dsh-token-optima-global-style'
let injected = false

export function ensureGlobalStyles(): void {
  if (injected) return
  if (document.getElementById(STYLE_ID)) {
    injected = true
    return
  }
  injected = true

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
@keyframes to-fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes to-slide-up { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
@keyframes to-scale-in { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
@keyframes to-spin { to { transform: rotate(360deg) } }
@keyframes to-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }

.dsh-to-root,
.dsh-to-root * {
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.dsh-to-root {
  font-family: var(--to-font);
  color: var(--to-text);
}

.dsh-to-root ::-webkit-scrollbar { width: 8px; height: 8px; }
.dsh-to-root ::-webkit-scrollbar-track { background: transparent; }
.dsh-to-root ::-webkit-scrollbar-thumb {
  background: var(--to-border-strong);
  border-radius: 4px;
}
.dsh-to-root ::-webkit-scrollbar-thumb:hover { background: var(--to-text-tertiary); }

.to-icon-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--to-text-secondary);
  cursor: pointer;
  padding: 0;
  transition: background-color 130ms ease, color 130ms ease, transform 90ms ease;
}
.to-icon-btn:hover { background: var(--to-surface-hover); color: var(--to-text); }
.to-icon-btn:active { transform: scale(0.94); }
.to-icon-btn:disabled { opacity: 0.32; cursor: not-allowed; }
.to-icon-btn:disabled:hover { background: transparent; color: var(--to-text-secondary); }

.to-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 7px;
  border: 1px solid var(--to-border);
  background: var(--to-surface);
  color: var(--to-text);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 130ms ease, border-color 130ms ease, transform 90ms ease;
}
.to-btn:hover { background: var(--to-surface-hover); border-color: var(--to-border-strong); }
.to-btn:active { transform: scale(0.97); }
.to-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.to-select {
  appearance: none;
  -webkit-appearance: none;
  background-color: var(--to-surface-hover);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%238B8B9A' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 5l3 3 3-3'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  background-size: 12px;
  border: 1px solid var(--to-border);
  border-radius: 7px;
  color: var(--to-text);
  padding: 5px 22px 5px 9px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  outline: none;
  transition: border-color 130ms ease, background-color 130ms ease;
  max-width: 140px;
  font-variant-numeric: tabular-nums;
}
.to-select:hover { border-color: var(--to-border-strong); }
.to-select:focus { border-color: var(--to-accent); }
.to-select option { background: var(--to-bg-elevated); color: var(--to-text); }

.to-details > summary {
  list-style: none;
  cursor: pointer;
  user-select: none;
}
.to-details > summary::-webkit-details-marker { display: none; }
.to-details > summary::marker { display: none; }
.to-details > summary .to-chevron {
  display: inline-flex;
  transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1);
}
.to-details[open] > summary .to-chevron { transform: rotate(90deg); }

.to-tooltip {
  position: absolute;
  pointer-events: none;
  padding: 5px 8px;
  background: var(--to-bg-elevated);
  border: 1px solid var(--to-border-strong);
  border-radius: 6px;
  box-shadow: var(--to-shadow-md);
  font-size: 11px;
  color: var(--to-text);
  white-space: nowrap;
  z-index: 100;
  font-variant-numeric: tabular-nums;
}
`
  document.head.appendChild(style)
}
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

export function formatCurrency(n: number, digits = 5): string {
  if (!Number.isFinite(n)) return '$0'
  if (n > 0 && n < 0.00001) return `$${n.toExponential(2)}`
  if (n >= 1) return `$${n.toFixed(2)}`
  return `$${n.toFixed(digits)}`
}

export function formatPercent(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '0%'
  return `${n.toFixed(digits)}%`
}

export function formatTime(ts: number): string {
  try {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  } catch {
    return ''
  }
}
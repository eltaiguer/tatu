import type { Currency } from '../models'

export function toSafeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0
}

export function formatCurrency(amount: number, currency: Currency): string {
  const absAmount = Math.abs(toSafeNumber(amount))
  const formatted = new Intl.NumberFormat('es-UY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absAmount)
  const symbol = currency === 'UYU' ? '$U' : 'US$'
  return `${symbol} ${formatted}`
}

export function formatCurrencyShort(
  amount: number,
  currency: Currency
): string {
  const value = toSafeNumber(amount)
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  const sym = currency === 'UYU' ? '$U' : 'US$'
  if (abs >= 1_000_000) return `${sign}${sym} ${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}${sym} ${(abs / 1_000).toFixed(0)}k`
  return `${sign}${sym} ${Math.round(abs)}`
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function formatDateCompact(date: Date): string {
  return new Intl.DateTimeFormat('es-UY', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date)
}

// Font size that fits a monospace amount on one line inside its container
// (which must set `container-type: inline-size`), capped at `maxPx`. Amounts
// must never be clipped, so long values shrink instead of overflowing.
// JetBrains Mono glyphs advance 0.6em; the extra margin covers letter-spacing
// rounding.
export function fitMonoFontSize(text: string, maxPx: number): string {
  const cqiPerChar = 100 / (Math.max(text.length, 1) * 0.62)
  return `min(${maxPx}px, ${cqiPerChar.toFixed(2)}cqi)`
}

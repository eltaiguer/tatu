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

export function formatCurrencyShort(amount: number, currency: Currency): string {
  const abs = Math.abs(toSafeNumber(amount))
  const sym = currency === 'UYU' ? '$U' : 'US$'
  if (abs >= 1_000_000) return `${sym} ${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sym} ${(abs / 1_000).toFixed(0)}k`
  return formatCurrency(amount, currency)
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

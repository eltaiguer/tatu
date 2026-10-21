// Resumen row shaping: pure helpers the Dashboard view memoizes. The money
// math itself lives in chart-data.ts — these only slice and label it.

import type { Currency, Transaction } from '../../models'
import { getCategoryDisplay } from '../../utils/category-display'
import { buildMonthlyTrendsConverted } from './chart-data'
import type { CategorySpendingDatum } from './chart-data'

// Id of the synthetic "Otros" row/slice (categories beyond the top 7).
export const OTHER_ROW_ID = '__other__'

export interface CategorySpendRow {
  categoryId: string
  label: string
  color: string
  emoji: string
  value: number
  pct: number
}

export interface MonthlyTrendRow {
  key: string
  month: string
  ingresos: number
  gastos: number
  neto: number
}

// Labels each category's spend for the donut/list, with its share of the
// total (0–100).
export function toCategorySpendRows(
  data: CategorySpendingDatum[],
  emojiLookup: Map<string, string>
): CategorySpendRow[] {
  const total = data.reduce((s, r) => s + r.total, 0) || 1
  return data.map((row) => {
    const display = getCategoryDisplay(row.category)
    return {
      categoryId: row.category,
      label: display.label,
      color: display.color,
      emoji: emojiLookup.get(row.category) ?? '',
      value: row.total,
      pct: (row.total / total) * 100,
    }
  })
}

// Date range across counted transactions — used for section period labels.
export function periodRangeLabel(
  countedTransactions: Transaction[]
): string | null {
  if (!countedTransactions.length) return null
  let min = countedTransactions[0].date
  let max = countedTransactions[0].date
  for (const tx of countedTransactions) {
    if (tx.date < min) min = tx.date
    if (tx.date > max) max = tx.date
  }
  const fmt = (d: Date) =>
    d.toLocaleDateString('es-UY', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
  return `${fmt(min)} – ${fmt(max)}`
}

// The donut's slices: the top 7 categories plus an "Otros" slice summing the
// rest (omitted when the rest is zero).
export function buildDonutRows(
  categoryData: CategorySpendRow[],
  totalExpenses: number
): CategorySpendRow[] {
  const top7 = categoryData.slice(0, 7)
  const otherVal = categoryData.slice(7).reduce((s, r) => s + r.value, 0)
  if (otherVal > 0) {
    return [
      ...top7,
      {
        categoryId: OTHER_ROW_ID,
        label: 'Otros',
        color: 'var(--surface-3)',
        emoji: '',
        value: otherVal,
        pct: (otherVal / (totalExpenses || 1)) * 100,
      },
    ]
  }
  return top7
}

// Monthly trend — last 12 months, labelled for the chart axes.
export function buildMonthlyTrendRows(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): MonthlyTrendRow[] {
  return buildMonthlyTrendsConverted(transactions, homeCurrency, fxRate)
    .slice(-12)
    .map((m) => ({
      key: m.month,
      month: new Intl.DateTimeFormat('es-UY', {
        year: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }).format(new Date(m.month + '-01T00:00:00.000Z')),
      ingresos: m.income,
      gastos: m.expense,
      neto: m.net,
    }))
}

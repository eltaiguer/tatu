import type { Currency, Transaction } from '../../models'
import { normalizeCategoryId } from '../categories/category-aliases'
import { convert } from '../currency/convert'
import { isCountedExpense } from '../spending/spending-rules'
import { toMonthKey } from '../../utils/date-utils'
import { median } from './chart-data'
import type { MonthlyTrendRow } from './dashboard-rows'

// Hogar's "Un mes típico": the median household spend over the complete
// months of "Mes a mes" (the same months as the savings verdict), a month
// with no household spend counting as the real $0 it is.

const TOP_CATEGORIES = 3

export interface TypicalMonth {
  // The complete 'YYYY-MM' months used, oldest first.
  months: string[]
  median: number
  min: number
  max: number
  // Each category's own median over those months (a month without it is 0),
  // biggest first. They do not add up to `median`.
  topCategories: { category: string; median: number }[]
}

export function typicalMonth(
  trend: MonthlyTrendRow[],
  rows: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): TypicalMonth | null {
  const complete = trend.filter((m) => m.complete)
  if (complete.length === 0) return null
  const months = complete.map((m) => m.key).sort()
  const wanted = new Set(months)

  // Spend per category per month — the rows and conversion every other
  // expense number in Resumen uses.
  const spend = new Map<string, Map<string, number>>()
  for (const tx of rows) {
    if (!isCountedExpense(tx)) continue
    const key = toMonthKey(tx.date)
    if (!wanted.has(key)) continue
    const category = normalizeCategoryId(tx.category)
    const byMonth = spend.get(category) ?? new Map<string, number>()
    byMonth.set(
      key,
      (byMonth.get(key) ?? 0) +
        convert(tx.amount, tx.currency, homeCurrency, fxRate)
    )
    spend.set(category, byMonth)
  }

  const topCategories = Array.from(spend, ([category, byMonth]) => ({
    category,
    median: median(months.map((m) => byMonth.get(m) ?? 0)),
  }))
    .filter((c) => c.median > 0)
    .sort((a, b) => b.median - a.median || a.category.localeCompare(b.category))
    .slice(0, TOP_CATEGORIES)

  const gastos = complete.map((m) => m.gastos)
  return {
    months,
    median: median(gastos),
    min: Math.min(...gastos),
    max: Math.max(...gastos),
    topCategories,
  }
}

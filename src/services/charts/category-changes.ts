import type { Currency, Transaction } from '../../models'
import { convert } from '../currency/convert'
import { normalizeCategoryId } from '../categories/category-aliases'
import { isCountedExpense } from '../spending/spending-rules'
import { completeMonths } from './complete-months'
import { todayAsUtcDate, toMonthKey } from '../../utils/date-utils'

// "What changed": each category's spend in the latest complete month vs the
// median of the months just before it. Only months fully covered by every
// imported account are compared — a card statement that closes on the 20th,
// or an account imported for fewer months, would otherwise read as a drop
// or a spike that never happened.

export interface CategoryChange {
  category: string
  // Spend in the reference month (home currency).
  current: number
  // Spend in each baseline month, oldest first (0 when none).
  baselineByMonth: number[]
  median: number
  delta: number
  // Relative change; null when the baseline is too small for a % to mean
  // anything.
  pct: number | null
}

export type CategoryChanges =
  | {
      kind: 'ok'
      reference: string // 'YYYY-MM'
      baseline: string[] // 'YYYY-MM', oldest first
      increases: CategoryChange[]
      decrease?: CategoryChange
    }
  | { kind: 'insufficient'; reference?: string }

// Changes smaller than this (US$ 10 in the home currency) are noise.
const NOISE_FLOOR_USD = 10
const BASELINE_MONTHS = 3

function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return toMonthKey(d)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

export function categoryChanges(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number,
  now: Date = new Date(),
  // The rows that say what was imported, when `transactions` is a subset
  // (Hogar mode): which months are complete is about the statements.
  coverage: Transaction[] = transactions
): CategoryChanges {
  // Today's month where the user is (todayAsUtcDate reads the local day).
  const complete = completeMonths(coverage, toMonthKey(todayAsUtcDate(now)))
  if (complete.size === 0) {
    return { kind: 'insufficient' }
  }
  // Latest month complete for every account.
  const reference = Array.from(complete).sort().reverse()[0]

  // The months immediately before it, contiguous: stop at the first
  // incomplete one (the range link opens every month between the ends).
  const baseline: string[] = []
  for (let i = 1; i <= BASELINE_MONTHS; i++) {
    const m = shiftMonth(reference, -i)
    if (!complete.has(m)) break
    baseline.unshift(m)
  }
  if (baseline.length < 2) return { kind: 'insufficient', reference }

  // Expense spend per category per month — the same rows and conversion
  // every other expense number in Resumen uses.
  const wanted = new Set([reference, ...baseline])
  const spend = new Map<string, Map<string, number>>()
  for (const tx of transactions) {
    if (!isCountedExpense(tx)) continue
    const month = toMonthKey(tx.date)
    if (!wanted.has(month)) continue
    const category = normalizeCategoryId(tx.category)
    const byMonth = spend.get(category) ?? new Map<string, number>()
    byMonth.set(
      month,
      (byMonth.get(month) ?? 0) +
        convert(tx.amount, tx.currency, homeCurrency, fxRate)
    )
    spend.set(category, byMonth)
  }

  const floor = convert(NOISE_FLOOR_USD, 'USD', homeCurrency, fxRate)
  const rows: CategoryChange[] = Array.from(spend.entries()).map(
    ([category, byMonth]) => {
      const current = byMonth.get(reference) ?? 0
      const baselineByMonth = baseline.map((m) => byMonth.get(m) ?? 0)
      const med = median(baselineByMonth)
      const delta = current - med
      return {
        category,
        current,
        baselineByMonth,
        median: med,
        delta,
        pct: med >= floor ? delta / med : null,
      }
    }
  )

  const increases = rows
    .filter((r) => r.delta >= floor)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3)
  const decrease = rows
    .filter((r) => r.delta <= -floor)
    .sort((a, b) => a.delta - b.delta)[0]

  return {
    kind: 'ok',
    reference,
    baseline,
    increases,
    ...(decrease && { decrease }),
  }
}

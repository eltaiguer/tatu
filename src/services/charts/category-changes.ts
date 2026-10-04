import type { Currency, Transaction } from '../../models'
import { convert } from '../currency/convert'
import { normalizeCategoryId } from '../categories/category-aliases'
import { isExcludedFromTotals } from './chart-data'
import { toMonthKey } from '../../utils/date-utils'

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
const EDGE_DAYS = 3
const BASELINE_MONTHS = 3

type AccountKey = 'card' | 'usd' | 'uyu'

function accountOf(tx: Transaction): AccountKey {
  if (tx.source === 'credit_card') return 'card'
  return tx.currency === 'USD' ? 'usd' : 'uyu'
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return toMonthKey(d)
}

function lastDay(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
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
  now: Date = new Date()
): CategoryChanges {
  // Coverage: the first and last day each account has data for.
  const coverage = new Map<AccountKey, { first: string; last: string }>()
  for (const tx of transactions) {
    if (tx.isSplitParent) continue
    const day = isoDay(tx.date)
    const key = accountOf(tx)
    const c = coverage.get(key)
    if (!c) coverage.set(key, { first: day, last: day })
    else {
      if (day < c.first) c.first = day
      if (day > c.last) c.last = day
    }
  }
  if (coverage.size === 0) return { kind: 'insufficient' }

  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const pad = (n: number) => String(n).padStart(2, '0')
  // An account constrains a month only if it has data on or after the
  // month's start: then it must already have started by then (not imported
  // later) and must run to the month's end (a statement closing on the 20th
  // leaves the month partial). An account with no data from that month on
  // is treated as dormant, not as missing — otherwise a quiet account would
  // block every comparison.
  const isComplete = (month: string) => {
    if (month >= currentMonth) return false
    const monthStart = `${month}-01`
    const startBy = `${month}-${pad(EDGE_DAYS)}`
    const endFrom = `${month}-${pad(lastDay(month) - EDGE_DAYS)}`
    return Array.from(coverage.values()).every(
      (c) => c.last < monthStart || (c.first <= startBy && c.last >= endFrom)
    )
  }

  // Latest month complete for every account.
  const lastData = Array.from(coverage.values())
    .map((c) => c.last.slice(0, 7))
    .sort()
    .reverse()[0]
  const firstData = Array.from(coverage.values())
    .map((c) => c.first.slice(0, 7))
    .sort()[0]
  let reference: string | undefined
  for (let m = lastData; m >= firstData; m = shiftMonth(m, -1)) {
    if (isComplete(m)) {
      reference = m
      break
    }
  }
  if (!reference) return { kind: 'insufficient' }

  // The months immediately before it — no skipping over gaps.
  const baseline: string[] = []
  for (let i = BASELINE_MONTHS; i >= 1; i--) {
    const m = shiftMonth(reference, -i)
    if (isComplete(m)) baseline.push(m)
  }
  if (baseline.length < 2) return { kind: 'insufficient', reference }

  // Expense spend per category per month — the same rows and conversion
  // every other expense number in Resumen uses.
  const wanted = new Set([reference, ...baseline])
  const spend = new Map<string, Map<string, number>>()
  for (const tx of transactions) {
    if (tx.type !== 'debit' || isExcludedFromTotals(tx)) continue
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
      const current = byMonth.get(reference!) ?? 0
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

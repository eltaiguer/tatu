import type { Currency, Transaction } from '../../models'
import { convert } from '../currency/convert'
import { normalizeCategoryId } from '../categories/category-aliases'
import { isCountedExpense, countsAsRow } from '../spending/spending-rules'
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
// Longer than a statement cycle plus import delay: an account silent for
// this long before a month is dormant for it, not "not imported yet".
const DORMANT_AFTER_DAYS = 45

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

function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
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
    // Ignored rows (transfers) still prove the account has data that day.
    if (!countsAsRow(tx)) continue
    const day = isoDay(tx.date)
    const key = accountOf(tx)
    const entry = coverage.get(key) ?? {
      first: day,
      last: day,
    }
    if (day < entry.first) entry.first = day
    if (day > entry.last) entry.last = day
    coverage.set(key, entry)
  }
  if (coverage.size === 0) return { kind: 'insufficient' }

  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const pad = (n: number) => String(n).padStart(2, '0')
  // Every account must cover the month: already started by then (not
  // imported later) and, if the month is the account's last one, running to
  // its end (a statement closing on the 20th leaves that month partial).
  // Months between an account's first and last are taken as covered even
  // without rows — sparse accounts (a USD account with a movement every
  // month or two) are common, so a quiet month is read as quiet. Trade-off:
  // a statement skipped between two imported ones also reads as quiet.
  // An account silent for DORMANT_AFTER_DAYS before the month is dormant,
  // not "waiting to be imported", and doesn't constrain it.
  const isComplete = (month: string) => {
    if (month >= currentMonth) return false
    const monthStart = `${month}-01`
    const startBy = `${month}-${pad(EDGE_DAYS)}`
    const endFrom = `${month}-${pad(lastDay(month) - EDGE_DAYS)}`
    const dormantBefore = shiftDays(monthStart, -DORMANT_AFTER_DAYS)
    return Array.from(coverage.values()).every(
      (c) =>
        c.last < dormantBefore ||
        (c.first <= startBy &&
          (c.last.slice(0, 7) > month || c.last >= endFrom))
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

  // The months immediately before it, contiguous: stop at the first
  // incomplete one (the range link opens every month between the ends).
  const baseline: string[] = []
  for (let i = 1; i <= BASELINE_MONTHS; i++) {
    const m = shiftMonth(reference, -i)
    if (!isComplete(m)) break
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

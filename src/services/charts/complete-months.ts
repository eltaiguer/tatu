import type { Transaction } from '../../models'
import { countsAsRow } from '../spending/spending-rules'

// THE rule for "is this month fully imported?". A month is complete when
// every imported account covers it: already started by then (not imported
// later) and, if the month is the account's last one, running to its end (a
// statement closing on the 20th leaves that month partial). Months between
// an account's first and last are taken as covered even without rows —
// sparse accounts (a USD account with a movement every month or two) are
// common, so a quiet month is read as quiet. Trade-off: a statement skipped
// between two imported ones also reads as quiet. An account silent for
// DORMANT_AFTER_DAYS before the month is dormant, not "waiting to be
// imported", and doesn't constrain it. The current month (and anything
// later) is never complete.
//
// `currentMonth` is passed in ('YYYY-MM') so callers choose the clock:
// Resumen passes today's month, Insights the month after its history ends
// (its input is hashed, so it must not read the clock).

const EDGE_DAYS = 3
// Longer than a statement cycle plus import delay.
const DORMANT_AFTER_DAYS = 45

type AccountKey = 'card' | 'usd' | 'uyu'

function accountOf(tx: Transaction): AccountKey {
  if (tx.source === 'credit_card') return 'card'
  return tx.currency === 'USD' ? 'usd' : 'uyu'
}

function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function nextMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)
}

function lastDay(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

const pad = (n: number) => String(n).padStart(2, '0')

// The complete months between the first and the last month with data,
// oldest first.
export function completeMonths(
  transactions: Transaction[],
  currentMonth: string
): Set<string> {
  // Coverage: the first and last day each account has data for.
  const coverage = new Map<AccountKey, { first: string; last: string }>()
  for (const tx of transactions) {
    // Ignored rows (transfers) still prove the account has data that day.
    if (!countsAsRow(tx)) continue
    const day = tx.date.toISOString().slice(0, 10)
    const key = accountOf(tx)
    const entry = coverage.get(key) ?? { first: day, last: day }
    if (day < entry.first) entry.first = day
    if (day > entry.last) entry.last = day
    coverage.set(key, entry)
  }

  const accounts = Array.from(coverage.values())
  const isComplete = (month: string) => {
    if (month >= currentMonth) return false
    const startBy = `${month}-${pad(EDGE_DAYS)}`
    const endFrom = `${month}-${pad(lastDay(month) - EDGE_DAYS)}`
    const dormantBefore = shiftDays(`${month}-01`, -DORMANT_AFTER_DAYS)
    return accounts.every(
      (c) =>
        c.last < dormantBefore ||
        (c.first <= startBy &&
          (c.last.slice(0, 7) > month || c.last >= endFrom))
    )
  }

  const months = new Set<string>()
  if (accounts.length === 0) return months
  const first = accounts.map((c) => c.first.slice(0, 7)).sort()[0]
  const last = accounts
    .map((c) => c.last.slice(0, 7))
    .sort()
    .reverse()[0]
  for (let m = first; m <= last; m = nextMonth(m)) {
    if (isComplete(m)) months.add(m)
  }
  return months
}

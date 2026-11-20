import type { FileType, Transaction } from '../../models'
import { ACCOUNT_LABELS, accountOf } from '../../utils/account-display'
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
// Resumen and Insights both pass today's month.

const EDGE_DAYS = 3
// Longer than a statement cycle plus import delay.
const DORMANT_AFTER_DAYS = 45

const ACCOUNT_ORDER = Object.keys(ACCOUNT_LABELS) as FileType[]

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
export interface MonthCoverage {
  month: string // 'YYYY-MM'
  complete: boolean // missing is empty AND month < currentMonth
  covered: FileType[] // accounts whose data spans the month (account order)
  missing: FileType[] // active accounts that don't (dormant ones are in neither)
  // The missing accounts with no row at all that month: the month is before
  // the account's first month or after its last. A missing account that HAS
  // rows that month (first row after the 3rd, last row before the last 3
  // days) is in `missing` only: its statement for that month is imported.
  absent: FileType[]
}

// Every month from the first to the last with data, oldest first, with the
// accounts that cover it and the ones that don't.
export function monthCoverage(
  transactions: Transaction[],
  currentMonth: string
): MonthCoverage[] {
  // Coverage: the first and last day each account has data for.
  const coverage = new Map<FileType, { first: string; last: string }>()
  for (const tx of transactions) {
    // Ignored rows (transfers) still prove the account has data that day.
    if (!countsAsRow(tx)) continue
    const day = tx.date.toISOString().slice(0, 10)
    const key = accountOf(tx.source, tx.currency)
    const entry = coverage.get(key) ?? { first: day, last: day }
    if (day < entry.first) entry.first = day
    if (day > entry.last) entry.last = day
    coverage.set(key, entry)
  }

  const accounts = ACCOUNT_ORDER.filter((a) => coverage.has(a)).map(
    (a) => [a, coverage.get(a)!] as const
  )
  if (accounts.length === 0) return []

  const describe = (month: string): MonthCoverage => {
    const startBy = `${month}-${pad(EDGE_DAYS)}`
    const endFrom = `${month}-${pad(lastDay(month) - EDGE_DAYS)}`
    const dormantBefore = shiftDays(`${month}-01`, -DORMANT_AFTER_DAYS)
    const covered: FileType[] = []
    const missing: FileType[] = []
    const absent: FileType[] = []
    for (const [account, c] of accounts) {
      if (c.last < dormantBefore) continue
      if (
        c.first <= startBy &&
        (c.last.slice(0, 7) > month || c.last >= endFrom)
      ) {
        covered.push(account)
        continue
      }
      missing.push(account)
      if (month < c.first.slice(0, 7) || month > c.last.slice(0, 7)) {
        absent.push(account)
      }
    }
    return {
      month,
      complete: month < currentMonth && missing.length === 0,
      covered,
      missing,
      absent,
    }
  }

  const first = accounts.map(([, c]) => c.first.slice(0, 7)).sort()[0]
  const last = accounts
    .map(([, c]) => c.last.slice(0, 7))
    .sort()
    .reverse()[0]
  const months: MonthCoverage[] = []
  for (let m = first; m <= last; m = nextMonth(m)) months.push(describe(m))
  return months
}

// The complete months between the first and the last month with data.
export function completeMonths(
  transactions: Transaction[],
  currentMonth: string
): Set<string> {
  return new Set(
    monthCoverage(transactions, currentMonth)
      .filter((c) => c.complete)
      .map((c) => c.month)
  )
}

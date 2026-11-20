import type { FileType, Transaction } from '../../models'
import { ACCOUNT_LABELS, accountOf } from '../../utils/account-display'
import { countsAsRow } from '../spending/spending-rules'

// THE rule for "is this month fully imported?" (#293, the owner's "hybrid"
// decision; it supersedes c78b8bf's leniency toward sparse accounts). An
// account covers a month it has rows in: already started by then (not
// imported later) and, if the month is the account's last one, running to its
// end (a statement closing on the 20th leaves that month partial). A month
// with no rows from an account is missing — a statement skipped between two
// imported ones is not a quiet month — unless the account is dormant: its
// latest row before the month is more than DORMANT_AFTER_DAYS before the
// month's 1st, so it is not "waiting to be imported" and doesn't constrain
// it. That holds mid-history too, so a long quiet spell doesn't stall the
// comparisons. A month no account covers is never complete, and neither is
// the current month or anything later. Known limits: a skipped card cycle
// that straddles two months still has rows in both and isn't detected, and
// neither is an account back from dormancy whose first row that month is on
// the 20th: the by-the-3rd test only reads the account's very first row, so
// that month counts as covered.
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

// One month's coverage: which accounts span it and which don't.
export interface MonthCoverage {
  month: string // 'YYYY-MM'
  // missing is empty AND some account covers it AND month < currentMonth
  complete: boolean
  covered: FileType[] // accounts whose data spans the month (account order)
  missing: FileType[] // active accounts that don't (dormant ones are in neither)
  // The missing accounts with no row at all that month: before the
  // account's first row, after its last, or a statement skipped in between. A
  // missing account that HAS rows that month (first row after the 3rd, last
  // row before the last 3 days) is in `missing` only: its statement for that
  // month is imported.
  absent: FileType[]
}

// Every month from the first to the last with data, oldest first, with the
// accounts that cover it and the ones that don't.
export function monthCoverage(
  transactions: Transaction[],
  currentMonth: string
): MonthCoverage[] {
  // Coverage: the first and last day each account has data for, and the
  // latest day it has data in each month.
  const coverage = new Map<
    FileType,
    { first: string; last: string; months: Map<string, string> }
  >()
  for (const tx of transactions) {
    // Ignored rows (transfers) still prove the account has data that day.
    if (!countsAsRow(tx)) continue
    const day = tx.date.toISOString().slice(0, 10)
    const key = accountOf(tx.source, tx.currency)
    const entry = coverage.get(key) ?? {
      first: day,
      last: day,
      months: new Map<string, string>(),
    }
    if (day < entry.first) entry.first = day
    if (day > entry.last) entry.last = day
    const monthKey = day.slice(0, 7)
    if (day > (entry.months.get(monthKey) ?? ''))
      entry.months.set(monthKey, day)
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
      if (!c.months.has(month)) {
        // No rows this month: dormant when its latest earlier row is old.
        let before = ''
        for (const [key, day] of c.months) {
          if (key < month && day > before) before = day
        }
        if (before !== '' && before < dormantBefore) continue
        missing.push(account)
        absent.push(account)
        continue
      }
      if (
        c.first <= startBy &&
        (c.last.slice(0, 7) > month || c.last >= endFrom)
      ) {
        covered.push(account)
        continue
      }
      missing.push(account)
    }
    return {
      month,
      complete:
        month < currentMonth && missing.length === 0 && covered.length > 0,
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

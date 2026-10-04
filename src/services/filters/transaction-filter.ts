import type { Transaction } from '../../models'
import { normalizeCategoryId } from '../categories/category-aliases'
import { countsAsRow, countsTowardTotals } from '../spending/spending-rules'
import { getDisplayDescription } from '../../utils/transaction-display'
import { toDateKey, todayAsUtcDate } from '../../utils/date-utils'
import type { UrlFilterState, UrlPeriod } from './url-filters'

// THE definition of "matches the Transacciones filter" (#121): one pure
// function over the rows and the same filter state the URL holds, period
// included. useTransactionFiltering only keeps the React state around it;
// anything else that needs filtered rows (export, if it ever filters) calls
// this too, so the two can't drift apart.

export type SortField = 'date' | 'amount' | 'description' | 'category'
export type SortDirection = 'asc' | 'desc'

export interface TransactionFilterOptions {
  // The month "últimos n meses" counts back from. The view freezes it when
  // the period is chosen; left out, it is the newest row (today if none).
  recentAnchor?: Date
}

function utcDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d))
}

function newestDate(transactions: Transaction[]): Date {
  if (transactions.length === 0) return todayAsUtcDate()
  return new Date(Math.max(...transactions.map((tx) => tx.date.getTime())))
}

// A period as inclusive ISO calendar days ('' = unbounded). Transaction
// dates are calendar days at UTC midnight (#58), so months are UTC months —
// the same ones Resumen sums with toMonthKey.
export function periodDateRange(
  period: UrlPeriod | undefined,
  recentAnchor: Date
): { from: string; to: string } {
  if (period?.mode === 'month') {
    return {
      from: toDateKey(utcDay(period.y, period.m, 1)),
      to: toDateKey(utcDay(period.y, period.m + 1, 0)),
    }
  }
  if (period?.mode === 'recent') {
    const y = recentAnchor.getUTCFullYear()
    const m = recentAnchor.getUTCMonth()
    return {
      from: toDateKey(utcDay(y, m - (period.n - 1), 1)),
      to: toDateKey(utcDay(y, m + 1, 0)),
    }
  }
  if (period?.mode === 'range') {
    return { from: period.from, to: period.to }
  }
  return { from: '', to: '' }
}

// The rows that match, in input order. Split parents never match (they stand
// for their parts, so a drill-through adds up to the number clicked); rows
// that don't count toward totals (ignored categories) only with showIgnored.
export function filterTransactions(
  transactions: Transaction[],
  filters: UrlFilterState,
  options: TransactionFilterOptions = {}
): Transaction[] {
  const range = periodDateRange(
    filters.period,
    options.recentAnchor ??
      (filters.period?.mode === 'recent'
        ? newestDate(transactions)
        : todayAsUtcDate())
  )
  // An inverted range is ignored rather than matching nothing.
  const invalidDateRange = range.from && range.to && range.to < range.from
  // Bounded in UTC: a row stored before #58 at 03:00Z is inside its own day.
  const dateFrom =
    !invalidDateRange && range.from
      ? new Date(`${range.from}T00:00:00.000Z`)
      : null
  const dateTo =
    !invalidDateRange && range.to ? new Date(`${range.to}T23:59:59.999Z`) : null

  const query = filters.search.toLowerCase()
  // Same normalization Resumen and Categorías count with: missing, '',
  // 'other' and casing all mean "Sin categoría".
  const categorySet = new Set(filters.categories.map(normalizeCategoryId))
  const accounts: readonly string[] = filters.accounts
  const min = filters.min ? parseFloat(filters.min) : null
  const max = filters.max ? parseFloat(filters.max) : null

  // Cheap field comparisons first; the search string is only built when
  // there is a query.
  return transactions.filter((transaction) => {
    if (!countsAsRow(transaction)) return false
    if (!filters.showIgnored && !countsTowardTotals(transaction)) return false
    if (dateFrom && transaction.date < dateFrom) return false
    if (dateTo && transaction.date > dateTo) return false
    if (
      categorySet.size > 0 &&
      !categorySet.has(normalizeCategoryId(transaction.category))
    )
      return false
    if (
      filters.merchant &&
      getDisplayDescription(transaction) !== filters.merchant
    )
      return false
    if (accounts.length > 0 && !accounts.includes(transaction.source))
      return false
    if (filters.currency !== 'all' && transaction.currency !== filters.currency)
      return false
    if (filters.type !== 'all' && transaction.type !== filters.type)
      return false
    if (min !== null && Math.abs(transaction.amount) < min) return false
    if (max !== null && Math.abs(transaction.amount) > max) return false

    if (!query) return true

    const searchable =
      `${getDisplayDescription(transaction)} ${transaction.description} ${(transaction.tags ?? []).join(' ')}`.toLowerCase()
    return searchable.includes(query)
  })
}

// A sorted copy. Amounts sort by size (absolute value), descriptions by the
// name the table shows, in Spanish collation.
export function sortTransactions(
  rows: Transaction[],
  field: SortField,
  direction: SortDirection
): Transaction[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (field === 'date') return (a.date.getTime() - b.date.getTime()) * sign
    if (field === 'amount')
      return (Math.abs(a.amount) - Math.abs(b.amount)) * sign
    if (field === 'description') {
      return (
        getDisplayDescription(a).localeCompare(getDisplayDescription(b), 'es') *
        sign
      )
    }
    return (a.category ?? '').localeCompare(b.category ?? '', 'es') * sign
  })
}

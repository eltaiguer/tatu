import type { Currency, Transaction } from '../../models'
import { Category } from '../../models'
import { isTransferCategory } from '../transfers/internal-transfers'
import { isCategoryIgnored } from '../categories/category-registry'
import { convert } from '../currency/convert'

export interface CategorySpendingDatum {
  category: string
  total: number
}

export interface MonthlyTrendDatum {
  month: string
  income: number
  expense: number
  net: number
}

export interface IncomeExpenseSummary {
  income: number
  expense: number
  net: number
}

function toMonthKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

export function buildCategorySpending(
  transactions: Transaction[],
  currency: Currency
): CategorySpendingDatum[] {
  const grouped = new Map<string, number>()

  transactions.forEach((tx) => {
    if (
      tx.currency !== currency ||
      tx.type !== 'debit' ||
      isTransferCategory(tx.category) ||
      isCategoryIgnored(tx.category)
    ) {
      return
    }

    const category = tx.category ?? Category.Uncategorized
    grouped.set(category, (grouped.get(category) ?? 0) + tx.amount)
  })

  return Array.from(grouped.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}

export function buildMonthlyTrends(
  transactions: Transaction[],
  currency: Currency
): MonthlyTrendDatum[] {
  const grouped = new Map<string, MonthlyTrendDatum>()

  transactions.forEach((tx) => {
    if (tx.currency !== currency) {
      return
    }

    const month = toMonthKey(tx.date)
    if (!grouped.has(month)) {
      grouped.set(month, { month, income: 0, expense: 0, net: 0 })
    }

    const entry = grouped.get(month)
    if (!entry) {
      return
    }

    if (isTransferCategory(tx.category) || isCategoryIgnored(tx.category)) {
      return
    }

    if (tx.type === 'credit') {
      entry.income += tx.amount
      entry.net += tx.amount
    } else {
      entry.expense += tx.amount
      entry.net -= tx.amount
    }
  })

  return Array.from(grouped.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  )
}

export function buildIncomeExpenseSummary(
  transactions: Transaction[],
  currency: Currency
): IncomeExpenseSummary {
  return transactions.reduce<IncomeExpenseSummary>(
    (summary, tx) => {
      if (tx.currency !== currency) {
        return summary
      }

      if (isTransferCategory(tx.category) || isCategoryIgnored(tx.category)) {
        return summary
      }

      if (tx.type === 'credit') {
        summary.income += tx.amount
        summary.net += tx.amount
      } else {
        summary.expense += tx.amount
        summary.net -= tx.amount
      }

      return summary
    },
    { income: 0, expense: 0, net: 0 }
  )
}

// --- Multicurrency converting selectors ---
// All functions below accept (transactions, homeCurrency, fxRate) and
// convert every amount to homeCurrency before aggregating.

export interface MonthSummary {
  income: number
  expense: number
  net: number
  count: number
  split: { USD: number; UYU: number }
  monthLabel: string
}

export interface CurrencySplitData {
  USD: number
  UYU: number
  total: number
  pctUSD: number
  pctUYU: number
}

function shouldExclude(tx: Transaction): boolean {
  return isTransferCategory(tx.category) || isCategoryIgnored(tx.category)
}

export function buildCategorySpendingConverted(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): CategorySpendingDatum[] {
  const grouped = new Map<string, number>()

  transactions.forEach((tx) => {
    if (tx.type !== 'debit' || shouldExclude(tx)) return
    const category = tx.category ?? Category.Uncategorized
    const converted = convert(tx.amount, tx.currency, homeCurrency, fxRate)
    grouped.set(category, (grouped.get(category) ?? 0) + converted)
  })

  return Array.from(grouped.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}

export function buildMonthlyTrendsConverted(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): MonthlyTrendDatum[] {
  const grouped = new Map<string, MonthlyTrendDatum>()

  transactions.forEach((tx) => {
    if (shouldExclude(tx)) return
    const month = toMonthKey(tx.date)
    if (!grouped.has(month)) {
      grouped.set(month, { month, income: 0, expense: 0, net: 0 })
    }
    const entry = grouped.get(month)!
    const converted = convert(tx.amount, tx.currency, homeCurrency, fxRate)
    if (tx.type === 'credit') {
      entry.income += converted
      entry.net += converted
    } else {
      entry.expense += converted
      entry.net -= converted
    }
  })

  return Array.from(grouped.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  )
}

export function buildCurrentMonthSummary(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): MonthSummary {
  if (transactions.length === 0) {
    return {
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
      split: { USD: 0, UYU: 0 },
      monthLabel: '',
    }
  }

  const latest = transactions.reduce(
    (max, tx) => (tx.date > max ? tx.date : max),
    transactions[0].date
  )
  const m = latest.getUTCMonth()
  const y = latest.getUTCFullYear()

  const monthTxs = transactions.filter((tx) => {
    return (
      tx.date.getUTCFullYear() === y &&
      tx.date.getUTCMonth() === m &&
      !shouldExclude(tx)
    )
  })

  let income = 0
  let expense = 0
  const split: { USD: number; UYU: number } = { USD: 0, UYU: 0 }

  monthTxs.forEach((tx) => {
    const converted = convert(tx.amount, tx.currency, homeCurrency, fxRate)
    if (tx.type === 'credit') {
      income += converted
    } else {
      expense += converted
      split[tx.currency] += tx.amount
    }
  })

  const monthLabel = latest.toLocaleDateString('es-UY', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return {
    income,
    expense,
    net: income - expense,
    count: monthTxs.length,
    split,
    monthLabel,
  }
}

export function buildCurrencySplit(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): CurrencySplitData {
  let usd = 0
  let uyu = 0

  transactions.forEach((tx) => {
    if (tx.type !== 'debit' || shouldExclude(tx)) return
    const converted = convert(tx.amount, tx.currency, homeCurrency, fxRate)
    if (tx.currency === 'USD') usd += converted
    else uyu += converted
  })

  const total = usd + uyu || 1
  return {
    USD: usd,
    UYU: uyu,
    total: usd + uyu,
    pctUSD: (usd / total) * 100,
    pctUYU: (uyu / total) * 100,
  }
}

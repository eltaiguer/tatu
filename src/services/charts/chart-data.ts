import type { Currency, Transaction } from '../../models'
import { Category } from '../../models'
import { isTransferCategory } from '../transfers/internal-transfers'
import { isCategoryIgnored } from '../categories/category-registry'
import { convert } from '../currency/convert'
import { toMonthKey } from '../../utils/date-utils'

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

    if (tx.type === 'credit' && tx.category === Category.Income) {
      entry.income += tx.amount
      entry.net += tx.amount
    } else if (tx.type === 'debit') {
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

      if (tx.type === 'credit' && tx.category === Category.Income) {
        summary.income += tx.amount
        summary.net += tx.amount
      } else if (tx.type === 'debit') {
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
    if (tx.type === 'credit' && tx.category === Category.Income) {
      entry.income += converted
      entry.net += converted
    } else if (tx.type === 'debit') {
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
    if (tx.type === 'credit' && tx.category === Category.Income) {
      income += converted
    } else if (tx.type === 'debit') {
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

export type AccountBucket = 'card' | 'usd' | 'uyu'

export interface AccountSpend {
  conv: number
  USD: number
  UYU: number
  count: number
  pct: number
}

export type SpendByAccount = Record<AccountBucket, AccountSpend>

// Aggregates debit expenses (excl. transfers + ignored) by source account.
// card = credit_card (any currency), usd/uyu = bank_account by tx currency.
export function spendByAccount(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): SpendByAccount {
  const map: SpendByAccount = {
    card: { conv: 0, USD: 0, UYU: 0, count: 0, pct: 0 },
    usd: { conv: 0, USD: 0, UYU: 0, count: 0, pct: 0 },
    uyu: { conv: 0, USD: 0, UYU: 0, count: 0, pct: 0 },
  }

  transactions
    .filter((tx) => tx.type === 'debit' && !shouldExclude(tx))
    .forEach((tx) => {
      let bucket: AccountBucket
      if (tx.source === 'credit_card') {
        bucket = 'card'
      } else if (tx.currency === 'USD') {
        bucket = 'usd'
      } else {
        bucket = 'uyu'
      }
      const a = map[bucket]
      a.conv += convert(tx.amount, tx.currency, homeCurrency, fxRate)
      a[tx.currency] += tx.amount
      a.count++
    })

  const total = map.card.conv + map.usd.conv + map.uyu.conv || 1
  ;(Object.keys(map) as AccountBucket[]).forEach((b) => {
    map[b].pct = (map[b].conv / total) * 100
  })

  return map
}

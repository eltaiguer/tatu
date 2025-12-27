import type { Currency, Transaction } from '../../models'
import { Category } from '../../models'

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
    if (tx.currency !== currency || tx.type !== 'debit') {
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

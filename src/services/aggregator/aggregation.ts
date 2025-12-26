import type { Currency, Transaction } from '../../models'
import { Category } from '../../models'

export interface CurrencyTotals {
  USD: number
  UYU: number
}

export interface SummaryTotals {
  income: CurrencyTotals
  expense: CurrencyTotals
  net: CurrencyTotals
  count: number
}

function emptyCurrencyTotals(): CurrencyTotals {
  return { USD: 0, UYU: 0 }
}

function emptySummary(): SummaryTotals {
  return {
    income: emptyCurrencyTotals(),
    expense: emptyCurrencyTotals(),
    net: emptyCurrencyTotals(),
    count: 0,
  }
}

function toDateKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toMonthKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

function applyTransaction(summary: SummaryTotals, tx: Transaction): void {
  const currency = tx.currency
  if (tx.type === 'credit') {
    summary.income[currency] += tx.amount
    summary.net[currency] += tx.amount
  } else {
    summary.expense[currency] += tx.amount
    summary.net[currency] -= tx.amount
  }
  summary.count += 1
}

function memoizeByReference<TInput extends object, TResult>(
  fn: (input: TInput) => TResult
): (input: TInput) => TResult {
  const cache = new WeakMap<TInput, TResult>()

  return (input: TInput) => {
    const cached = cache.get(input)
    if (cached) {
      return cached
    }
    const result = fn(input)
    cache.set(input, result)
    return result
  }
}

export const groupByCategory = memoizeByReference(
  (transactions: Transaction[]) => {
    const grouped: Record<string, SummaryTotals> = {}

    transactions.forEach((tx) => {
      const category = tx.category ?? Category.Uncategorized
      if (!grouped[category]) {
        grouped[category] = emptySummary()
      }
      applyTransaction(grouped[category], tx)
    })

    return grouped
  }
)

export const groupByMonth = memoizeByReference(
  (transactions: Transaction[]) => {
    const grouped: Record<string, SummaryTotals> = {}

    transactions.forEach((tx) => {
      const key = toMonthKey(tx.date)
      if (!grouped[key]) {
        grouped[key] = emptySummary()
      }
      applyTransaction(grouped[key], tx)
    })

    return grouped
  }
)

export const groupByDate = memoizeByReference(
  (transactions: Transaction[]) => {
    const grouped: Record<string, SummaryTotals> = {}

    transactions.forEach((tx) => {
      const key = toDateKey(tx.date)
      if (!grouped[key]) {
        grouped[key] = emptySummary()
      }
      applyTransaction(grouped[key], tx)
    })

    return grouped
  }
)

export const calculateTotals = memoizeByReference(
  (transactions: Transaction[]) => {
    const totals = emptySummary()
    transactions.forEach((tx) => applyTransaction(totals, tx))
    return totals
  }
)

export function convertAmount(
  amount: number,
  from: Currency,
  to: Currency,
  rate: number
): number {
  if (from === to) {
    return amount
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Conversion rate must be a positive number.')
  }
  return amount * rate
}

export function calculateRunningBalance(
  transactions: Transaction[],
  currency: Currency,
  startingBalance = 0
): Array<{ id: string; balance: number }> {
  const sorted = [...transactions]
    .filter((tx) => tx.currency === currency)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  let balance = startingBalance
  return sorted.map((tx) => {
    balance += tx.type === 'credit' ? tx.amount : -tx.amount
    return { id: tx.id, balance }
  })
}

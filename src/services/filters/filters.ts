import type { Currency, Transaction } from '../../models'
import { normalizeMerchantName } from '../categorizer/merchant-patterns'

export interface FilterOptions {
  dateFrom?: Date
  dateTo?: Date
  categories?: string[]
  amountMin?: number
  amountMax?: number
  query?: string
  currencies?: Currency[]
}

export type SortField = 'date' | 'amount' | 'description'

export interface SortOptions {
  field?: SortField
  direction?: 'asc' | 'desc'
}

function memoizeByReference<TInput extends object, TResult>(
  fn: (input: TInput, options?: FilterOptions) => TResult
): (input: TInput, options?: FilterOptions) => TResult {
  const cache = new WeakMap<TInput, Map<string, TResult>>()

  return (input, options = {}) => {
    let byOptions = cache.get(input)
    const key = JSON.stringify(options)

    if (!byOptions) {
      byOptions = new Map()
      cache.set(input, byOptions)
    }

    const cached = byOptions.get(key)
    if (cached) {
      return cached
    }

    const result = fn(input, options)
    byOptions.set(key, result)
    return result
  }
}

export function matchesText(text: string, query: string): boolean {
  if (!query) {
    return true
  }
  const normalizedQuery = normalizeMerchantName(query)
  const normalizedText = normalizeMerchantName(text)
  return normalizedText.includes(normalizedQuery)
}

export const applyFilters = memoizeByReference(
  (transactions: Transaction[], options: FilterOptions = {}) => {
    const {
      dateFrom,
      dateTo,
      categories,
      amountMin,
      amountMax,
      query,
      currencies,
    } = options

    return transactions.filter((tx) => {
      if (dateFrom && tx.date < dateFrom) {
        return false
      }
      if (dateTo && tx.date > dateTo) {
        return false
      }
      if (categories && categories.length > 0) {
        if (!tx.category || !categories.includes(tx.category)) {
          return false
        }
      }
      if (typeof amountMin === 'number' && tx.amount < amountMin) {
        return false
      }
      if (typeof amountMax === 'number' && tx.amount > amountMax) {
        return false
      }
      if (query && !matchesText(tx.description, query)) {
        return false
      }
      if (currencies && currencies.length > 0) {
        if (!currencies.includes(tx.currency)) {
          return false
        }
      }

      return true
    })
  }
)

export function sortTransactions(
  transactions: Transaction[],
  options: SortOptions = {}
): Transaction[] {
  const { field = 'date', direction = 'desc' } = options
  const multiplier = direction === 'asc' ? 1 : -1

  return [...transactions].sort((a, b) => {
    if (field === 'amount') {
      return (a.amount - b.amount) * multiplier
    }

    if (field === 'description') {
      return a.description.localeCompare(b.description) * multiplier
    }

    return (a.date.getTime() - b.date.getTime()) * multiplier
  })
}

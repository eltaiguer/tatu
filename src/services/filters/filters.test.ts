import { describe, it, expect } from 'vitest'
import {
  applyFilters,
  sortTransactions,
  matchesText,
} from './filters'
import type { Transaction } from '../../models'
import { Category } from '../../models'

function makeTransaction(
  id: string,
  overrides: Partial<Transaction> = {}
): Transaction {
  return {
    id,
    date: new Date('2025-01-01T00:00:00.000Z'),
    description: `Transaction ${id}`,
    amount: 10,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
    ...overrides,
  }
}

describe('Filter engine', () => {
  it('filters by date range', () => {
    const transactions = [
      makeTransaction('tx-1', { date: new Date('2025-01-01T00:00:00.000Z') }),
      makeTransaction('tx-2', { date: new Date('2025-01-10T00:00:00.000Z') }),
      makeTransaction('tx-3', { date: new Date('2025-02-01T00:00:00.000Z') }),
    ]

    const result = applyFilters(transactions, {
      dateFrom: new Date('2025-01-05T00:00:00.000Z'),
      dateTo: new Date('2025-01-31T00:00:00.000Z'),
    })

    expect(result.map((tx) => tx.id)).toEqual(['tx-2'])
  })

  it('filters by categories', () => {
    const transactions = [
      makeTransaction('tx-1', { category: Category.Groceries }),
      makeTransaction('tx-2', { category: Category.Shopping }),
    ]

    const result = applyFilters(transactions, {
      categories: [Category.Groceries],
    })

    expect(result.map((tx) => tx.id)).toEqual(['tx-1'])
  })

  it('filters by amount range', () => {
    const transactions = [
      makeTransaction('tx-1', { amount: 5 }),
      makeTransaction('tx-2', { amount: 15 }),
      makeTransaction('tx-3', { amount: 30 }),
    ]

    const result = applyFilters(transactions, {
      amountMin: 10,
      amountMax: 20,
    })

    expect(result.map((tx) => tx.id)).toEqual(['tx-2'])
  })

  it('filters by text search', () => {
    const transactions = [
      makeTransaction('tx-1', { description: 'Devoto Supermercado' }),
      makeTransaction('tx-2', { description: 'Netflix' }),
    ]

    const result = applyFilters(transactions, {
      query: 'devoto',
    })

    expect(result.map((tx) => tx.id)).toEqual(['tx-1'])
  })

  it('filters by currency', () => {
    const transactions = [
      makeTransaction('tx-1', { currency: 'USD' }),
      makeTransaction('tx-2', { currency: 'UYU' }),
    ]

    const result = applyFilters(transactions, {
      currencies: ['USD'],
    })

    expect(result.map((tx) => tx.id)).toEqual(['tx-1'])
  })

  it('can combine filters', () => {
    const transactions = [
      makeTransaction('tx-1', {
        description: 'Devoto',
        amount: 10,
        currency: 'USD',
        category: Category.Groceries,
      }),
      makeTransaction('tx-2', {
        description: 'Devoto',
        amount: 30,
        currency: 'USD',
        category: Category.Groceries,
      }),
    ]

    const result = applyFilters(transactions, {
      amountMax: 20,
      query: 'devoto',
      categories: [Category.Groceries],
    })

    expect(result.map((tx) => tx.id)).toEqual(['tx-1'])
  })

  it('memoizes by reference', () => {
    const transactions = [makeTransaction('tx-1')]
    const filters = { query: 'transaction' }

    const first = applyFilters(transactions, filters)
    const second = applyFilters(transactions, filters)
    const third = applyFilters([...transactions], filters)

    expect(first).toBe(second)
    expect(first).not.toBe(third)
  })
})

describe('Sort engine', () => {
  it('sorts by date descending by default', () => {
    const transactions = [
      makeTransaction('tx-1', { date: new Date('2025-01-01T00:00:00.000Z') }),
      makeTransaction('tx-2', { date: new Date('2025-01-05T00:00:00.000Z') }),
    ]

    const result = sortTransactions(transactions)
    expect(result.map((tx) => tx.id)).toEqual(['tx-2', 'tx-1'])
  })

  it('sorts by amount ascending', () => {
    const transactions = [
      makeTransaction('tx-1', { amount: 20 }),
      makeTransaction('tx-2', { amount: 5 }),
    ]

    const result = sortTransactions(transactions, {
      field: 'amount',
      direction: 'asc',
    })
    expect(result.map((tx) => tx.id)).toEqual(['tx-2', 'tx-1'])
  })
})

describe('Text match helper', () => {
  it('matches on normalized description', () => {
    expect(matchesText('Devoto Supermercado', 'devoto')).toBe(true)
  })
})

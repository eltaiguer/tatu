import { describe, it, expect } from 'vitest'
import {
  buildCategorySpending,
  buildIncomeExpenseSummary,
  buildMonthlyTrends,
} from './chart-data'
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

describe('chart-data', () => {
  it('builds category spending for a currency using debits only', () => {
    const transactions = [
      makeTransaction('tx-1', {
        amount: 20,
        currency: 'USD',
        type: 'debit',
        category: Category.Groceries,
      }),
      makeTransaction('tx-2', {
        amount: 5,
        currency: 'USD',
        type: 'credit',
        category: Category.Groceries,
      }),
      makeTransaction('tx-3', {
        amount: 10,
        currency: 'USD',
        type: 'debit',
        category: Category.Restaurants,
      }),
      makeTransaction('tx-4', {
        amount: 30,
        currency: 'UYU',
        type: 'debit',
        category: Category.Restaurants,
      }),
    ]

    const result = buildCategorySpending(transactions, 'USD')

    expect(result).toEqual([
      { category: Category.Groceries, total: 20 },
      { category: Category.Restaurants, total: 10 },
    ])
  })

  it('builds monthly trends per currency', () => {
    const transactions = [
      makeTransaction('tx-1', {
        amount: 100,
        type: 'credit',
        currency: 'USD',
        date: new Date('2025-01-15T00:00:00.000Z'),
      }),
      makeTransaction('tx-2', {
        amount: 40,
        type: 'debit',
        currency: 'USD',
        date: new Date('2025-01-20T00:00:00.000Z'),
      }),
      makeTransaction('tx-3', {
        amount: 10,
        type: 'debit',
        currency: 'USD',
        date: new Date('2025-02-01T00:00:00.000Z'),
      }),
    ]

    const result = buildMonthlyTrends(transactions, 'USD')

    expect(result).toEqual([
      { month: '2025-01', income: 100, expense: 40, net: 60 },
      { month: '2025-02', income: 0, expense: 10, net: -10 },
    ])
  })

  it('builds income vs expense summary per currency', () => {
    const transactions = [
      makeTransaction('tx-1', {
        amount: 50,
        type: 'credit',
        currency: 'USD',
      }),
      makeTransaction('tx-2', {
        amount: 25,
        type: 'debit',
        currency: 'USD',
      }),
    ]

    const result = buildIncomeExpenseSummary(transactions, 'USD')

    expect(result).toEqual({
      income: 50,
      expense: 25,
      net: 25,
    })
  })
})

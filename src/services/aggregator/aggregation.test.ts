import { describe, it, expect } from 'vitest'
import {
  calculateRunningBalance,
  calculateTotals,
  convertAmount,
  groupByCategory,
  groupByDate,
  groupByMonth,
} from './aggregation'
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

describe('Aggregation - groupByCategory', () => {
  it('summarizes income and expenses per category', () => {
    const transactions = [
      makeTransaction('tx-1', {
        category: Category.Groceries,
        amount: 10,
        currency: 'USD',
        type: 'debit',
      }),
      makeTransaction('tx-2', {
        category: Category.Groceries,
        amount: 5,
        currency: 'USD',
        type: 'credit',
      }),
      makeTransaction('tx-3', {
        amount: 20,
        currency: 'UYU',
        type: 'debit',
      }),
    ]

    const grouped = groupByCategory(transactions)

    expect(grouped[Category.Groceries].expense.USD).toBe(10)
    expect(grouped[Category.Groceries].income.USD).toBe(5)
    expect(grouped[Category.Groceries].net.USD).toBe(-5)
    expect(grouped[Category.Groceries].count).toBe(2)

    expect(grouped[Category.Uncategorized].expense.UYU).toBe(20)
    expect(grouped[Category.Uncategorized].count).toBe(1)
  })

  it('memoizes results by array reference', () => {
    const transactions = [makeTransaction('tx-1')]

    const first = groupByCategory(transactions)
    const second = groupByCategory(transactions)
    const third = groupByCategory([...transactions])

    expect(first).toBe(second)
    expect(first).not.toBe(third)
  })
})

describe('Aggregation - groupByMonth', () => {
  it('groups transactions by year-month', () => {
    const transactions = [
      makeTransaction('tx-1', { date: new Date('2025-01-05T00:00:00.000Z') }),
      makeTransaction('tx-2', { date: new Date('2025-01-20T00:00:00.000Z') }),
      makeTransaction('tx-3', { date: new Date('2025-02-01T00:00:00.000Z') }),
    ]

    const grouped = groupByMonth(transactions)

    expect(grouped['2025-01'].count).toBe(2)
    expect(grouped['2025-02'].count).toBe(1)
  })
})

describe('Aggregation - groupByDate', () => {
  it('groups transactions by date', () => {
    const transactions = [
      makeTransaction('tx-1', { date: new Date('2025-01-05T00:00:00.000Z') }),
      makeTransaction('tx-2', { date: new Date('2025-01-05T00:00:00.000Z') }),
      makeTransaction('tx-3', { date: new Date('2025-01-06T00:00:00.000Z') }),
    ]

    const grouped = groupByDate(transactions)

    expect(grouped['2025-01-05'].count).toBe(2)
    expect(grouped['2025-01-06'].count).toBe(1)
  })
})

describe('Aggregation - totals', () => {
  it('calculates totals across all transactions', () => {
    const transactions = [
      makeTransaction('tx-1', {
        amount: 10,
        type: 'debit',
        currency: 'USD',
      }),
      makeTransaction('tx-2', {
        amount: 5,
        type: 'credit',
        currency: 'USD',
      }),
      makeTransaction('tx-3', {
        amount: 7,
        type: 'credit',
        currency: 'UYU',
      }),
    ]

    const totals = calculateTotals(transactions)

    expect(totals.expense.USD).toBe(10)
    expect(totals.income.USD).toBe(5)
    expect(totals.net.USD).toBe(-5)
    expect(totals.income.UYU).toBe(7)
  })
})

describe('Aggregation - currency conversion', () => {
  it('converts amounts using a provided rate', () => {
    expect(convertAmount(100, 'USD', 'UYU', 40)).toBe(4000)
  })

  it('returns same amount when currencies match', () => {
    expect(convertAmount(100, 'USD', 'USD', 40)).toBe(100)
  })

  it('throws when rate is invalid', () => {
    expect(() => convertAmount(10, 'USD', 'UYU', 0)).toThrow()
  })
})

describe('Aggregation - running balance', () => {
  it('calculates running balance in chronological order', () => {
    const transactions = [
      makeTransaction('tx-1', {
        date: new Date('2025-01-03T00:00:00.000Z'),
        amount: 10,
        type: 'debit',
        currency: 'USD',
      }),
      makeTransaction('tx-2', {
        date: new Date('2025-01-01T00:00:00.000Z'),
        amount: 5,
        type: 'credit',
        currency: 'USD',
      }),
    ]

    const result = calculateRunningBalance(transactions, 'USD', 100)

    expect(result).toEqual([
      { id: 'tx-2', balance: 105 },
      { id: 'tx-1', balance: 95 },
    ])
  })
})

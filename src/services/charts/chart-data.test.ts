import { describe, it, expect } from 'vitest'
import {
  buildCategorySpending,
  buildIncomeExpenseSummary,
  buildMonthlyTrends,
  buildCategorySpendingConverted,
  buildMonthlyTrendsConverted,
  buildCurrentMonthSummary,
  buildCurrencySplit,
  spendByAccount,
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
        category: Category.Income,
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

  it('counts all non-ignored credits as income regardless of category', () => {
    const transactions = [
      makeTransaction('salary', {
        amount: 200,
        type: 'credit',
        category: Category.Income,
        currency: 'USD',
      }),
      makeTransaction('refund', {
        amount: 30,
        type: 'credit',
        category: Category.Groceries,
        currency: 'USD',
      }),
      makeTransaction('received', {
        amount: 50,
        type: 'credit',
        category: Category.Uncategorized,
        currency: 'USD',
      }),
    ]

    const result = buildIncomeExpenseSummary(transactions, 'USD')

    expect(result.income).toBe(280)
    expect(result.expense).toBe(0)
    expect(result.net).toBe(280)
  })

  it('builds income vs expense summary per currency', () => {
    const transactions = [
      makeTransaction('tx-1', {
        amount: 50,
        type: 'credit',
        category: Category.Income,
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

  it('ignores transactions in a different currency', () => {
    const transactions = [
      makeTransaction('usd-income', {
        amount: 100,
        type: 'credit',
        category: Category.Income,
        currency: 'USD',
      }),
      makeTransaction('usd-expense', { amount: 30, type: 'debit', currency: 'USD' }),
      makeTransaction('uyu-income', {
        amount: 1000,
        type: 'credit',
        category: Category.Income,
        currency: 'UYU',
      }),
      makeTransaction('uyu-expense', { amount: 500, type: 'debit', currency: 'UYU' }),
    ]

    const result = buildIncomeExpenseSummary(transactions, 'USD')

    expect(result.income).toBe(100)
    expect(result.expense).toBe(30)
    expect(result.net).toBe(70)
  })

  it('excludes transfer category from spending and summary metrics (original)', () => {
    const transactions = [
      makeTransaction('tx-1', {
        amount: 200,
        type: 'debit',
        currency: 'USD',
        category: Category.InternalTransfer,
      }),
      makeTransaction('tx-2', {
        amount: 100,
        type: 'credit',
        currency: 'USD',
        category: Category.InternalTransfer,
      }),
      makeTransaction('tx-3', {
        amount: 80,
        type: 'debit',
        currency: 'USD',
        category: Category.Groceries,
      }),
    ]

    expect(buildCategorySpending(transactions, 'USD')).toEqual([
      { category: Category.Groceries, total: 80 },
    ])

    expect(buildIncomeExpenseSummary(transactions, 'USD')).toEqual({
      income: 0,
      expense: 80,
      net: -80,
    })
  })
})

describe('chart-data multicurrency converting selectors', () => {
  const RATE = 40

  function makeTx(
    id: string,
    overrides: Partial<Transaction> = {}
  ): Transaction {
    return {
      id,
      date: new Date('2025-01-15T00:00:00.000Z'),
      description: `tx-${id}`,
      amount: 10,
      currency: 'USD',
      type: 'debit',
      source: 'bank_account',
      rawData: {},
      ...overrides,
    }
  }

  describe('buildCategorySpendingConverted', () => {
    it('converts USD expenses to UYU when home is UYU', () => {
      const txs = [
        makeTx('1', { amount: 10, currency: 'USD', type: 'debit', category: Category.Groceries }),
        makeTx('2', { amount: 400, currency: 'UYU', type: 'debit', category: Category.Groceries }),
      ]
      const result = buildCategorySpendingConverted(txs, 'UYU', RATE)
      expect(result).toHaveLength(1)
      expect(result[0].category).toBe(Category.Groceries)
      expect(result[0].total).toBeCloseTo(800) // 10*40 + 400
    })

    it('excludes credits and transfers', () => {
      const txs = [
        makeTx('1', { type: 'credit', category: Category.Groceries }),
        makeTx('2', { type: 'debit', category: Category.InternalTransfer }),
        makeTx('3', { type: 'debit', category: Category.Groceries, amount: 20 }),
      ]
      const result = buildCategorySpendingConverted(txs, 'USD', RATE)
      expect(result).toHaveLength(1)
      expect(result[0].total).toBe(20)
    })
  })

  describe('buildMonthlyTrendsConverted', () => {
    it('combines USD and UYU amounts for same month into home currency', () => {
      const txs = [
        makeTx('1', { amount: 10, currency: 'USD', type: 'credit', category: Category.Income, date: new Date('2025-01-10T00:00:00.000Z') }),
        makeTx('2', { amount: 200, currency: 'UYU', type: 'debit', date: new Date('2025-01-20T00:00:00.000Z') }),
      ]
      const result = buildMonthlyTrendsConverted(txs, 'UYU', RATE)
      expect(result).toHaveLength(1)
      expect(result[0].month).toBe('2025-01')
      expect(result[0].income).toBeCloseTo(400) // 10 USD * 40
      expect(result[0].expense).toBeCloseTo(200) // 200 UYU
      expect(result[0].net).toBeCloseTo(200)
    })

    it('counts all non-ignored credits as income', () => {
      const txs = [
        makeTx('income', { amount: 50, currency: 'USD', type: 'credit', category: Category.Income }),
        makeTx('refund', { amount: 10, currency: 'USD', type: 'credit', category: Category.Groceries }),
        makeTx('unknown', { amount: 5, currency: 'USD', type: 'credit' }),
      ]
      const result = buildMonthlyTrendsConverted(txs, 'USD', RATE)
      expect(result[0].income).toBe(65)
      expect(result[0].expense).toBe(0)
    })
  })

  describe('buildCurrentMonthSummary', () => {
    it('returns zeros for empty transactions', () => {
      const result = buildCurrentMonthSummary([], 'USD', RATE)
      expect(result.income).toBe(0)
      expect(result.expense).toBe(0)
    })

    it('computes latest-month totals in home currency', () => {
      const txs = [
        makeTx('old', { date: new Date('2024-11-01T00:00:00.000Z'), type: 'debit', amount: 999 }),
        makeTx('inc', { date: new Date('2025-01-15T00:00:00.000Z'), type: 'credit', category: Category.Income, amount: 100, currency: 'USD' }),
        makeTx('exp-usd', { date: new Date('2025-01-20T00:00:00.000Z'), type: 'debit', amount: 20, currency: 'USD' }),
        makeTx('exp-uyu', { date: new Date('2025-01-25T00:00:00.000Z'), type: 'debit', amount: 400, currency: 'UYU' }),
      ]
      const result = buildCurrentMonthSummary(txs, 'USD', RATE)
      expect(result.income).toBeCloseTo(100) // 100 USD income
      expect(result.expense).toBeCloseTo(30) // 20 USD + 400/40 USD = 30
      expect(result.net).toBeCloseTo(70)
      expect(result.split.USD).toBeCloseTo(20)
      expect(result.split.UYU).toBeCloseTo(400)
    })

    it('excludes transfers', () => {
      const txs = [
        makeTx('t', { date: new Date('2025-01-10T00:00:00.000Z'), type: 'debit', amount: 100, category: Category.InternalTransfer }),
        makeTx('e', { date: new Date('2025-01-10T00:00:00.000Z'), type: 'debit', amount: 50 }),
      ]
      const result = buildCurrentMonthSummary(txs, 'USD', RATE)
      expect(result.expense).toBe(50)
    })
  })

  describe('buildCurrencySplit', () => {
    it('returns correct percentages for mixed spend', () => {
      const txs = [
        makeTx('usd', { amount: 1, currency: 'USD', type: 'debit' }),
        makeTx('uyu', { amount: RATE, currency: 'UYU', type: 'debit' }),
      ]
      // Both equal 1 USD each → 50/50
      const result = buildCurrencySplit(txs, 'USD', RATE)
      expect(result.pctUSD).toBeCloseTo(50)
      expect(result.pctUYU).toBeCloseTo(50)
    })

    it('excludes credits and transfers from the split', () => {
      const txs = [
        makeTx('credit', { type: 'credit', amount: 100 }),
        makeTx('transfer', { type: 'debit', category: Category.InternalTransfer, amount: 100 }),
        makeTx('real', { type: 'debit', amount: 50, currency: 'USD' }),
      ]
      const result = buildCurrencySplit(txs, 'USD', RATE)
      expect(result.USD).toBe(50)
      expect(result.UYU).toBe(0)
      expect(result.pctUSD).toBeCloseTo(100)
    })
  })

  describe('spendByAccount', () => {
    const RATE = 40

    function makeTx(
      id: string,
      overrides: Partial<Transaction> = {}
    ): Transaction {
      return {
        id,
        date: new Date('2025-03-01T00:00:00.000Z'),
        description: `tx-${id}`,
        amount: 10,
        currency: 'USD',
        type: 'debit',
        source: 'bank_account',
        rawData: {},
        ...overrides,
      }
    }

    it('buckets credit_card source as card regardless of currency', () => {
      const txs = [
        makeTx('cc-usd', { source: 'credit_card', currency: 'USD', amount: 100 }),
        makeTx('cc-uyu', { source: 'credit_card', currency: 'UYU', amount: 400 }),
      ]
      const result = spendByAccount(txs, 'USD', RATE)
      expect(result.card.count).toBe(2)
      expect(result.card.USD).toBe(100)
      expect(result.card.UYU).toBe(400)
      expect(result.usd.count).toBe(0)
      expect(result.uyu.count).toBe(0)
    })

    it('buckets bank_account by currency', () => {
      const txs = [
        makeTx('bank-usd', { source: 'bank_account', currency: 'USD', amount: 50 }),
        makeTx('bank-uyu', { source: 'bank_account', currency: 'UYU', amount: 200 }),
      ]
      const result = spendByAccount(txs, 'USD', RATE)
      expect(result.usd.count).toBe(1)
      expect(result.usd.USD).toBe(50)
      expect(result.uyu.count).toBe(1)
      expect(result.uyu.UYU).toBe(200)
      expect(result.card.count).toBe(0)
    })

    it('excludes credits and transfers', () => {
      const txs = [
        makeTx('income', { type: 'credit', category: Category.Income, amount: 500 }),
        makeTx('transfer', { type: 'debit', category: Category.InternalTransfer, amount: 100 }),
        makeTx('real', { source: 'credit_card', currency: 'USD', amount: 30 }),
      ]
      const result = spendByAccount(txs, 'USD', RATE)
      expect(result.card.count).toBe(1)
      expect(result.usd.count).toBe(0)
      expect(result.uyu.count).toBe(0)
    })

    it('pct values sum to 100 across all buckets', () => {
      const txs = [
        makeTx('cc', { source: 'credit_card', currency: 'USD', amount: 50 }),
        makeTx('ba-usd', { source: 'bank_account', currency: 'USD', amount: 30 }),
        makeTx('ba-uyu', { source: 'bank_account', currency: 'UYU', amount: 20 }),
      ]
      const result = spendByAccount(txs, 'USD', RATE)
      const total = result.card.pct + result.usd.pct + result.uyu.pct
      expect(total).toBeCloseTo(100)
    })

    it('card shows both USD and UYU native totals when mixed', () => {
      const txs = [
        makeTx('cc1', { source: 'credit_card', currency: 'USD', amount: 80 }),
        makeTx('cc2', { source: 'credit_card', currency: 'UYU', amount: 800 }),
      ]
      const result = spendByAccount(txs, 'USD', RATE)
      expect(result.card.USD).toBeGreaterThan(0)
      expect(result.card.UYU).toBeGreaterThan(0)
    })

    it('returns all-zero buckets for empty transactions', () => {
      const result = spendByAccount([], 'USD', RATE)
      expect(result.card.count).toBe(0)
      expect(result.usd.count).toBe(0)
      expect(result.uyu.count).toBe(0)
    })
  })
})

import { describe, it, expect } from 'vitest'
import {
  buildCategorySpendingConverted,
  buildMonthlyTrendsConverted,
  buildCurrentMonthSummary,
  buildCurrencySplit,
  spendByAccount,
  summarizeSavings,
  niceTicks,
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
        makeTx('1', {
          amount: 10,
          currency: 'USD',
          type: 'debit',
          category: Category.Groceries,
        }),
        makeTx('2', {
          amount: 400,
          currency: 'UYU',
          type: 'debit',
          category: Category.Groceries,
        }),
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
        makeTx('3', {
          type: 'debit',
          category: Category.Groceries,
          amount: 20,
        }),
      ]
      const result = buildCategorySpendingConverted(txs, 'USD', RATE)
      expect(result).toHaveLength(1)
      expect(result[0].total).toBe(20)
    })
  })

  describe('buildMonthlyTrendsConverted', () => {
    it('combines USD and UYU amounts for same month into home currency', () => {
      const txs = [
        makeTx('1', {
          amount: 10,
          currency: 'USD',
          type: 'credit',
          category: Category.Income,
          date: new Date('2025-01-10T00:00:00.000Z'),
        }),
        makeTx('2', {
          amount: 200,
          currency: 'UYU',
          type: 'debit',
          date: new Date('2025-01-20T00:00:00.000Z'),
        }),
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
        makeTx('income', {
          amount: 50,
          currency: 'USD',
          type: 'credit',
          category: Category.Income,
        }),
        makeTx('refund', {
          amount: 10,
          currency: 'USD',
          type: 'credit',
          category: Category.Groceries,
        }),
        makeTx('unknown', { amount: 5, currency: 'USD', type: 'credit' }),
      ]
      const result = buildMonthlyTrendsConverted(txs, 'USD', RATE)
      expect(result[0].income).toBe(65)
      expect(result[0].expense).toBe(0)
    })
  })

  describe('buildCurrentMonthSummary', () => {
    it('flags whether the latest month with data is the calendar month', () => {
      const txs = [
        makeTx('sep', {
          date: new Date('2026-09-25T00:00:00.000Z'),
          type: 'debit',
          amount: 10,
          currency: 'USD',
        }),
      ]
      // Oct 3: data stops in September, so it is not "este mes".
      expect(
        buildCurrentMonthSummary(txs, 'USD', RATE, new Date(2026, 9, 3))
          .isCurrentMonth
      ).toBe(false)
      expect(
        buildCurrentMonthSummary(txs, 'USD', RATE, new Date(2026, 8, 30))
          .isCurrentMonth
      ).toBe(true)
    })

    it('returns zeros for empty transactions', () => {
      const result = buildCurrentMonthSummary([], 'USD', RATE)
      expect(result.income).toBe(0)
      expect(result.expense).toBe(0)
    })

    it('computes latest-month totals in home currency', () => {
      const txs = [
        makeTx('old', {
          date: new Date('2024-11-01T00:00:00.000Z'),
          type: 'debit',
          amount: 999,
        }),
        makeTx('inc', {
          date: new Date('2025-01-15T00:00:00.000Z'),
          type: 'credit',
          category: Category.Income,
          amount: 100,
          currency: 'USD',
        }),
        makeTx('exp-usd', {
          date: new Date('2025-01-20T00:00:00.000Z'),
          type: 'debit',
          amount: 20,
          currency: 'USD',
        }),
        makeTx('exp-uyu', {
          date: new Date('2025-01-25T00:00:00.000Z'),
          type: 'debit',
          amount: 400,
          currency: 'UYU',
        }),
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
        makeTx('t', {
          date: new Date('2025-01-10T00:00:00.000Z'),
          type: 'debit',
          amount: 100,
          category: Category.InternalTransfer,
        }),
        makeTx('e', {
          date: new Date('2025-01-10T00:00:00.000Z'),
          type: 'debit',
          amount: 50,
        }),
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
        makeTx('transfer', {
          type: 'debit',
          category: Category.InternalTransfer,
          amount: 100,
        }),
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
        makeTx('cc-usd', {
          source: 'credit_card',
          currency: 'USD',
          amount: 100,
        }),
        makeTx('cc-uyu', {
          source: 'credit_card',
          currency: 'UYU',
          amount: 400,
        }),
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
        makeTx('bank-usd', {
          source: 'bank_account',
          currency: 'USD',
          amount: 50,
        }),
        makeTx('bank-uyu', {
          source: 'bank_account',
          currency: 'UYU',
          amount: 200,
        }),
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
        makeTx('income', {
          type: 'credit',
          category: Category.Income,
          amount: 500,
        }),
        makeTx('transfer', {
          type: 'debit',
          category: Category.InternalTransfer,
          amount: 100,
        }),
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
        makeTx('ba-usd', {
          source: 'bank_account',
          currency: 'USD',
          amount: 30,
        }),
        makeTx('ba-uyu', {
          source: 'bank_account',
          currency: 'UYU',
          amount: 20,
        }),
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

    it('excludes legacy pre-rename transfer ids from account spend', () => {
      const txs = [
        makeTx('real', { source: 'bank_account', currency: 'USD', amount: 40 }),
        makeTx('legacy', {
          source: 'bank_account',
          currency: 'USD',
          amount: 1000,
          category: 'transfer',
        }),
      ]
      const result = spendByAccount(txs, 'USD', RATE)
      expect(result.usd.conv).toBe(40)
      expect(result.usd.count).toBe(1)
    })
  })

  describe('ignored categories are never counted', () => {
    it('keeps legacy transfer ids out of category spending', () => {
      const transactions = [
        makeTransaction('tx-1', {
          amount: 30,
          category: Category.Groceries,
        }),
        makeTransaction('tx-2', { amount: 900, category: 'transfer' }),
        makeTransaction('tx-3', { amount: 700, category: 'transfers' }),
      ]

      const result = buildCategorySpendingConverted(transactions, 'USD', 40)

      expect(result).toEqual([{ category: Category.Groceries, total: 30 }])
    })

    it('keeps legacy transfer ids out of monthly trends', () => {
      const transactions = [
        makeTransaction('tx-1', {
          date: new Date('2025-03-10T00:00:00.000Z'),
          amount: 30,
          category: Category.Groceries,
        }),
        makeTransaction('tx-2', {
          date: new Date('2025-03-12T00:00:00.000Z'),
          amount: 900,
          category: 'transfer',
        }),
      ]

      const result = buildMonthlyTrendsConverted(transactions, 'USD', 40)

      expect(result).toEqual([
        { month: '2025-03', income: 0, expense: 30, net: -30 },
      ])
    })

    it('keeps legacy transfer ids out of the currency split', () => {
      const transactions = [
        makeTransaction('tx-1', { amount: 25, currency: 'USD' }),
        makeTransaction('tx-2', {
          amount: 4000,
          currency: 'UYU',
          category: 'transfer',
        }),
      ]

      const result = buildCurrencySplit(transactions, 'USD', 40)

      expect(result.total).toBe(25)
      expect(result.UYU).toBe(0)
      expect(result.pctUSD).toBe(100)
    })

    it('picks the reference month from counted transactions only', () => {
      const transactions = [
        makeTransaction('tx-1', {
          date: new Date('2025-03-10T00:00:00.000Z'),
          amount: 30,
          category: Category.Groceries,
        }),
        // A later month containing nothing but an ignored transfer must not
        // become the "este mes" reference month.
        makeTransaction('tx-2', {
          date: new Date('2025-04-02T00:00:00.000Z'),
          amount: 5000,
          category: Category.InternalTransfer,
        }),
      ]

      const result = buildCurrentMonthSummary(transactions, 'USD', 40)

      expect(result.expense).toBe(30)
      expect(result.count).toBe(1)
      expect(result.monthLabel).toContain('marzo')
    })

    it('returns an empty summary when every transaction is ignored', () => {
      const transactions = [
        makeTransaction('tx-1', {
          amount: 5000,
          category: Category.InternalTransfer,
        }),
      ]

      const result = buildCurrentMonthSummary(transactions, 'USD', 40)

      expect(result.count).toBe(0)
      expect(result.expense).toBe(0)
      expect(result.monthLabel).toBe('')
    })
  })
})

describe('summarizeSavings', () => {
  const month = (m: string, net: number) => ({ month: m, net })

  it('uses the median so one large inflow does not make a losing year look positive', () => {
    // Shape of a real account: 6 losing months, 3 positive, one of them a
    // ~US$ 35k one-off that drags the mean far above zero.
    const summary = summarizeSavings([
      month('ene', -3000),
      month('feb', -2600),
      month('mar', 35000),
      month('abr', -200),
      month('may', -1500),
      month('jun', 800),
      month('jul', 100),
      month('ago', -300),
      month('sep', -1468),
    ])

    expect(summary.meanNet).toBeGreaterThan(0)
    expect(summary.typicalNet).toBe(-300)
    expect(summary.positiveMonths).toBe(3)
    expect(summary.totalMonths).toBe(9)
    expect(summary.outlier).toEqual({ month: 'mar', net: 35000 })
  })

  it('names a month in the direction the mean was pulled, not the largest by magnitude', () => {
    // Median −10, mean +156: the −1000 month is the biggest by magnitude but
    // it pulls the mean down, so it cannot be what "inflated" it.
    const summary = summarizeSavings([
      month('ene', -1000),
      month('feb', -10),
      month('mar', -10),
      month('abr', 900),
      month('may', 910),
    ])

    expect(summary.meanNet).toBeGreaterThan(0)
    expect(summary.outlier).toEqual({ month: 'may', net: 910 })
  })

  it('picks the most negative month when a loss drags a positive year below zero', () => {
    const summary = summarizeSavings([
      month('ene', 100),
      month('feb', 120),
      month('mar', 110),
      month('abr', -2000),
      month('may', 1500),
    ])

    expect(summary.typicalNet).toBe(110)
    expect(summary.meanNet).toBeLessThan(0)
    expect(summary.outlier).toEqual({ month: 'abr', net: -2000 })
  })

  it('reports no outlier when mean and median agree', () => {
    const summary = summarizeSavings([
      month('ene', 100),
      month('feb', 300),
      month('mar', 200),
    ])

    expect(summary.typicalNet).toBe(200)
    expect(summary.outlier).toBeNull()
  })

  it('averages the two middle months for an even count', () => {
    expect(
      summarizeSavings([month('a', -100), month('b', 300)]).typicalNet
    ).toBe(100)
  })

  it('handles no data', () => {
    expect(summarizeSavings([])).toEqual({
      typicalNet: 0,
      meanNet: 0,
      positiveMonths: 0,
      totalMonths: 0,
      outlier: null,
    })
  })
})

describe('niceTicks', () => {
  it('produces round, evenly spaced ticks that include zero', () => {
    // Real savings range: a -2.6k month and a +35k month.
    expect(niceTicks(-2600, 35000)).toEqual([
      -10000, 0, 10000, 20000, 30000, 40000,
    ])
  })

  it('includes zero for all-positive data', () => {
    expect(niceTicks(1200, 4800)).toEqual([0, 2000, 4000, 6000])
  })

  it('handles all-negative data', () => {
    expect(niceTicks(-900, -100)).toEqual([-1000, -750, -500, -250, 0])
  })

  it('returns just zero when there is no range', () => {
    expect(niceTicks(0, 0)).toEqual([0])
  })
})

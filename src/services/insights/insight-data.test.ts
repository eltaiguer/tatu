import { describe, it, expect } from 'vitest'
import { buildInsightInput, getUtcMonthPeriod } from './insight-data'
import type { Transaction } from '../../models'
import { Category } from '../../models'

function makeTransaction(
  id: string,
  overrides: Partial<Transaction> = {}
): Transaction {
  return {
    id,
    date: new Date('2026-06-15T00:00:00.000Z'),
    description: `Transaction ${id}`,
    amount: 10,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
    ...overrides,
  }
}

const JUNE = { start: new Date('2026-06-01T00:00:00.000Z'), end: new Date('2026-06-30T23:59:59.999Z') }

describe('getUtcMonthPeriod', () => {
  it('returns UTC month boundaries regardless of time-of-day on the reference date', () => {
    const period = getUtcMonthPeriod(new Date('2026-06-15T23:00:00.000Z'))
    expect(period.start.toISOString()).toBe('2026-06-01T00:00:00.000Z')
    expect(period.end.toISOString()).toBe('2026-06-30T23:59:59.999Z')
  })

  it('does not exclude a transaction dated exactly at UTC month start', () => {
    // Regression guard: a local-timezone-based boundary (e.g. via date-fns
    // startOfMonth, which reads the browser's local wall clock) would put
    // period.start a few hours after 00:00 UTC for any non-UTC+0 timezone,
    // silently dropping same-day transactions into the wrong period.
    const period = getUtcMonthPeriod(new Date('2026-06-15T00:00:00.000Z'))
    const firstOfMonth = new Date('2026-06-01T00:00:00.000Z')
    expect(firstOfMonth >= period.start).toBe(true)
  })

  it('applies a month offset, rolling over year boundaries', () => {
    const december = getUtcMonthPeriod(new Date('2026-01-15T00:00:00.000Z'), -1)
    expect(december.start.toISOString()).toBe('2025-12-01T00:00:00.000Z')
    expect(december.end.toISOString()).toBe('2025-12-31T23:59:59.999Z')
  })

  it('handles a leap-year February correctly', () => {
    const feb = getUtcMonthPeriod(new Date('2028-02-10T00:00:00.000Z'))
    expect(feb.end.toISOString()).toBe('2028-02-29T23:59:59.999Z')
  })
})

describe('buildInsightInput', () => {
  it('computes category totals with pctOfTotal and delta vs prior period', () => {
    const transactions = [
      // June (current period): groceries 100, restaurants 50
      makeTransaction('g1', { date: new Date('2026-06-05'), amount: 60, category: Category.Groceries }),
      makeTransaction('g2', { date: new Date('2026-06-15'), amount: 40, category: Category.Groceries }),
      makeTransaction('r1', { date: new Date('2026-06-20'), amount: 50, category: Category.Restaurants }),
      // May (prior period): groceries 80
      makeTransaction('g3', { date: new Date('2026-05-10'), amount: 80, category: Category.Groceries }),
    ]

    const result = buildInsightInput(transactions, JUNE, 'USD', 40.5)

    const groceries = result.categoryTotals.find((c) => c.category === Category.Groceries)
    const restaurants = result.categoryTotals.find((c) => c.category === Category.Restaurants)

    expect(groceries?.amount).toBe(100)
    expect(groceries?.deltaVsPriorPeriod).toBe(20) // 100 - 80
    expect(restaurants?.amount).toBe(50)
    expect(restaurants?.deltaVsPriorPeriod).toBe(50) // 50 - 0, nothing in May

    // pctOfTotal sums to ~100 across categories
    const totalPct = result.categoryTotals.reduce((sum, c) => sum + c.pctOfTotal, 0)
    expect(totalPct).toBeCloseTo(100, 5)
  })

  it('excludes credits, ignored/transfer categories, and split parents from category totals', () => {
    const transactions = [
      makeTransaction('income', { date: new Date('2026-06-05'), amount: 1000, type: 'credit', category: Category.Income }),
      makeTransaction('transfer', { date: new Date('2026-06-06'), amount: 200, category: Category.InternalTransfer }),
      makeTransaction('split-parent', { date: new Date('2026-06-07'), amount: 300, category: Category.Groceries, isSplitParent: true }),
      makeTransaction('real', { date: new Date('2026-06-08'), amount: 25, category: Category.Groceries }),
    ]

    const result = buildInsightInput(transactions, JUNE, 'USD', 40.5)

    expect(result.categoryTotals).toEqual([
      expect.objectContaining({ category: Category.Groceries, amount: 25 }),
    ])
  })

  it('ranks top merchants by converted spend within the period only', () => {
    const transactions = [
      makeTransaction('m1', { date: new Date('2026-06-01'), amount: 30, displayDescription: 'Netflix', category: Category.Entertainment }),
      makeTransaction('m2', { date: new Date('2026-06-01'), amount: 20, displayDescription: 'Netflix', category: Category.Entertainment }),
      makeTransaction('m3', { date: new Date('2026-06-02'), amount: 15, description: 'UBER TRIP', category: Category.Transport }),
      // Outside period — must not count toward topMerchants
      makeTransaction('m4', { date: new Date('2026-05-02'), amount: 500, displayDescription: 'Netflix', category: Category.Entertainment }),
    ]

    const result = buildInsightInput(transactions, JUNE, 'USD', 40.5)

    expect(result.topMerchants[0]).toEqual({ merchant: 'Netflix', amount: 50, count: 2 })
    expect(result.topMerchants[1]).toEqual({ merchant: 'UBER TRIP', amount: 15, count: 1 })
  })

  it('detects a recurring monthly charge across the lookback window', () => {
    const transactions = [
      makeTransaction('s1', { date: new Date('2026-03-10'), amount: 15, displayDescription: 'Spotify', category: Category.Entertainment }),
      makeTransaction('s2', { date: new Date('2026-04-10'), amount: 15, displayDescription: 'Spotify', category: Category.Entertainment }),
      makeTransaction('s3', { date: new Date('2026-05-10'), amount: 15, displayDescription: 'Spotify', category: Category.Entertainment }),
      makeTransaction('s4', { date: new Date('2026-06-10'), amount: 15.5, displayDescription: 'Spotify', category: Category.Entertainment }),
      // A single one-off large purchase — must not be flagged as recurring
      makeTransaction('once', { date: new Date('2026-06-12'), amount: 900, displayDescription: 'Muebles del Este', category: Category.Shopping }),
    ]

    const result = buildInsightInput(transactions, JUNE, 'USD', 40.5)

    const spotify = result.recurringCharges.find((c) => c.merchant === 'Spotify')
    expect(spotify).toBeDefined()
    expect(spotify?.cadence).toBe('monthly')
    expect(spotify?.monthsSeen).toBe(4)
    expect(result.recurringCharges.some((c) => c.merchant === 'Muebles del Este')).toBe(false)
  })

  it('does not flag a merchant with wildly varying amounts as recurring', () => {
    const transactions = [
      makeTransaction('v1', { date: new Date('2026-03-10'), amount: 10, displayDescription: 'MercadoPago Varios', category: Category.Shopping }),
      makeTransaction('v2', { date: new Date('2026-04-10'), amount: 200, displayDescription: 'MercadoPago Varios', category: Category.Shopping }),
      makeTransaction('v3', { date: new Date('2026-05-10'), amount: 5, displayDescription: 'MercadoPago Varios', category: Category.Shopping }),
    ]

    const result = buildInsightInput(transactions, JUNE, 'USD', 40.5)

    expect(result.recurringCharges).toHaveLength(0)
  })

  it('builds a monthly trend using converted income/expense over the trailing window', () => {
    const transactions = [
      makeTransaction('may-income', { date: new Date('2026-05-01'), amount: 1000, type: 'credit', category: Category.Income }),
      makeTransaction('may-expense', { date: new Date('2026-05-02'), amount: 400, category: Category.Groceries }),
      makeTransaction('june-income', { date: new Date('2026-06-01'), amount: 1000, type: 'credit', category: Category.Income }),
      makeTransaction('june-expense', { date: new Date('2026-06-02'), amount: 600, category: Category.Groceries }),
    ]

    const result = buildInsightInput(transactions, JUNE, 'USD', 40.5)

    const may = result.monthlyTrend.find((m) => m.month === '2026-05')
    const june = result.monthlyTrend.find((m) => m.month === '2026-06')
    expect(may).toEqual({ month: '2026-05', income: 1000, expense: 400 })
    expect(june).toEqual({ month: '2026-06', income: 1000, expense: 600 })
  })

  it('converts amounts to the requested home currency', () => {
    const transactions = [
      makeTransaction('uyu1', { date: new Date('2026-06-05'), amount: 405, currency: 'UYU', category: Category.Groceries }),
    ]

    const result = buildInsightInput(transactions, JUNE, 'USD', 40.5)

    expect(result.categoryTotals[0].amount).toBeCloseTo(10, 5)
  })

  it('stamps periodStart/periodEnd and homeCurrency on the result', () => {
    const result = buildInsightInput([], JUNE, 'UYU', 40.5)
    expect(result.periodStart).toBe('2026-06-01')
    expect(result.periodEnd).toBe('2026-06-30')
    expect(result.homeCurrency).toBe('UYU')
  })
})

describe('buildInsightInput — prior period is the previous calendar month', () => {
  const MARCH = {
    start: new Date('2026-03-01T00:00:00.000Z'),
    end: new Date('2026-03-31T23:59:59.999Z'),
  }

  it('compares March against February, not against a rolling 31-day window', () => {
    // A 31-day rolling window ending Feb 28 starts on Jan 28, so the Jan 31
    // charge would leak into March's baseline and understate the delta.
    const transactions = [
      makeTransaction('mar', {
        date: new Date('2026-03-10T00:00:00.000Z'),
        amount: 100,
        category: Category.Groceries,
      }),
      makeTransaction('feb', {
        date: new Date('2026-02-15T00:00:00.000Z'),
        amount: 40,
        category: Category.Groceries,
      }),
      makeTransaction('jan', {
        date: new Date('2026-01-31T00:00:00.000Z'),
        amount: 1000,
        category: Category.Groceries,
      }),
    ]

    const input = buildInsightInput(transactions, MARCH, 'USD', 40)
    const groceries = input.categoryTotals.find(
      (c) => c.category === Category.Groceries
    )

    // 100 (March) - 40 (February only) = 60
    expect(groceries?.deltaVsPriorPeriod).toBe(60)
  })

  it('uses December of the previous year as January prior period', () => {
    const january = {
      start: new Date('2026-01-01T00:00:00.000Z'),
      end: new Date('2026-01-31T23:59:59.999Z'),
    }
    const transactions = [
      makeTransaction('jan', {
        date: new Date('2026-01-10T00:00:00.000Z'),
        amount: 50,
        category: Category.Groceries,
      }),
      makeTransaction('dec', {
        date: new Date('2025-12-20T00:00:00.000Z'),
        amount: 30,
        category: Category.Groceries,
      }),
    ]

    const input = buildInsightInput(transactions, january, 'USD', 40)
    const groceries = input.categoryTotals.find(
      (c) => c.category === Category.Groceries
    )

    expect(groceries?.deltaVsPriorPeriod).toBe(20)
  })
})

describe('buildInsightInput — amounts are rounded for the model', () => {
  // The model is asked to echo amounts back EXACTLY, and the generator
  // validates them with ===. Float residue from convert() makes that a
  // lottery, so every monetary field is rounded at source.
  function isRounded(value: number): boolean {
    return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9
  }

  it('rounds converted category totals, deltas and percentages to 2 decimals', () => {
    // 50000 UYU / 40.5 = 1234.5679012345679 in USD
    const transactions = [
      makeTransaction('a', {
        date: new Date('2026-06-10T00:00:00.000Z'),
        amount: 50000,
        currency: 'UYU',
        category: Category.Restaurants,
      }),
      makeTransaction('b', {
        date: new Date('2026-06-11T00:00:00.000Z'),
        amount: 33333,
        currency: 'UYU',
        category: Category.Groceries,
      }),
    ]

    const input = buildInsightInput(transactions, JUNE, 'USD', 40.5)

    expect(input.categoryTotals.length).toBeGreaterThan(0)
    for (const c of input.categoryTotals) {
      expect(isRounded(c.amount)).toBe(true)
      expect(isRounded(c.pctOfTotal)).toBe(true)
      expect(isRounded(c.deltaVsPriorPeriod)).toBe(true)
    }
  })

  it('rounds merchant totals to 2 decimals', () => {
    const transactions = [
      makeTransaction('a', {
        date: new Date('2026-06-10T00:00:00.000Z'),
        amount: 50000,
        currency: 'UYU',
        description: 'RESTAURANTE X',
        category: Category.Restaurants,
      }),
    ]

    const input = buildInsightInput(transactions, JUNE, 'USD', 40.5)

    expect(input.topMerchants.length).toBeGreaterThan(0)
    for (const m of input.topMerchants) {
      expect(isRounded(m.amount)).toBe(true)
    }
  })

  it('rounds monthly trend income and expense to 2 decimals', () => {
    const transactions = [
      makeTransaction('a', {
        date: new Date('2026-06-10T00:00:00.000Z'),
        amount: 50000,
        currency: 'UYU',
        category: Category.Restaurants,
      }),
      makeTransaction('b', {
        date: new Date('2026-06-12T00:00:00.000Z'),
        amount: 77777,
        currency: 'UYU',
        type: 'credit',
        category: Category.Income,
      }),
    ]

    const input = buildInsightInput(transactions, JUNE, 'USD', 40.5)

    expect(input.monthlyTrend.length).toBeGreaterThan(0)
    for (const m of input.monthlyTrend) {
      expect(isRounded(m.income)).toBe(true)
      expect(isRounded(m.expense)).toBe(true)
    }
  })
})

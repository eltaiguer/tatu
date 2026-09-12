import { describe, it, expect } from 'vitest'
import { buildInsightInput } from './insight-data'
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

describe('buildInsightInput', () => {
  it('returns an empty, blank result for zero transactions', () => {
    const result = buildInsightInput([], 'USD', 40.5)

    expect(result).toEqual({
      historyStart: '',
      historyEnd: '',
      homeCurrency: 'USD',
      categoryTotals: [],
      topMerchants: [],
      recurringCharges: [],
      monthlyTrend: [],
    })
  })

  it('computes category totals with pctOfTotal across the entire history', () => {
    const transactions = [
      makeTransaction('g1', { date: new Date('2026-01-05'), amount: 60, category: Category.Groceries }),
      makeTransaction('g2', { date: new Date('2026-06-15'), amount: 40, category: Category.Groceries }),
      makeTransaction('r1', { date: new Date('2026-06-20'), amount: 50, category: Category.Restaurants }),
    ]

    const result = buildInsightInput(transactions, 'USD', 40.5)

    const groceries = result.categoryTotals.find((c) => c.category === Category.Groceries)
    const restaurants = result.categoryTotals.find((c) => c.category === Category.Restaurants)

    expect(groceries?.amount).toBe(100)
    expect(restaurants?.amount).toBe(50)
    expect((groceries as { deltaVsPriorPeriod?: unknown }).deltaVsPriorPeriod).toBeUndefined()

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

    const result = buildInsightInput(transactions, 'USD', 40.5)

    expect(result.categoryTotals).toEqual([
      expect.objectContaining({ category: Category.Groceries, amount: 25 }),
    ])
  })

  it('ranks top merchants by converted spend across the entire history', () => {
    const transactions = [
      makeTransaction('m1', { date: new Date('2026-01-01'), amount: 30, displayDescription: 'Netflix', category: Category.Entertainment }),
      makeTransaction('m2', { date: new Date('2026-06-01'), amount: 20, displayDescription: 'Netflix', category: Category.Entertainment }),
      makeTransaction('m3', { date: new Date('2026-06-02'), amount: 15, description: 'UBER TRIP', category: Category.Transport }),
    ]

    const result = buildInsightInput(transactions, 'USD', 40.5)

    expect(result.topMerchants[0]).toEqual({ merchant: 'Netflix', amount: 50, count: 2 })
    expect(result.topMerchants[1]).toEqual({ merchant: 'UBER TRIP', amount: 15, count: 1 })
  })

  it('detects an active recurring monthly charge with a small monthsSinceLastSeen', () => {
    const transactions = [
      makeTransaction('s1', { date: new Date('2026-03-10'), amount: 15, displayDescription: 'Spotify', category: Category.Entertainment }),
      makeTransaction('s2', { date: new Date('2026-04-10'), amount: 15, displayDescription: 'Spotify', category: Category.Entertainment }),
      makeTransaction('s3', { date: new Date('2026-05-10'), amount: 15, displayDescription: 'Spotify', category: Category.Entertainment }),
      makeTransaction('s4', { date: new Date('2026-06-10'), amount: 15.5, displayDescription: 'Spotify', category: Category.Entertainment }),
      // A single one-off large purchase — must not be flagged as recurring
      makeTransaction('once', { date: new Date('2026-06-12'), amount: 900, displayDescription: 'Muebles del Este', category: Category.Shopping }),
    ]

    const result = buildInsightInput(transactions, 'USD', 40.5)

    const spotify = result.recurringCharges.find((c) => c.merchant === 'Spotify')
    expect(spotify).toBeDefined()
    expect(spotify?.cadence).toBe('monthly')
    expect(spotify?.monthsSeen).toBe(4)
    expect(spotify?.lastSeenMonth).toBe('2026-06')
    expect(spotify?.monthsSinceLastSeen).toBe(0)
    expect(result.recurringCharges.some((c) => c.merchant === 'Muebles del Este')).toBe(false)
  })

  it('detects a recurring charge across an unbounded history (no lookback window) and flags it as lapsed', () => {
    const transactions = [
      // Gym membership, charged monthly for 6 months, cancelled 8 months before the latest transaction
      makeTransaction('gym1', { date: new Date('2023-01-05'), amount: 40, displayDescription: 'Gimnasio', category: Category.Personal }),
      makeTransaction('gym2', { date: new Date('2023-02-05'), amount: 40, displayDescription: 'Gimnasio', category: Category.Personal }),
      makeTransaction('gym3', { date: new Date('2023-03-05'), amount: 40, displayDescription: 'Gimnasio', category: Category.Personal }),
      // Latest transaction in history, 8 months after the gym's last charge
      makeTransaction('latest', { date: new Date('2023-11-05'), amount: 20, category: Category.Groceries }),
    ]

    const result = buildInsightInput(transactions, 'USD', 40.5)

    const gym = result.recurringCharges.find((c) => c.merchant === 'Gimnasio')
    expect(gym).toBeDefined()
    expect(gym?.lastSeenMonth).toBe('2023-03')
    expect(gym?.monthsSinceLastSeen).toBe(8)
    expect(result.historyEnd).toBe('2023-11-05')
  })

  it('does not flag a merchant with wildly varying amounts as recurring', () => {
    const transactions = [
      makeTransaction('v1', { date: new Date('2026-03-10'), amount: 10, displayDescription: 'MercadoPago Varios', category: Category.Shopping }),
      makeTransaction('v2', { date: new Date('2026-04-10'), amount: 200, displayDescription: 'MercadoPago Varios', category: Category.Shopping }),
      makeTransaction('v3', { date: new Date('2026-05-10'), amount: 5, displayDescription: 'MercadoPago Varios', category: Category.Shopping }),
    ]

    const result = buildInsightInput(transactions, 'USD', 40.5)

    expect(result.recurringCharges).toHaveLength(0)
  })

  it('builds a monthly trend using converted income/expense across the entire history', () => {
    const transactions = [
      makeTransaction('may-income', { date: new Date('2026-05-01'), amount: 1000, type: 'credit', category: Category.Income }),
      makeTransaction('may-expense', { date: new Date('2026-05-02'), amount: 400, category: Category.Groceries }),
      makeTransaction('june-income', { date: new Date('2026-06-01'), amount: 1000, type: 'credit', category: Category.Income }),
      makeTransaction('june-expense', { date: new Date('2026-06-02'), amount: 600, category: Category.Groceries }),
    ]

    const result = buildInsightInput(transactions, 'USD', 40.5)

    const may = result.monthlyTrend.find((m) => m.month === '2026-05')
    const june = result.monthlyTrend.find((m) => m.month === '2026-06')
    expect(may).toEqual({ month: '2026-05', income: 1000, expense: 400 })
    expect(june).toEqual({ month: '2026-06', income: 1000, expense: 600 })
  })

  it('converts amounts to the requested home currency', () => {
    const transactions = [
      makeTransaction('uyu1', { date: new Date('2026-06-05'), amount: 405, currency: 'UYU', category: Category.Groceries }),
    ]

    const result = buildInsightInput(transactions, 'USD', 40.5)

    expect(result.categoryTotals[0].amount).toBeCloseTo(10, 5)
  })

  it('stamps historyStart/historyEnd from the earliest/latest transaction and homeCurrency on the result', () => {
    const transactions = [
      makeTransaction('early', { date: new Date('2025-01-10'), amount: 10, category: Category.Groceries }),
      makeTransaction('late', { date: new Date('2026-06-30'), amount: 10, category: Category.Groceries }),
    ]

    const result = buildInsightInput(transactions, 'UYU', 40.5)
    expect(result.historyStart).toBe('2025-01-10')
    expect(result.historyEnd).toBe('2026-06-30')
    expect(result.homeCurrency).toBe('UYU')
  })
})

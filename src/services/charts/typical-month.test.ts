import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import { convert } from '../currency/convert'
import { isCountedExpense } from '../spending/spending-rules'
import { toMonthKey } from '../../utils/date-utils'
import type { MonthlyTrendRow } from './dashboard-rows'
import { typicalMonth } from './typical-month'

function month(key: string, gastos: number, complete = true): MonthlyTrendRow {
  return {
    key,
    month: key,
    ingresos: 0,
    gastos,
    todoGastos: gastos,
    neto: -gastos,
    complete,
  }
}

let seq = 0
function tx(overrides: Partial<Transaction>): Transaction {
  seq += 1
  return {
    id: `t${seq}`,
    date: new Date('2026-07-10T00:00:00.000Z'),
    description: 'row',
    amount: 10,
    currency: 'USD',
    type: 'debit',
    source: 'credit_card',
    category: 'groceries',
    rawData: {},
    ...overrides,
  }
}

const on = (day: string) => new Date(`${day}T00:00:00.000Z`)

describe('typicalMonth: the headline', () => {
  it('is the median, min and max of the complete months, leaving a partial one out', () => {
    const trend = [
      month('2026-07', 300),
      month('2026-08', 500),
      month('2026-09', 400),
      month('2026-10', 900, false),
    ]

    const result = typicalMonth(trend, [], 'USD', 40)

    expect(result).toMatchObject({
      months: ['2026-07', '2026-08', '2026-09'],
      median: 400,
      min: 300,
      max: 500,
    })
  })

  it('takes the mean of the two middle months when the count is even', () => {
    const trend = [
      month('2026-06', 300),
      month('2026-07', 500),
      month('2026-08', 400),
      month('2026-09', 200),
    ]

    expect(typicalMonth(trend, [], 'USD', 40)?.median).toBe(350)
  })

  it('counts a complete month with no household spend as a real $0', () => {
    const trend = [
      month('2026-07', 0),
      month('2026-08', 200),
      month('2026-09', 300),
    ]

    const result = typicalMonth(trend, [], 'USD', 40)

    expect(result).toMatchObject({ median: 200, min: 0, max: 300 })
    expect(result?.months).toHaveLength(3)
  })

  it('is null when no month is complete', () => {
    expect(typicalMonth([month('2026-10', 900, false)], [], 'USD', 40)).toBe(
      null
    )
    expect(typicalMonth([], [], 'USD', 40)).toBe(null)
  })
})

describe('typicalMonth: the top categories', () => {
  function fixture(): Transaction[] {
    return [
      // July
      tx({ date: on('2026-07-02'), category: 'groceries', amount: 200 }),
      tx({ date: on('2026-07-03'), category: 'utilities', amount: 100 }),
      tx({ date: on('2026-07-04'), category: 'automotive', amount: 50 }),
      tx({ date: on('2026-07-05'), category: 'education', amount: 50 }),
      // a split parent does not count, its parts do
      tx({
        date: on('2026-07-06'),
        category: 'groceries',
        amount: 80,
        isSplitParent: true,
      }),
      tx({
        date: on('2026-07-06'),
        category: 'groceries',
        amount: 60,
        splitParentId: 'p',
      }),
      tx({
        date: on('2026-07-06'),
        category: 'utilities',
        amount: 20,
        splitParentId: 'p',
      }),
      // a credit and a transfer move nothing
      tx({
        date: on('2026-07-07'),
        category: 'groceries',
        amount: 70,
        type: 'credit',
      }),
      tx({
        date: on('2026-07-08'),
        category: 'internal_transfer',
        amount: 500,
      }),
      // August
      tx({
        date: on('2026-08-02'),
        category: 'groceries',
        amount: 4000,
        currency: 'UYU',
      }),
      tx({ date: on('2026-08-03'), category: 'housing', amount: 400 }),
      tx({ date: on('2026-08-04'), category: 'automotive', amount: 50 }),
      tx({ date: on('2026-08-05'), category: 'education', amount: 50 }),
      // September
      tx({ date: on('2026-09-02'), category: 'groceries', amount: 150 }),
      tx({ date: on('2026-09-03'), category: 'utilities', amount: 250 }),
      tx({ date: on('2026-09-04'), category: 'automotive', amount: 50 }),
      tx({ date: on('2026-09-05'), category: 'education', amount: 50 }),
      // October is partial
      tx({ date: on('2026-10-02'), category: 'healthcare', amount: 900 }),
    ]
  }
  const usdTrend = [
    month('2026-07', 480),
    month('2026-08', 600),
    month('2026-09', 500),
    month('2026-10', 900, false),
  ]
  const uyuTrend = usdTrend.map((m) => ({
    ...m,
    gastos: m.gastos * 40,
    todoGastos: m.todoGastos * 40,
  }))

  it('ranks each category by its own median over the complete months', () => {
    const result = typicalMonth(usdTrend, fixture(), 'USD', 40)

    // groceries [260, 100, 150] → 150, utilities [120, 0, 250] → 120,
    // housing [0, 400, 0] → 0 (dropped), automotive / education tie at 50 and
    // the id order keeps automotive, healthcare is only in the partial month.
    expect(result?.topCategories).toEqual([
      { category: 'groceries', median: 150 },
      { category: 'utilities', median: 120 },
      { category: 'automotive', median: 50 },
    ])
    expect(result?.median).toBe(500)
    expect(result).toMatchObject({ min: 480, max: 600 })
  })

  it('adds up, per month, to the trend row it is shown beside', () => {
    const rows = fixture()
    const sums = new Map<string, number>()
    for (const row of rows) {
      if (!isCountedExpense(row)) continue
      const key = toMonthKey(row.date)
      sums.set(
        key,
        (sums.get(key) ?? 0) + convert(row.amount, row.currency, 'USD', 40)
      )
    }

    for (const m of usdTrend) expect(sums.get(m.key)).toBe(m.gastos)
  })

  it('converts into the home currency', () => {
    const result = typicalMonth(uyuTrend, fixture(), 'UYU', 40)

    expect(result?.median).toBe(20000)
    expect(result?.topCategories.slice(0, 2)).toEqual([
      { category: 'groceries', median: 6000 },
      { category: 'utilities', median: 4800 },
    ])
  })

  it('is empty when no category has a median above zero', () => {
    const trend = [
      month('2026-07', 100),
      month('2026-08', 0),
      month('2026-09', 0),
    ]
    const rows = [tx({ date: on('2026-07-02'), amount: 100 })]

    expect(typicalMonth(trend, rows, 'USD', 40)?.topCategories).toEqual([])
  })
})

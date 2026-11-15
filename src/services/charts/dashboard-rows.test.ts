import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import { buildMonthlyTrendRows } from './dashboard-rows'

let seq = 0
function tx(isoDay: string, amount: number): Transaction {
  seq += 1
  return {
    id: `t${seq}`,
    date: new Date(`${isoDay}T00:00:00.000Z`),
    description: 'row',
    amount,
    currency: 'USD',
    type: 'debit',
    source: 'credit_card',
    category: 'groceries',
    rawData: {},
  }
}

describe('buildMonthlyTrendRows', () => {
  it('flags which months are fully imported, keeping the partial ones as bars', () => {
    const rows = buildMonthlyTrendRows(
      [
        tx('2026-01-12', 100), // card imported from the 12th
        tx('2026-02-27', 200),
        tx('2026-03-10', 50), // statement closes on the 10th
      ],
      'USD',
      40,
      '2026-11'
    )

    expect(rows.map((r) => [r.key, r.gastos, r.complete])).toEqual([
      ['2026-01', 100, false],
      ['2026-02', 200, true],
      ['2026-03', 50, false],
    ])
  })

  it('never flags the current month complete', () => {
    const rows = buildMonthlyTrendRows(
      [tx('2026-02-01', 10), tx('2026-03-31', 20)],
      'USD',
      40,
      '2026-03'
    )

    expect(rows.map((r) => r.complete)).toEqual([true, false])
  })

  it('takes the months and their completeness from the coverage rows, with 0 where the drawn rows have none', () => {
    const all = [
      tx('2026-01-12', 100), // card imported from the 12th
      tx('2026-02-27', 200),
      tx('2026-03-10', 50), // statement closes on the 10th
    ]
    // Only March's row is drawn (e.g. the household ones), but the axis is
    // the same months as without the cut, February (complete) at 0.
    const rows = buildMonthlyTrendRows([all[2]], 'USD', 40, '2026-11', all)

    expect(rows.map((r) => [r.key, r.gastos, r.complete])).toEqual([
      ['2026-01', 0, false],
      ['2026-02', 0, true],
      ['2026-03', 50, false],
    ])
  })
})

import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import { completeMonths } from './complete-months'

let seq = 0
function tx(isoDay: string, overrides: Partial<Transaction> = {}): Transaction {
  seq += 1
  return {
    id: `t${seq}`,
    date: new Date(`${isoDay}T00:00:00.000Z`),
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

const uyu = { source: 'bank_account', currency: 'UYU' } as const

describe('completeMonths', () => {
  it('counts a month complete only when every account covers it edge to edge', () => {
    const months = completeMonths(
      [
        // Card: Jan 2 → Apr 10 (its April statement closes on the 10th).
        tx('2026-01-02'),
        tx('2026-02-15'),
        tx('2026-04-10'),
        // UYU account: imported from Feb 20 only.
        tx('2026-02-20', uyu),
        tx('2026-04-30', uyu),
      ],
      '2026-11'
    )

    // January: the UYU account isn't imported yet. February: it starts on
    // the 20th. March: both cover it (the card has no March row, but data
    // on both sides). April: the card stops on the 10th.
    expect([...months]).toEqual(['2026-03'])
  })

  it('never counts the current month or a later one', () => {
    const months = completeMonths(
      [tx('2026-09-01'), tx('2026-10-30'), tx('2026-11-30')],
      '2026-10'
    )

    expect([...months]).toEqual(['2026-09'])
  })

  it('ignores an account silent for longer than a statement cycle', () => {
    const months = completeMonths(
      [
        tx('2026-01-01'),
        tx('2026-05-31'),
        // A USD account last used in January: dormant by April.
        tx('2026-01-15', { source: 'bank_account' }),
      ],
      '2026-11'
    )

    expect([...months]).toEqual(['2026-04', '2026-05'])
  })

  it('reads ignored rows (transfers) as coverage, but not split parents', () => {
    const months = completeMonths(
      [
        tx('2026-01-01', { category: 'internal_transfer' }),
        tx('2026-01-31'),
        tx('2026-02-28', { isSplitParent: true }),
      ],
      '2026-11'
    )

    // January starts with a transfer; February's only end-of-month row is
    // a split parent, which isn't a row of its own.
    expect([...months]).toEqual(['2026-01'])
  })
})

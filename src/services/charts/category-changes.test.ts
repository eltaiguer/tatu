import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import { categoryChanges } from './category-changes'

let seq = 0
function tx(
  isoDay: string,
  category: string,
  amount: number,
  overrides: Partial<Transaction> = {}
): Transaction {
  seq += 1
  return {
    id: `t${seq}`,
    date: new Date(`${isoDay}T12:00:00.000Z`),
    description: category,
    amount,
    currency: 'USD',
    type: 'debit',
    source: 'credit_card',
    category,
    rawData: {},
    ...overrides,
  }
}

// One account (card) with full months Jun–Sep 2026 bracketed by data on the
// first and last days, so every month in between is complete.
function fullMonths(
  months: string[],
  perMonth: (month: string) => Transaction[]
): Transaction[] {
  return months.flatMap((m) => [
    tx(`${m}-01`, 'fees', 0.01),
    tx(`${m}-28`, 'fees', 0.01),
    ...perMonth(m),
  ])
}

const NOW = new Date('2026-10-03T12:00:00.000Z')

describe('categoryChanges', () => {
  it('compares the latest complete month with the median of the 3 before it', () => {
    const txs = fullMonths(['2026-06', '2026-07', '2026-08', '2026-09'], (m) =>
      m === '2026-09'
        ? [tx(`${m}-10`, 'restaurants', 400)]
        : [tx(`${m}-10`, 'restaurants', m === '2026-07' ? 250 : 300)]
    )
    const result = categoryChanges(txs, 'USD', 40, NOW)

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.reference).toBe('2026-09')
    expect(result.baseline).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(result.increases[0]).toMatchObject({
      category: 'restaurants',
      current: 400,
      baselineByMonth: [300, 250, 300],
      median: 300,
      delta: 100,
    })
    expect(result.increases[0].pct).toBeCloseTo(1 / 3)
  })

  it('never uses the current, unfinished month as the reference', () => {
    const txs = [
      ...fullMonths(['2026-06', '2026-07', '2026-08', '2026-09'], (m) => [
        tx(`${m}-10`, 'restaurants', 100),
      ]),
      tx('2026-10-02', 'restaurants', 5000),
    ]
    const result = categoryChanges(txs, 'USD', 40, NOW)

    expect(result.kind === 'ok' && result.reference).toBe('2026-09')
  })

  it('treats a month an account only partly covers as incomplete (card cycle)', () => {
    // Bank covers through Sep 30, the card statement stops on Sep 20.
    const bank = { source: 'bank_account' as const }
    const txs = [
      ...fullMonths(['2026-05', '2026-06', '2026-07', '2026-08'], (m) => [
        tx(`${m}-10`, 'restaurants', 100),
      ]),
      tx('2026-09-02', 'fees', 0.01),
      tx('2026-09-20', 'restaurants', 10),
      ...['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].flatMap(
        (m) => [
          tx(`${m}-01`, 'housing', 500, bank),
          tx(`${m}-29`, 'housing', 1, bank),
        ]
      ),
    ]
    const result = categoryChanges(txs, 'USD', 40, NOW)

    // September would read as a big drop in card spending; it isn't compared.
    expect(result.kind === 'ok' && result.reference).toBe('2026-08')
  })

  it('does not count months before an account was imported as zero spend', () => {
    // Card has Jun–Sep; the bank was only imported for Sep.
    const bank = { source: 'bank_account' as const }
    const txs = [
      ...fullMonths(['2026-06', '2026-07', '2026-08', '2026-09'], (m) => [
        tx(`${m}-10`, 'restaurants', 100),
      ]),
      tx('2026-09-01', 'housing', 900, bank),
      tx('2026-09-29', 'housing', 1, bank),
    ]
    const result = categoryChanges(txs, 'USD', 40, NOW)

    // Rent would otherwise look "nuevo" against empty baseline months.
    expect(result.kind).toBe('insufficient')
  })

  it('does not let a dormant account block the comparison', () => {
    // The $U account's last movement was in July; it simply had no activity
    // after that.
    const bank = { source: 'bank_account' as const, currency: 'UYU' as const }
    const txs = [
      ...fullMonths(['2026-06', '2026-07', '2026-08', '2026-09'], (m) => [
        tx(`${m}-10`, 'restaurants', 100),
      ]),
      tx('2026-06-01', 'housing', 40, bank),
      tx('2026-07-29', 'housing', 40, bank),
    ]
    const result = categoryChanges(txs, 'USD', 40, NOW)

    expect(result.kind === 'ok' && result.reference).toBe('2026-09')
  })

  it('needs at least two complete months before the reference', () => {
    const txs = fullMonths(['2026-08', '2026-09'], (m) => [
      tx(`${m}-10`, 'restaurants', 100),
    ])
    expect(categoryChanges(txs, 'USD', 40, NOW).kind).toBe('insufficient')
  })

  it('uses the median, so one large purchase does not dominate', () => {
    const txs = fullMonths(
      ['2026-06', '2026-07', '2026-08', '2026-09'],
      (m) => [tx(`${m}-10`, 'travel', m === '2026-07' ? 2000 : 0.5)]
    )
    const result = categoryChanges(txs, 'USD', 40, NOW)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    // Median baseline ≈ 0.5, Sep ≈ 0.5: no "Bajaste en viajes −US$ 666".
    expect(result.decrease).toBeUndefined()
  })

  it('ignores changes below the noise floor and avoids huge % on tiny baselines', () => {
    const txs = fullMonths(
      ['2026-06', '2026-07', '2026-08', '2026-09'],
      (m) => [
        tx(`${m}-10`, 'software', m === '2026-09' ? 9 : 4),
        tx(`${m}-11`, 'shopping', m === '2026-09' ? 300 : 1),
      ]
    )
    const result = categoryChanges(txs, 'USD', 40, NOW)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.increases.map((r) => r.category)).toEqual(['shopping'])
    expect(result.increases[0].pct).toBeNull()
  })

  it('converts to the home currency and leaves excluded rows out', () => {
    const txs = fullMonths(
      ['2026-06', '2026-07', '2026-08', '2026-09'],
      (m) => [
        tx(`${m}-10`, 'groceries', m === '2026-09' ? 8000 : 4000, {
          currency: 'UYU',
        }),
        tx(`${m}-12`, 'internal_transfer', 99999),
        tx(`${m}-13`, 'groceries', 99999, { isSplitParent: true }),
      ]
    )
    const result = categoryChanges(txs, 'USD', 40, NOW)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.increases).toEqual([
      expect.objectContaining({
        category: 'groceries',
        current: 200,
        median: 100,
        delta: 100,
      }),
    ])
  })
})

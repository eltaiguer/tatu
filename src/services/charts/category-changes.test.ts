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
    // The $U account's last movement was in early April — months before the
    // compared ones, so it is quiet, not waiting for an import.
    const bank = { source: 'bank_account' as const, currency: 'UYU' as const }
    const txs = [
      ...fullMonths(['2026-06', '2026-07', '2026-08', '2026-09'], (m) => [
        tx(`${m}-10`, 'restaurants', 100),
      ]),
      tx('2026-03-01', 'housing', 40, bank),
      tx('2026-04-10', 'housing', 40, bank),
    ]
    const result = categoryChanges(txs, 'USD', 40, NOW)

    expect(result.kind === 'ok' && result.reference).toBe('2026-09')
  })

  it('waits for a statement that is not imported yet instead of reading a drop', () => {
    // Bank through Sep 30; the latest card statement ends Aug 20.
    const bank = { source: 'bank_account' as const }
    const txs = [
      ...fullMonths(['2026-05', '2026-06', '2026-07'], (m) => [
        tx(`${m}-10`, 'restaurants', 300),
      ]),
      tx('2026-08-02', 'restaurants', 300),
      tx('2026-08-20', 'fees', 0.01),
      ...['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].flatMap(
        (m) => [
          tx(`${m}-01`, 'housing', 500, bank),
          tx(`${m}-29`, 'housing', 1, bank),
        ]
      ),
    ]
    const result = categoryChanges(txs, 'USD', 40, NOW)

    // Neither September (card missing) nor August (card partial).
    expect(result.kind === 'ok' && result.reference).toBe('2026-07')
    expect(
      result.kind === 'ok' && result.decrease?.category === 'restaurants'
    ).toBe(false)
  })

  it('keeps the baseline contiguous so its range link opens only those months', () => {
    // The $U account stops mid-July, so July is incomplete: the baseline
    // before September can only be August, not [June, August].
    const uyu = { source: 'bank_account' as const, currency: 'UYU' as const }
    const txs = [
      ...fullMonths(['2026-06', '2026-07', '2026-08', '2026-09'], (m) => [
        tx(`${m}-10`, 'restaurants', 100),
      ]),
      tx('2026-06-01', 'housing', 40, uyu),
      tx('2026-07-15', 'housing', 40, uyu),
    ]
    const result = categoryChanges(txs, 'USD', 40, NOW)

    expect(result.kind).toBe('insufficient')
  })

  it('reads a quiet month right after a row as missing; longer silences as dormant (#293)', () => {
    // A USD account with movements only in early May and mid-September,
    // next to a card with every month imported.
    const usd = { source: 'bank_account' as const, currency: 'USD' as const }
    const txs = [
      ...fullMonths(
        ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'],
        (m) => [tx(`${m}-10`, 'restaurants', m === '2026-08' ? 600 : 300)]
      ),
      tx('2026-05-02', 'housing', 50, usd),
      tx('2026-09-10', 'housing', 50, usd),
    ]
    const result = categoryChanges(txs, 'USD', 40, NOW)

    // c78b8bf favoured sparse accounts (any month between first and last was
    // covered); the owner chose the hybrid rule on #293. June is within 45
    // days of May 2, so USD is missing it. July and August are dormant.
    // September is USD's last, partial month.
    expect(result).toEqual({
      kind: 'insufficient',
      reference: '2026-08',
      completeInARow: 2,
      gap: { month: '2026-06', accounts: ['bank_account_usd'] },
    })
  })

  it("still compares when a sparse account's silence passes 45 days (#293)", () => {
    // Same card; USD rows on Mar 10 and Sep 10 only: dormant from May on.
    const usd = { source: 'bank_account' as const, currency: 'USD' as const }
    const txs = [
      ...fullMonths(
        ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'],
        (m) => [tx(`${m}-10`, 'restaurants', m === '2026-08' ? 600 : 300)]
      ),
      tx('2026-03-10', 'housing', 50, usd),
      tx('2026-09-10', 'housing', 50, usd),
    ]
    const result = categoryChanges(txs, 'USD', 40, NOW)

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.reference).toBe('2026-08')
    expect(result.baseline).toEqual(['2026-05', '2026-06', '2026-07'])
  })

  it('leaves a month whose statement was skipped incomplete (#293)', () => {
    // Card statements for Jun, Jul and Sep imported; August skipped. August
    // has no rows and Jul 28 is within 45 days, so it is missing. Nobody
    // covers August, but it lies between the first and last month with data,
    // so the gap names the card.
    const txs = fullMonths(['2026-06', '2026-07', '2026-09'], (m) => [
      tx(`${m}-10`, 'restaurants', 300),
    ])

    expect(categoryChanges(txs, 'USD', 40, NOW)).toEqual({
      kind: 'insufficient',
      reference: '2026-09',
      completeInARow: 1,
      gap: { month: '2026-08', accounts: ['credit_card'] },
    })
  })

  it('names the only account when its statement was skipped mid-history (#293)', () => {
    const txs = fullMonths(['2026-06', '2026-07', '2026-09'], () => [])

    expect(categoryChanges(txs, 'USD', 40, NOW)).toEqual({
      kind: 'insufficient',
      reference: '2026-09',
      completeInARow: 1,
      gap: { month: '2026-08', accounts: ['credit_card'] },
    })
  })

  it('does not name the months after the last data as a gap (#293)', () => {
    const txs = fullMonths(['2026-08', '2026-09'], () => [])

    expect(categoryChanges(txs, 'USD', 40, NOW)).toEqual({
      kind: 'insufficient',
      reference: '2026-09',
      completeInARow: 2,
    })
  })

  it('names the account whose statement was skipped (#293)', () => {
    const usd = { source: 'bank_account' as const, currency: 'USD' as const }
    const txs = [
      ...fullMonths(['2026-06', '2026-07', '2026-08', '2026-09'], () => []),
      ...['2026-07', '2026-09'].flatMap((m) => [
        tx(`${m}-01`, 'fees', 0.01, usd),
        tx(`${m}-28`, 'fees', 0.01, usd),
      ]),
    ]

    expect(categoryChanges(txs, 'USD', 40, NOW)).toEqual({
      kind: 'insufficient',
      reference: '2026-09',
      completeInARow: 1,
      gap: { month: '2026-08', accounts: ['bank_account_usd'] },
    })
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
    // Median baseline ≈ 0.5, Sep ≈ 0.5: no −US$ 666 decrease for viajes.
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

  it('takes which months are complete from the coverage rows, not the ones compared', () => {
    const all = fullMonths(
      ['2026-06', '2026-07', '2026-08', '2026-09'],
      (m) => [tx(`${m}-10`, 'groceries', 100)]
    )
    // Only the groceries rows (no fees on the 1st / 28th): alone, June would
    // be the account's first month and start on the 10th, so be partial.
    const shown = all.filter((t) => t.category === 'groceries')
    const alone = categoryChanges(shown, 'USD', 40, NOW)
    const covered = categoryChanges(shown, 'USD', 40, NOW, all)

    expect(alone.kind).not.toBe(covered.kind)
    expect(covered.kind).toBe('ok')
  })

  describe('when it cannot compare yet', () => {
    const bank = { source: 'bank_account' as const }
    const uyuBank = {
      source: 'bank_account' as const,
      currency: 'UYU' as const,
    }
    const ids = (days: string[], o: Partial<Transaction> = bank) =>
      days.map((d) => tx(d, 'fees', 0.01, o))

    it('counts the complete months in a row', () => {
      const txs = fullMonths(['2026-08', '2026-09'], () => [])
      expect(categoryChanges(txs, 'USD', 40, NOW)).toEqual({
        kind: 'insufficient',
        reference: '2026-09',
        completeInARow: 2,
      })
    })

    it('reports zero complete months and no gap when nobody covers the month', () => {
      const txs = [tx('2026-09-10', 'restaurants', 100)]
      expect(categoryChanges(txs, 'USD', 40, NOW)).toEqual({
        kind: 'insufficient',
        completeInARow: 0,
      })
    })

    it('names the account missing just before the run', () => {
      const txs = [
        ...fullMonths(['2026-06', '2026-07', '2026-08', '2026-09'], () => []),
        ...ids(['2026-09-01', '2026-09-29']),
      ]
      expect(categoryChanges(txs, 'USD', 40, NOW)).toMatchObject({
        completeInARow: 1,
        gap: { month: '2026-08', accounts: ['bank_account_usd'] },
      })
    })

    it('prefers the month after the run', () => {
      const txs = [
        ...fullMonths(['2026-06', '2026-07', '2026-08', '2026-09'], () => []),
        ...ids(['2026-07-01', '2026-08-29']),
      ]
      expect(categoryChanges(txs, 'USD', 40, NOW)).toMatchObject({
        completeInARow: 2,
        gap: { month: '2026-09', accounts: ['bank_account_usd'] },
      })
    })

    it('has no gap when every account stops in the same month', () => {
      const txs = [
        ...fullMonths(['2026-08'], () => []),
        tx('2026-09-15', 'fees', 0.01),
      ]
      const result = categoryChanges(txs, 'USD', 40, NOW)
      expect(result).toMatchObject({ completeInARow: 1 })
      expect(result).not.toHaveProperty('gap')
    })

    it('lists every missing account in account order', () => {
      const txs = [
        ...fullMonths(['2026-06', '2026-07', '2026-08', '2026-09'], () => []),
        ...ids(['2026-09-01', '2026-09-29']),
        ...ids(['2026-09-01', '2026-09-29'], uyuBank),
      ]
      expect(categoryChanges(txs, 'USD', 40, NOW)).toMatchObject({
        gap: {
          month: '2026-08',
          accounts: ['bank_account_usd', 'bank_account_uyu'],
        },
      })
    })

    it('never names a month the account already has rows in', () => {
      const txs = [
        ...fullMonths(['2026-07', '2026-08', '2026-09'], () => []),
        ...ids(['2026-09-04', '2026-09-29']),
      ]
      expect(categoryChanges(txs, 'USD', 40, NOW)).toEqual({
        kind: 'insufficient',
        completeInARow: 0,
        gap: { month: '2026-08', accounts: ['bank_account_usd'] },
      })
    })

    it('shows no gap when only partial months are missing', () => {
      const txs = [
        ...fullMonths(['2026-09'], () => []),
        ...ids(['2026-09-04', '2026-09-29']),
      ]
      expect(categoryChanges(txs, 'USD', 40, NOW)).toEqual({
        kind: 'insufficient',
        completeInARow: 0,
      })
    })
  })
})

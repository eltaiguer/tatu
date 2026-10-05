import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import { findPossibleDuplicates } from './duplicate-review'

// The same bank row, as an overlapping export stored it again before #57.
function row(
  id: string,
  importId: string | undefined,
  createdAt: string | undefined,
  overrides: Partial<Transaction> = {}
): Transaction {
  return {
    id,
    date: new Date('2026-03-15T03:00:00Z'),
    description: 'COMPRA CON TARJETA DEBITO DISCO',
    amount: 1200,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    rawData: { fecha: '15/03/2026' },
    importId,
    createdAt: createdAt ? new Date(createdAt) : undefined,
    ...overrides,
  }
}

const ids = (rows: Transaction[]) => rows.map((tx) => tx.id)

describe('findPossibleDuplicates', () => {
  it('finds nothing in an empty history', () => {
    expect(findPossibleDuplicates([])).toEqual({
      flagged: [],
      unknownOrigin: [],
    })
  })

  it('flags the same row stored by two import runs and pre-selects the newer copy', () => {
    const scan = findPossibleDuplicates([
      row('newer', 'run-b', '2026-04-02T10:00:00Z'),
      row('older', 'run-a', '2026-03-20T10:00:00Z'),
    ])

    expect(scan.flagged).toHaveLength(1)
    expect(ids(scan.flagged[0].rows)).toEqual(['older', 'newer'])
    expect(scan.flagged[0].preselected).toEqual(['newer'])
    expect(scan.unknownOrigin).toEqual([])
  })

  it('never flags identical rows that one import run stored (a genuine pair)', () => {
    const scan = findPossibleDuplicates([
      row('a1', 'run-a', '2026-03-20T10:00:00Z'),
      row('a2', 'run-a', '2026-03-20T10:00:00Z'),
    ])

    expect(scan).toEqual({ flagged: [], unknownOrigin: [] })
  })

  it('keeps as many copies as one run held: a genuine pair re-imported loses only the re-import', () => {
    const pairPlusOne = findPossibleDuplicates([
      row('a1', 'run-a', '2026-03-20T10:00:00Z'),
      row('a2', 'run-a', '2026-03-20T10:00:01Z'),
      row('b1', 'run-b', '2026-04-02T10:00:00Z'),
    ])
    const pairTwice = findPossibleDuplicates([
      row('a1', 'run-a', '2026-03-20T10:00:00Z'),
      row('a2', 'run-a', '2026-03-20T10:00:01Z'),
      row('b1', 'run-b', '2026-04-02T10:00:00Z'),
      row('b2', 'run-b', '2026-04-02T10:00:01Z'),
    ])

    expect(pairPlusOne.flagged[0].preselected).toEqual(['b1'])
    expect(pairTwice.flagged[0].preselected).toEqual(['b1', 'b2'])
  })

  it('puts groups with a row of unknown origin in their own section, nothing pre-selected', () => {
    const scan = findPossibleDuplicates([
      row('legacy', undefined, '2025-10-01T10:00:00Z'),
      row('recent', 'run-b', '2026-04-02T10:00:00Z'),
      row('x1', undefined, undefined, { description: 'FARMACIA' }),
      row('x2', undefined, undefined, { description: 'FARMACIA' }),
    ])

    expect(scan.flagged).toEqual([])
    expect(scan.unknownOrigin).toHaveLength(2)
    expect(scan.unknownOrigin.map((g) => g.preselected)).toEqual([[], []])
    expect(scan.unknownOrigin.flatMap((g) => ids(g.rows)).sort()).toEqual([
      'legacy',
      'recent',
      'x1',
      'x2',
    ])
  })

  it('groups by the import fingerprint: a different amount, day or account is another row', () => {
    const scan = findPossibleDuplicates([
      row('a', 'run-a', '2026-03-20T10:00:00Z'),
      row('amount', 'run-b', '2026-04-02T10:00:00Z', { amount: 1300 }),
      row('day', 'run-b', '2026-04-02T10:00:00Z', {
        rawData: { fecha: '16/03/2026' },
      }),
      row('card', 'run-b', '2026-04-02T10:00:00Z', { source: 'credit_card' }),
      // Same row, padded the way credit card cells are: still the same.
      row('padded', 'run-c', '2026-04-03T10:00:00Z', {
        description: '  COMPRA CON  TARJETA DEBITO DISCO ',
      }),
    ])

    expect(scan.flagged).toHaveLength(1)
    expect(ids(scan.flagged[0].rows)).toEqual(['a', 'padded'])
  })

  it('leaves split rows out: parts are not bank rows, and deleting a parent cannot be undone', () => {
    const scan = findPossibleDuplicates([
      row('parent', 'run-a', '2026-03-20T10:00:00Z', { isSplitParent: true }),
      row('part', undefined, '2026-03-21T10:00:00Z', {
        splitParentId: 'parent',
      }),
      row('copy', 'run-b', '2026-04-02T10:00:00Z'),
    ])

    expect(scan).toEqual({ flagged: [], unknownOrigin: [] })
  })

  it('orders copies by when they were stored; one without a stored time counts as newest', () => {
    const scan = findPossibleDuplicates([
      row('this-session', 'run-c', undefined),
      row('b', 'run-b', '2026-04-02T10:00:00Z'),
      row('a', 'run-a', '2026-03-20T10:00:00Z'),
    ])

    expect(ids(scan.flagged[0].rows)).toEqual(['a', 'b', 'this-session'])
    expect(scan.flagged[0].preselected).toEqual(['b', 'this-session'])
  })

  it('lists the most recent movements first', () => {
    const scan = findPossibleDuplicates([
      row('old-a', 'run-a', '2026-01-02T10:00:00Z', {
        rawData: { fecha: '01/01/2026' },
        date: new Date('2026-01-01T03:00:00Z'),
      }),
      row('old-b', 'run-b', '2026-04-02T10:00:00Z', {
        rawData: { fecha: '01/01/2026' },
        date: new Date('2026-01-01T03:00:00Z'),
      }),
      row('new-a', 'run-a', '2026-03-20T10:00:00Z'),
      row('new-b', 'run-b', '2026-04-02T10:00:00Z'),
    ])

    expect(scan.flagged.map((g) => g.rows[0].id)).toEqual(['new-a', 'old-a'])
  })
})

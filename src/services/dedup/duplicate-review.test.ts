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
    rawData: { fecha: '15/03/2026', referencia: '531814119796' },
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
      review: [],
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
    expect(scan.review).toEqual([])
  })

  it('never flags identical rows that one import run stored (a genuine pair)', () => {
    const scan = findPossibleDuplicates([
      row('a1', 'run-a', '2026-03-20T10:00:00Z'),
      row('a2', 'run-a', '2026-03-20T10:00:00Z'),
    ])

    expect(scan).toEqual({ flagged: [], unknownOrigin: [], review: [] })
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
        rawData: { fecha: '16/03/2026', referencia: '531814119796' },
      }),
      row('card', 'run-b', '2026-04-02T10:00:00Z', {
        source: 'credit_card',
        rawData: {
          fecha: '15/03/2026',
          numeroTarjeta: 'XXXXX-4362',
          numeroAutorizacion: '770025140510',
        },
      }),
      // Same row, padded the way credit card cells are: still the same.
      row('padded', 'run-c', '2026-04-03T10:00:00Z', {
        description: '  COMPRA CON  TARJETA DEBITO DISCO ',
      }),
    ])

    expect(scan.flagged).toHaveLength(1)
    expect(ids(scan.flagged[0].rows)).toEqual(['a', 'padded'])
  })

  it('never offers split parts, which are not bank rows', () => {
    const scan = findPossibleDuplicates([
      row('part-1', undefined, '2026-03-21T10:00:00Z', {
        splitParentId: 'parent',
      }),
      row('part-2', 'run-b', '2026-04-02T10:00:00Z', {
        splitParentId: 'other-parent',
      }),
    ])

    expect(scan).toEqual({ flagged: [], unknownOrigin: [], review: [] })
  })

  it('leaves a group with a split copy to review by hand, nothing pre-selected', () => {
    const scan = findPossibleDuplicates([
      row('parent', 'run-a', '2026-03-20T10:00:00Z', { isSplitParent: true }),
      row('copy-1', 'run-b', '2026-04-02T10:00:00Z'),
      row('copy-2', 'run-c', '2026-05-02T10:00:00Z'),
    ])

    expect(scan.flagged).toEqual([])
    expect(scan.review).toHaveLength(1)
    expect(scan.review[0]).toMatchObject({ reason: 'split', preselected: [] })
    expect(ids(scan.review[0].rows)).toEqual(['parent', 'copy-1', 'copy-2'])
  })

  it('tells two cards apart: same day, place and amount on another card is another charge', () => {
    const card = (
      id: string,
      importId: string,
      numeroTarjeta: string,
      numeroAutorizacion = '770025140510'
    ) =>
      row(id, importId, `2026-0${importId === 'run-a' ? 3 : 4}-20T10:00:00Z`, {
        source: 'credit_card',
        description: 'Devoto Supermercado',
        rawData: { fecha: '15/03/2026', numeroTarjeta, numeroAutorizacion },
      })

    const twoCards = findPossibleDuplicates([
      card('visa', 'run-a', 'XXXXX-4362'),
      card('master', 'run-b', 'XXXXX-9172'),
    ])
    const twoAuthorizations = findPossibleDuplicates([
      card('first', 'run-a', 'XXXXX-4362', '111'),
      card('second', 'run-b', 'XXXXX-4362', '222'),
    ])
    const sameCharge = findPossibleDuplicates([
      card('first', 'run-a', 'XXXXX-4362'),
      card('again', 'run-b', 'XXXXX-4362'),
    ])

    expect(twoCards).toEqual({ flagged: [], unknownOrigin: [], review: [] })
    expect(twoAuthorizations).toEqual({
      flagged: [],
      unknownOrigin: [],
      review: [],
    })
    expect(sameCharge.flagged[0].preselected).toEqual(['again'])
  })

  it('tells bank movements apart by their reference', () => {
    const scan = findPossibleDuplicates([
      row('a', 'run-a', '2026-03-20T10:00:00Z'),
      row('other-ref', 'run-b', '2026-04-02T10:00:00Z', {
        rawData: { fecha: '15/03/2026', referencia: '999999999999' },
      }),
    ])

    expect(scan).toEqual({ flagged: [], unknownOrigin: [], review: [] })
  })

  it('leaves a group to review by hand when a copy has no reference to compare', () => {
    const scan = findPossibleDuplicates([
      row('a', 'run-a', '2026-03-20T10:00:00Z'),
      row('no-ref', 'run-b', '2026-04-02T10:00:00Z', {
        rawData: { fecha: '15/03/2026' },
      }),
    ])

    expect(scan.flagged).toEqual([])
    expect(scan.review).toEqual([
      expect.objectContaining({ reason: 'no_reference', preselected: [] }),
    ])
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
        rawData: { fecha: '01/01/2026', referencia: '1' },
        date: new Date('2026-01-01T03:00:00Z'),
      }),
      row('old-b', 'run-b', '2026-04-02T10:00:00Z', {
        rawData: { fecha: '01/01/2026', referencia: '1' },
        date: new Date('2026-01-01T03:00:00Z'),
      }),
      row('new-a', 'run-a', '2026-03-20T10:00:00Z'),
      row('new-b', 'run-b', '2026-04-02T10:00:00Z'),
    ])

    expect(scan.flagged.map((g) => g.rows[0].id)).toEqual(['new-a', 'old-a'])
  })
})

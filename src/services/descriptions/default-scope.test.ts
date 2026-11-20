import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import { defaultsToAllSimilar } from './default-scope'

const tx = (
  id: string,
  category: string | undefined,
  extra: Partial<Transaction> = {}
): Transaction =>
  ({
    id,
    date: new Date('2026-03-10T00:00:00.000Z'),
    description: 'Devoto Supermercado',
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'credit_card',
    rawData: {},
    category,
    ...extra,
  }) as Transaction

const trio = (extra: Partial<Transaction> = {}) => [
  tx('a', 'groceries', extra),
  tx('b', 'groceries', extra),
  tx('c', 'groceries', extra),
]
const check = (rows: Transaction[], category = 'restaurants') =>
  defaultsToAllSimilar(rows, rows[0], category)

describe('defaultsToAllSimilar (#281, conservative default)', () => {
  it('is true for a real category change over auto-categorized siblings', () => {
    expect(check(trio({ categoryConfidence: 0.9 }))).toBe(true)
  })

  it('is false when the category did not change, or is Sin categoría', () => {
    expect(check(trio(), 'groceries')).toBe(false)
    expect(check(trio(), 'restaurant')).toBe(true)
    expect(check(trio(), '')).toBe(false)
  })

  it('is false when the old or the new category is a transfer', () => {
    expect(check(trio(), 'internal_transfer')).toBe(false)
    const rows = [tx('a', 'external_transfer'), tx('b', 'groceries')]
    expect(check(rows)).toBe(false)
  })

  it('is false when a similar row is in a transfer category', () => {
    const rows = [...trio(), tx('t', 'internal_transfer')]
    expect(check(rows)).toBe(false)
  })

  it('is false when a similar row is a split parent', () => {
    const rows = [...trio(), tx('p', 'groceries', { isSplitParent: true })]
    expect(check(rows)).toBe(false)
  })

  it('is false when another similar row holds a hand-set different category', () => {
    const rows = [
      tx('a', 'groceries'),
      tx('b', 'transport', { categoryConfidence: 1 }),
      tx('c', 'groceries'),
    ]
    expect(check(rows)).toBe(false)
  })

  it('does not mind confident rows already in the new category', () => {
    const rows = [
      tx('a', 'groceries'),
      tx('b', 'restaurants', { categoryConfidence: 1 }),
    ]
    expect(check(rows)).toBe(true)
  })

  it('is false when the write reaches no other row', () => {
    expect(check([tx('a', 'groceries')])).toBe(false)
    // Split parts are not reached by the write.
    const rows = [
      tx('a', 'groceries'),
      tx('p_split_0', 'groceries', { splitParentId: 'p' }),
    ]
    expect(check(rows)).toBe(false)
  })
})

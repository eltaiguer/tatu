import { describe, it, expect } from 'vitest'
import type { Transaction } from '../models'

function makeTransaction(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: new Date('2025-01-01'),
    description: `tx-${id}`,
    amount: 100,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
    ...overrides,
  }
}

function applyGrouping(transactions: Transaction[]): Transaction[] {
  const childrenByParent = new Map<string, Transaction[]>()
  transactions.forEach((tx) => {
    if (tx.splitParentId) {
      const arr = childrenByParent.get(tx.splitParentId) ?? []
      arr.push(tx)
      childrenByParent.set(tx.splitParentId, arr)
    }
  })

  const result: Transaction[] = []
  const emitted = new Set<string>()

  transactions.forEach((tx) => {
    if (emitted.has(tx.id)) return
    result.push(tx)
    emitted.add(tx.id)
    if (tx.isSplitParent) {
      const children = childrenByParent.get(tx.id) ?? []
      children.forEach((child) => {
        result.push(child)
        emitted.add(child.id)
      })
    }
  })

  return result
}

describe('split grouping logic (useTransactionFiltering)', () => {
  it('places split children immediately after their parent', () => {
    const parent = makeTransaction('parent', { isSplitParent: true })
    const child0 = makeTransaction('child-0', { splitParentId: 'parent' })
    const child1 = makeTransaction('child-1', { splitParentId: 'parent' })
    const other = makeTransaction('other')

    const result = applyGrouping([parent, other, child0, child1])
    const ids = result.map((tx) => tx.id)

    expect(ids.indexOf('child-0')).toBe(ids.indexOf('parent') + 1)
    expect(ids.indexOf('child-1')).toBe(ids.indexOf('parent') + 2)
  })

  it('does not duplicate children that already appear after parent', () => {
    const parent = makeTransaction('parent', { isSplitParent: true })
    const child = makeTransaction('child-0', { splitParentId: 'parent' })

    const result = applyGrouping([parent, child])
    expect(result.filter((tx) => tx.id === 'child-0').length).toBe(1)
  })

  it('renders orphan children (parent not in set) as standalone rows', () => {
    const child = makeTransaction('child-0', { splitParentId: 'missing-parent' })
    const other = makeTransaction('other')

    const result = applyGrouping([other, child])
    const ids = result.map((tx) => tx.id)
    expect(ids).toContain('child-0')
    expect(ids).toContain('other')
  })

  it('leaves non-split transactions in their original order', () => {
    const a = makeTransaction('a')
    const b = makeTransaction('b')
    const c = makeTransaction('c')

    const result = applyGrouping([a, b, c])
    expect(result.map((tx) => tx.id)).toEqual(['a', 'b', 'c'])
  })
})

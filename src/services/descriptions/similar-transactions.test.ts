import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import { findSimilarTransactions } from './similar-transactions'

const tx = (id: string, description: string): Transaction => ({
  id,
  date: new Date('2026-09-01T00:00:00.000Z'),
  description,
  amount: 1,
  currency: 'UYU',
  type: 'debit',
  source: 'credit_card',
  rawData: {},
})

describe('findSimilarTransactions', () => {
  it('matches rows sharing the normalized merchant description', () => {
    const all = [
      tx('a', 'CANTINA 25'),
      tx('b', 'Cantina 25'),
      tx('c', 'Devoto'),
    ]
    expect(findSimilarTransactions(all, all[0]).map((t) => t.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('matches only the target itself when its description has no key', () => {
    const all = [tx('a', '   '), tx('b', '  ')]
    expect(findSimilarTransactions(all, all[0]).map((t) => t.id)).toEqual(['a'])
  })

  it('never pulls split parents or parts into an apply-to-similar edit', () => {
    const all = [
      tx('a', 'CANTINA 25'),
      { ...tx('p', 'CANTINA 25'), isSplitParent: true },
      { ...tx('p_split_0', 'CANTINA 25'), splitParentId: 'p' },
      { ...tx('p_split_1', 'CANTINA 25'), splitParentId: 'p' },
    ]
    expect(findSimilarTransactions(all, all[0]).map((t) => t.id)).toEqual(['a'])
    // Editing a part itself still includes that part.
    expect(findSimilarTransactions(all, all[2]).map((t) => t.id)).toEqual([
      'a',
      'p_split_0',
    ])
  })
})

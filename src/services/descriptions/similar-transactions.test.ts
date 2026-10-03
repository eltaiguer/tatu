import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import {
  countSimilarEditReach,
  findSimilarTransactions,
} from './similar-transactions'

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

  it('writes the split parent but never its parts', () => {
    const all = [
      tx('a', 'CANTINA 25'),
      { ...tx('p', 'CANTINA 25'), isSplitParent: true },
      { ...tx('p_split_0', 'CANTINA 25'), splitParentId: 'p' },
      {
        ...tx('p_split_1', 'CANTINA 25'),
        splitParentId: 'p',
        displayDescription: 'Propina',
      },
    ]
    expect(findSimilarTransactions(all, all[0]).map((t) => t.id)).toEqual([
      'a',
      'p',
    ])
    // Editing a part itself still includes that part.
    expect(findSimilarTransactions(all, all[2]).map((t) => t.id)).toEqual([
      'a',
      'p',
      'p_split_0',
    ])

    // A rename also shows on the part without a name of its own.
    expect(countSimilarEditReach(all, all[0], false)).toBe(2)
    expect(countSimilarEditReach(all, all[0], true)).toBe(3)
  })
})

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
})

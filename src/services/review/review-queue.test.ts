import { describe, expect, it } from 'vitest'
import { Category, type Transaction } from '../../models'
import { buildReviewQueue, reviewSuggestion, toHome } from './review-queue'

function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: new Date('2026-03-10T00:00:00.000Z'),
    description: id,
    amount: 10,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    category: Category.Uncategorized,
    categoryConfidence: 0,
    rawData: {},
    ...overrides,
  } as Transaction
}

describe('toHome', () => {
  it('converts with the one converter', () => {
    expect(toHome(tx('a', { amount: 50 }), 'UYU', 40)).toBe(2000)
    expect(toHome(tx('a', { amount: 4000, currency: 'UYU' }), 'USD', 40)).toBe(
      100
    )
    expect(toHome(tx('a', { amount: 7 }), 'USD', 40)).toBe(7)
  })
})

describe('buildReviewQueue', () => {
  const rows = [
    tx('usd10', { amount: 10 }),
    tx('uyu4000', { amount: 4000, currency: 'UYU' }),
    tx('usd50', { amount: 50 }),
    tx('credit10', { amount: 400, currency: 'UYU', type: 'credit' }),
  ]

  it('puts the biggest converted amount first (home USD)', () => {
    expect(buildReviewQueue(rows, 'USD', 40)).toEqual([
      'uyu4000',
      'usd50',
      'credit10',
      'usd10',
    ])
  })

  it('keeps the same order in home UYU', () => {
    expect(buildReviewQueue(rows, 'UYU', 40)).toEqual([
      'uyu4000',
      'usd50',
      'credit10',
      'usd10',
    ])
  })

  it('breaks ties by date descending, then id', () => {
    const tied = [
      tx('b', { date: new Date('2026-03-01T00:00:00.000Z') }),
      tx('z', { date: new Date('2026-03-05T00:00:00.000Z') }),
      tx('a', { date: new Date('2026-03-05T00:00:00.000Z') }),
    ]
    expect(buildReviewQueue(tied, 'USD', 40)).toEqual(['a', 'z', 'b'])
  })
})

describe('reviewSuggestion', () => {
  const sibling = (id: string, o: Partial<Transaction>) =>
    tx(id, { description: 'DEVOTO', ...o })

  it('suggests the row’s own low-confidence category', () => {
    const row = tx('r', { category: 'groceries', categoryConfidence: 0.4 })
    expect(reviewSuggestion(row, [row])).toBe('groceries')
  })

  it('votes with confident similar rows; rows needing review do not vote', () => {
    const row = sibling('r', {})
    const all = [
      row,
      sibling('a', { category: 'restaurants', categoryConfidence: 1 }),
      sibling('b', { category: 'restaurants', categoryConfidence: 1 }),
      sibling('c', { category: 'shopping', categoryConfidence: 0.3 }),
    ]
    expect(reviewSuggestion(row, all)).toBe('restaurants')
  })

  it('lets a legacy sibling with no confidence vote', () => {
    const row = sibling('r', {})
    const legacy = sibling('a', {
      category: 'groceries',
      categoryConfidence: undefined,
    })
    expect(reviewSuggestion(row, [row, legacy])).toBe('groceries')
  })

  it('ignores split parents and transfers', () => {
    const row = sibling('r', {})
    const parent = sibling('p', {
      category: 'groceries',
      categoryConfidence: 1,
      isSplitParent: true,
    })
    const transfer = sibling('t', {
      category: 'internal_transfer',
      categoryConfidence: 1,
    })
    expect(reviewSuggestion(row, [row, parent, transfer])).toBeNull()
  })

  it('breaks a tie by category id ascending', () => {
    const row = sibling('r', {})
    const all = [
      row,
      sibling('a', { category: 'restaurants', categoryConfidence: 1 }),
      sibling('b', { category: 'groceries', categoryConfidence: 1 }),
    ]
    expect(reviewSuggestion(row, all)).toBe('groceries')
  })

  it('is null with only uncategorized siblings or no key', () => {
    const row = sibling('r', {})
    expect(reviewSuggestion(row, [row, sibling('a', {})])).toBeNull()
    const keyless = tx('k', { description: '' })
    expect(reviewSuggestion(keyless, [keyless])).toBeNull()
  })
})

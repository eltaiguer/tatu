import { describe, expect, it } from 'vitest'
import type { Transaction } from '../models'
import { needsCategoryReview } from './transaction-display'

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: 'a',
  date: new Date('2026-03-01T00:00:00.000Z'),
  description: 'X',
  amount: 1,
  currency: 'UYU',
  type: 'debit',
  source: 'credit_card',
  category: 'groceries',
  rawData: {},
  ...overrides,
})

describe('needsCategoryReview', () => {
  it('flags rows with no category, whatever their confidence', () => {
    expect(needsCategoryReview(tx({ category: undefined }))).toBe(true)
    expect(needsCategoryReview(tx({ category: '' }))).toBe(true)
    expect(
      needsCategoryReview(
        tx({ category: 'uncategorized', categoryConfidence: 0 })
      )
    ).toBe(true)
  })

  it('flags low-confidence automatic categories only', () => {
    expect(needsCategoryReview(tx({ categoryConfidence: 0.4 }))).toBe(true)
    expect(needsCategoryReview(tx({ categoryConfidence: 0.7 }))).toBe(false)
    expect(needsCategoryReview(tx({ categoryConfidence: 1 }))).toBe(false)
  })

  it('does not flag legacy rows without a recorded confidence, nor split parents', () => {
    expect(needsCategoryReview(tx({ categoryConfidence: undefined }))).toBe(
      false
    )
    expect(
      needsCategoryReview(tx({ category: undefined, isSplitParent: true }))
    ).toBe(false)
  })
})

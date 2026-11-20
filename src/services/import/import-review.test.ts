import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import { filterToSearch } from '../filters/url-filters'
import { parseFilterParams } from '../filters/url-filters'
import { filterTransactions } from '../filters/transaction-filter'
import { currentHouseholdRules } from '../household/household'
import { countReviewRows, reviewLink } from './import-review'

function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: new Date('2025-03-15T00:00:00.000Z'),
    description: `TX ${id}`,
    amount: 100,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    category: 'uncategorized',
    rawData: {},
    ...overrides,
  }
}

const range = (from: string, to: string) => ({ from, to })

describe('reviewLink', () => {
  it('is null without files', () => {
    expect(reviewLink([])).toBeNull()
  })

  it('spans the files and scopes a card file to the card', () => {
    expect(
      reviewLink([
        {
          fileType: 'credit_card',
          fileRange: range('2025-03-17', '2025-12-04'),
        },
        {
          fileType: 'credit_card',
          fileRange: range('2025-01-02', '2025-06-01'),
        },
      ])
    ).toEqual({
      review: true,
      reviewMode: true,
      accountType: 'credit_card',
      period: { mode: 'range', from: '2025-01-02', to: '2025-12-04' },
    })
  })

  it('scopes a bank file to its account and currency', () => {
    const period = { mode: 'range', from: '2025-11-03', to: '2025-11-27' }
    expect(
      reviewLink([
        {
          fileType: 'bank_account_usd',
          fileRange: range('2025-11-03', '2025-11-27'),
        },
      ])
    ).toEqual({
      review: true,
      reviewMode: true,
      accountType: 'bank_account',
      currency: 'USD',
      period,
    })
    expect(
      reviewLink([
        {
          fileType: 'bank_account_uyu',
          fileRange: range('2025-11-03', '2025-11-27'),
        },
      ])
    ).toMatchObject({ accountType: 'bank_account', currency: 'UYU' })
  })

  it('scopes two bank files to the bank account, whatever the currency', () => {
    expect(
      reviewLink([
        {
          fileType: 'bank_account_usd',
          fileRange: range('2025-11-03', '2025-11-27'),
        },
        {
          fileType: 'bank_account_uyu',
          fileRange: range('2025-11-04', '2025-11-30'),
        },
      ])
    ).toEqual({
      review: true,
      reviewMode: true,
      accountType: 'bank_account',
      period: { mode: 'range', from: '2025-11-03', to: '2025-11-30' },
    })
  })

  it('keeps only the period when the files are of different accounts', () => {
    expect(
      reviewLink([
        {
          fileType: 'credit_card',
          fileRange: range('2025-03-17', '2025-12-04'),
        },
        {
          fileType: 'bank_account_usd',
          fileRange: range('2025-11-03', '2025-11-27'),
        },
      ])
    ).toEqual({
      review: true,
      reviewMode: true,
      period: { mode: 'range', from: '2025-03-17', to: '2025-12-04' },
    })
  })
})

describe('countReviewRows', () => {
  const rows = [
    tx('a'),
    tx('b', { categoryConfidence: 0.3, category: 'groceries' }),
    tx('c', { category: 'groceries', categoryConfidence: 0.9 }),
    tx('d', { category: 'internal_transfer', categoryConfidence: 0.3 }),
    tx('e', { date: new Date('2024-01-01T00:00:00.000Z') }),
  ]

  it('counts the rows that need review', () => {
    expect(countReviewRows(rows, { review: true })).toBe(3)
  })

  it('honours the period of the link', () => {
    expect(
      countReviewRows(rows, {
        review: true,
        period: { mode: 'range', from: '2025-01-01', to: '2025-12-31' },
      })
    ).toBe(2)
  })

  it('counts only the given ids', () => {
    expect(countReviewRows(rows, { review: true }, new Set(['a', 'c']))).toBe(1)
  })

  it('counts a review-mode link the same as the table link', () => {
    const period = { mode: 'range', from: '2025-01-01', to: '2025-12-31' }
    expect(
      countReviewRows(rows, { review: true, reviewMode: true, period })
    ).toBe(countReviewRows(rows, { review: true, period }))
  })

  it('equals what the link opens', () => {
    const link = reviewLink([
      {
        fileType: 'bank_account_usd',
        fileRange: range('2025-01-01', '2025-12-31'),
      },
    ])!
    const opened = filterTransactions(
      rows,
      parseFilterParams(filterToSearch(link)),
      { householdRules: currentHouseholdRules() }
    )
    expect(countReviewRows(rows, link)).toBe(opened.length)
  })
})

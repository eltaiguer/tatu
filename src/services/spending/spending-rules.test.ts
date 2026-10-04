import { afterEach, describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import { replaceCustomCategories } from '../categories/category-store'
import {
  countsTowardTotals,
  isCountedExpense,
  isCountedIncome,
  countsAsRow,
  sumCountedTotals,
} from './spending-rules'

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx',
    date: new Date('2026-01-10T00:00:00.000Z'),
    description: 'row',
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    category: 'groceries',
    rawData: {},
    ...overrides,
  }
}

afterEach(() => {
  replaceCustomCategories([])
})

describe('spending rules', () => {
  // [name, row, counts as row, counts toward totals, expense, income]
  const table: [string, Transaction, boolean, boolean, boolean, boolean][] = [
    ['plain debit', tx(), true, true, true, false],
    ['plain credit', tx({ type: 'credit' }), true, true, false, true],
    [
      'uncategorized debit',
      tx({ category: undefined }),
      true,
      true,
      true,
      false,
    ],
    ['split parent', tx({ isSplitParent: true }), false, false, false, false],
    ['split part', tx({ splitParentId: 'parent' }), true, true, true, false],
    [
      'internal transfer (ignored by default)',
      tx({ category: 'internal_transfer' }),
      true,
      false,
      false,
      false,
    ],
    [
      'external transfer credit (ignored by default)',
      tx({ category: 'external_transfer', type: 'credit' }),
      true,
      false,
      false,
      false,
    ],
    [
      'legacy ignored id',
      tx({ category: 'ignored' }),
      true,
      false,
      false,
      false,
    ],
    [
      'split part in an ignored category',
      tx({ splitParentId: 'parent', category: 'internal_transfer' }),
      true,
      false,
      false,
      false,
    ],
  ]

  it.each(table)('%s', (_name, row, movement, counted, expense, income) => {
    expect(countsAsRow(row)).toBe(movement)
    expect(countsTowardTotals(row)).toBe(counted)
    expect(isCountedExpense(row)).toBe(expense)
    expect(isCountedIncome(row)).toBe(income)
  })

  it('follows the user ignoring or un-ignoring a category', () => {
    replaceCustomCategories([
      { id: 'groceries', label: 'Súper', color: '#000', isIgnored: true },
      {
        id: 'internal_transfer',
        label: 'Transferencias',
        color: '#000',
        isIgnored: false,
      },
    ])

    expect(countsTowardTotals(tx({ category: 'groceries' }))).toBe(false)
    expect(countsAsRow(tx({ category: 'groceries' }))).toBe(true)
    expect(countsTowardTotals(tx({ category: 'internal_transfer' }))).toBe(true)
  })

  it('sums counted income and expense in the home currency', () => {
    const rows = [
      tx({ amount: 1000, isSplitParent: true }),
      tx({ amount: 600, splitParentId: 'p' }),
      tx({ amount: 400, splitParentId: 'p' }),
      tx({ amount: 81, type: 'credit' }),
      tx({ amount: 10, currency: 'USD' }),
      tx({ amount: 500, category: 'internal_transfer' }),
      tx({ amount: 700, type: 'credit', category: 'internal_transfer' }),
    ]

    expect(sumCountedTotals(rows, 'UYU', 40.5)).toEqual({
      income: 81,
      expense: 1405,
      net: 81 - 1405,
    })
  })
})

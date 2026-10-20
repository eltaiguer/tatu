import { beforeEach, describe, expect, it } from 'vitest'
import type { Transaction } from '../../../models'
import {
  labelledRows,
  rulePredictions,
  scoreAgreement,
  withoutUserRules,
} from './agreement'
import {
  getMerchantCategoryOverride,
  replaceMerchantCategoryOverrides,
} from '../category-overrides'
import { replaceDescriptionOverrides } from '../../descriptions/description-overrides'
import { listCustomPatterns, replaceCustomPatterns } from '../custom-patterns'

function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: new Date('2026-03-01T00:00:00.000Z'),
    description: id,
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
    ...overrides,
  }
}

beforeEach(() => {
  replaceMerchantCategoryOverrides({})
  replaceDescriptionOverrides({})
  replaceCustomPatterns([])
})

describe('labelledRows', () => {
  it('keeps the rows the user categorized (confidence 1), newest first', () => {
    const rows = labelledRows([
      tx('old', {
        date: new Date('2026-01-01T00:00:00.000Z'),
        category: 'groceries',
        categoryConfidence: 1,
      }),
      tx('ai', { category: 'groceries', categoryConfidence: 0.9 }),
      tx('none', { category: undefined }),
      tx('cleared', { category: 'uncategorized', categoryConfidence: 1 }),
      tx('parent', {
        category: 'shopping',
        categoryConfidence: 1,
        isSplitParent: true,
      }),
      tx('new', {
        date: new Date('2026-03-01T00:00:00.000Z'),
        category: 'food',
        categoryConfidence: 1,
      }),
    ])

    expect(rows.map((r) => r.id)).toEqual(['new', 'old'])
    // Pre-rename ids resolve to the current one
    expect(rows[0].label).toBe('groceries')
  })
})

describe('rulePredictions', () => {
  it('categorizes without the user rules the labels came from, then restores them', () => {
    replaceMerchantCategoryOverrides({
      'kiosco 25': {
        merchantName: 'KIOSCO 25',
        category: 'personal',
        updatedAt: '',
      },
    })
    replaceCustomPatterns([
      {
        id: 'cp',
        pattern: 'netflix',
        matchType: 'contains',
        category: 'shopping',
        createdAt: '',
      },
    ])
    const rows = labelledRows([
      tx('KIOSCO 25', { category: 'personal', categoryConfidence: 1 }),
      tx('NETFLIX.COM', { category: 'entertainment', categoryConfidence: 1 }),
    ])

    const predicted = rulePredictions(rows)

    expect(predicted.get('KIOSCO 25')).toBe('uncategorized')
    expect(predicted.get('NETFLIX.COM')).toBe('entertainment')
    expect(getMerchantCategoryOverride('KIOSCO 25')).toBe('personal')
    expect(listCustomPatterns()).toHaveLength(1)
  })

  it('restores the user rules even when the evaluated function throws', () => {
    replaceCustomPatterns([
      {
        id: 'cp',
        pattern: 'x',
        matchType: 'contains',
        category: 'shopping',
        createdAt: '',
      },
    ])

    expect(() =>
      withoutUserRules(() => {
        expect(listCustomPatterns()).toHaveLength(0)
        throw new Error('boom')
      })
    ).toThrow('boom')
    expect(listCustomPatterns()).toHaveLength(1)
  })
})

describe('scoreAgreement', () => {
  it('counts agreement per label, resolving aliases, and lists mismatches', () => {
    const rows = labelledRows([
      tx('a', { category: 'groceries', categoryConfidence: 1 }),
      tx('b', { category: 'groceries', categoryConfidence: 1 }),
      tx('c', { category: 'personal', categoryConfidence: 1 }),
      tx('d', { category: 'personal', categoryConfidence: 1 }),
    ])

    const report = scoreAgreement(
      rows,
      new Map([
        ['a', 'groceries'],
        ['b', 'food'],
        ['c', 'shopping'],
        // d: no prediction at all
      ])
    )

    expect(report.total).toBe(4)
    expect(report.agreed).toBe(2)
    expect(report.agreement).toBe(0.5)
    expect(report.byLabel).toEqual([
      { label: 'groceries', total: 2, agreed: 2 },
      { label: 'personal', total: 2, agreed: 0 },
    ])
    expect(report.mismatches).toEqual([
      { id: 'c', description: 'c', label: 'personal', predicted: 'shopping' },
      {
        id: 'd',
        description: 'd',
        label: 'personal',
        predicted: 'uncategorized',
      },
    ])
  })

  it('reports zero agreement for no rows without dividing by zero', () => {
    expect(scoreAgreement([], new Map()).agreement).toBe(0)
  })
})

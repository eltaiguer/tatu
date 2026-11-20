import { afterEach, describe, expect, it } from 'vitest'
import {
  currentUserRules,
  emptyUserRules,
  hasUserRule,
  isCategorizedByRule,
  rowsRuleWouldChange,
  countRowsEachRuleWouldChange,
} from './user-rules'
import type { Transaction } from '../../models'
import { addCustomPattern, clearAllCustomPatterns } from './custom-patterns'
import {
  clearAllCategoryOverrides,
  setMerchantCategoryOverride,
} from './category-overrides'
import {
  clearAllDescriptionOverrides,
  setDescriptionOverride,
} from '../descriptions/description-overrides'
import { userRules } from '../../test/user-rules'

describe('hasUserRule — does a rule the user wrote cover this row?', () => {
  it('is false with no rules', () => {
    expect(hasUserRule(emptyUserRules(), 'DEVOTO SUPERMERCADO')).toBe(false)
  })

  it('is true for a row with a description override that sets a category', () => {
    const rules = userRules({
      descriptionOverrides: [
        {
          description: 'COMPRA DEVOTO AUT 998877',
          friendlyDescription: 'Devoto',
          category: 'groceries',
        },
      ],
    })

    // Same key once the auth code is stripped
    expect(hasUserRule(rules, 'COMPRA DEVOTO AUT 123456')).toBe(true)
  })

  // The user renamed the row: the AI must not rename it again, even though
  // the categorizer gets no category from this override.
  it('is true for a description override that only renames the row', () => {
    const rules = userRules({
      descriptionOverrides: [
        {
          description: 'KIOSCO 25',
          friendlyDescription: 'Kiosco de la esquina',
        },
      ],
    })

    expect(hasUserRule(rules, 'KIOSCO 25')).toBe(true)
  })

  it('is true for a row whose merchant has an override', () => {
    const rules = userRules({
      merchantOverrides: [
        {
          merchantName: 'COMPRA CON TARJETA DEBITO KIOSCO X 12/03 15:22',
          category: 'personal',
        },
      ],
    })

    expect(
      hasUserRule(rules, 'COMPRA CON TARJETA DEBITO KIOSCO X 01/04 09:10')
    ).toBe(true)
  })

  it('is true for a row a custom pattern matches', () => {
    const rules = userRules({
      customPatterns: [
        { pattern: 'netflix', matchType: 'contains', category: 'shopping' },
      ],
    })

    expect(hasUserRule(rules, 'NETFLIX.COM 866-579-7172')).toBe(true)
    expect(hasUserRule(rules, 'SPOTIFY P12345')).toBe(false)
  })
})

describe('currentUserRules', () => {
  afterEach(() => {
    clearAllCustomPatterns()
    clearAllCategoryOverrides()
    clearAllDescriptionOverrides()
  })

  it('reads the rules the stores hold now', () => {
    addCustomPattern({
      pattern: 'netflix',
      matchType: 'contains',
      category: 'shopping',
    })

    expect(hasUserRule(currentUserRules(), 'NETFLIX.COM')).toBe(true)
  })

  // A snapshot: rules saved after it was read are not in it, so whoever
  // read it categorizes and gates with one consistent set.
  it('is not changed by rules saved after it was read', () => {
    const snapshot = currentUserRules()

    setDescriptionOverride({
      description: 'KIOSCO 25',
      friendlyDescription: 'Kiosco',
      category: 'personal',
    })
    setMerchantCategoryOverride('DEVOTO EXPRESS', 'groceries')
    addCustomPattern({
      pattern: 'netflix',
      matchType: 'contains',
      category: 'shopping',
    })

    expect(hasUserRule(snapshot, 'KIOSCO 25')).toBe(false)
    expect(hasUserRule(snapshot, 'DEVOTO EXPRESS')).toBe(false)
    expect(hasUserRule(snapshot, 'NETFLIX.COM')).toBe(false)
  })
})

describe('rowsRuleWouldChange — the rows a rule would change now', () => {
  const uber = {
    pattern: 'uber',
    matchType: 'contains' as const,
    category: 'transport',
  }
  const row = (id: string, overrides: Partial<Transaction> = {}) =>
    ({
      id,
      date: new Date('2026-03-15T00:00:00Z'),
      description: 'UBER TRIP',
      amount: 300,
      currency: 'UYU',
      type: 'debit',
      source: 'bank_account',
      category: 'groceries',
      categoryConfidence: 0.8,
      tags: [],
      rawData: {},
      ...overrides,
    }) as Transaction
  const ids = (rows: Transaction[]) => rows.map((r) => r.id)

  it('returns matching rows whose category differs', () => {
    const rules = userRules({ customPatterns: [uber] })
    const rows = [row('a'), row('b', { description: 'DEVOTO' })]

    expect(
      ids(rowsRuleWouldChange(rows, rules.customPatterns[0], rules))
    ).toEqual(['a'])
  })

  it('skips rows that need no change or that a rule must not touch', () => {
    const rules = userRules({ customPatterns: [uber] })
    const rows = [
      row('already', { category: 'transport' }),
      row('by-hand', { categoryConfidence: 1 }),
      row('part', { splitParentId: 'x' }),
      row('parent', { isSplitParent: true }),
      row('other', { description: 'DEVOTO' }),
    ]

    expect(rowsRuleWouldChange(rows, rules.customPatterns[0], rules)).toEqual(
      []
    )
  })

  it('includes a row in the right category when the rule names it differently', () => {
    const rules = userRules({
      customPatterns: [{ ...uber, description: 'Uber' }],
    })
    const rows = [
      row('named', { category: 'transport', displayDescription: 'Uber' }),
      row('unnamed', { category: 'transport' }),
      row('renamed', { category: 'transport', displayDescription: 'Taxi' }),
    ]

    expect(
      ids(rowsRuleWouldChange(rows, rules.customPatterns[0], rules))
    ).toEqual(['unnamed', 'renamed'])
  })

  it('skips a row an earlier rule matches first, and includes it for that rule', () => {
    const rules = userRules({
      customPatterns: [
        {
          pattern: 'uber eats',
          matchType: 'contains',
          category: 'restaurants',
        },
        uber,
      ],
    })
    const rows = [row('eats', { description: 'UBER EATS' })]

    expect(rowsRuleWouldChange(rows, rules.customPatterns[1], rules)).toEqual(
      []
    )
    expect(
      ids(rowsRuleWouldChange(rows, rules.customPatterns[0], rules))
    ).toEqual(['eats'])
  })

  it('decides by the pattern alone when the rule is not in the list', () => {
    const rules = userRules({ customPatterns: [] })
    const literal = { ...uber, id: 'unlisted', createdAt: '' }

    expect(ids(rowsRuleWouldChange([row('a')], literal, rules))).toEqual(['a'])
  })

  it('skips a row a merchant override or a categorized description override covers', () => {
    const merchant = userRules({
      customPatterns: [uber],
      merchantOverrides: [{ merchantName: 'UBER TRIP', category: 'personal' }],
    })
    const described = userRules({
      customPatterns: [uber],
      descriptionOverrides: [
        {
          description: 'UBER TRIP',
          friendlyDescription: 'Taxi',
          category: 'personal',
        },
      ],
    })

    expect(
      rowsRuleWouldChange([row('a')], merchant.customPatterns[0], merchant)
    ).toEqual([])
    expect(
      rowsRuleWouldChange([row('a')], described.customPatterns[0], described)
    ).toEqual([])
  })

  it("includes a legacy-id rule's rows only when the category really differs", () => {
    const rules = userRules({
      customPatterns: [{ ...uber, category: 'food' }],
    })
    const rows = [
      row('same', { category: 'groceries' }),
      row('differs', { category: 'transport' }),
    ]

    expect(
      ids(rowsRuleWouldChange(rows, rules.customPatterns[0], rules))
    ).toEqual(['differs'])
  })

  it('never counts a row the user renamed through a description override', () => {
    const rules = userRules({
      customPatterns: [{ ...uber, description: 'Uber' }],
      descriptionOverrides: [
        { description: 'UBER TRIP', friendlyDescription: 'Taxi' },
      ],
    })
    const rows = [row('a', { category: 'transport' })]

    expect(rowsRuleWouldChange(rows, rules.customPatterns[0], rules)).toEqual(
      []
    )
  })

  it('counts every rule in one pass exactly as rowsRuleWouldChange does', () => {
    const rules = userRules({
      customPatterns: [
        {
          pattern: 'uber eats',
          matchType: 'contains',
          category: 'restaurants',
        },
        { ...uber, description: 'Uber' },
      ],
      descriptionOverrides: [
        { description: 'UBER X', friendlyDescription: 'Taxi' },
      ],
    })
    const rows = [
      row('eats', { description: 'UBER EATS' }),
      row('trip'),
      row('x', { description: 'UBER X', category: 'transport' }),
      row('hand', { categoryConfidence: 1 }),
      row('other', { description: 'DEVOTO' }),
    ]

    const counts = countRowsEachRuleWouldChange(rows, rules)

    for (const rule of rules.customPatterns) {
      expect(counts.get(rule.id)).toBe(
        rowsRuleWouldChange(rows, rule, rules).length
      )
    }
    expect([...counts.values()]).toEqual([1, 1])
  })
})

describe('isCategorizedByRule', () => {
  const rule = {
    pattern: 'NRO FAMILIA',
    matchType: 'contains' as const,
    category: 'personal',
  }
  const row = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: 't',
    date: new Date('2026-03-01T00:00:00.000Z'),
    description: 'DEBITO NRO FAMILIA 5506',
    amount: 10,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    category: 'personal',
    categoryConfidence: 0.95,
    rawData: {},
    ...overrides,
  })

  it('is true when the winning rule gives the row its category', () => {
    expect(
      isCategorizedByRule(row(), userRules({ customPatterns: [rule] }))
    ).toBe(true)
  })

  it("is false when the category differs from the rule's", () => {
    expect(
      isCategorizedByRule(
        row({ category: 'shopping' }),
        userRules({ customPatterns: [rule] })
      )
    ).toBe(false)
  })

  it('is false when a categorized description override covers the row', () => {
    const rules = userRules({
      customPatterns: [rule],
      descriptionOverrides: [
        {
          description: 'DEBITO NRO FAMILIA 5506',
          friendlyDescription: 'Familia',
          category: 'shopping',
        },
      ],
    })
    expect(isCategorizedByRule(row(), rules)).toBe(false)
  })

  it('is false when a merchant override covers the row', () => {
    const rules = userRules({
      customPatterns: [rule],
      merchantOverrides: [
        { merchantName: 'DEBITO NRO FAMILIA 5506', category: 'shopping' },
      ],
    })
    expect(isCategorizedByRule(row(), rules)).toBe(false)
  })

  it('is false for a row without a category', () => {
    expect(
      isCategorizedByRule(
        row({ category: undefined }),
        userRules({ customPatterns: [rule] })
      )
    ).toBe(false)
  })

  it('compares a legacy rule id by its current id', () => {
    expect(
      isCategorizedByRule(
        row({ category: 'groceries' }),
        userRules({ customPatterns: [{ ...rule, category: 'food' }] })
      )
    ).toBe(true)
  })
})

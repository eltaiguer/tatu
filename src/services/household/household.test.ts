import { afterEach, describe, expect, it } from 'vitest'
import { Category } from '../../models'
import { merchantOverrideKey } from '../categorizer/category-overrides'
import {
  canHaveHouseholdDefault,
  categoryHouseholdChoice,
  currentHouseholdRules,
  isCategoryHousehold,
  nextHouseholdChoice,
  partitionByHousehold,
  resolveHousehold,
  rowsChangedByRule,
  rowsSharingMerchantRule,
  rowHouseholdView,
} from './household'
import type { Transaction } from '../../models'
import { replaceCustomCategories } from '../categories/category-store'
import { categoryRules, householdRulesOf } from '../../test/household-rules'

const NONE = categoryRules([])

describe('resolveHousehold', () => {
  it('starts the seeded household categories as Hogar', () => {
    for (const category of [
      Category.Groceries,
      Category.Utilities,
      Category.Housing,
      Category.Healthcare,
      Category.Insurance,
      Category.Education,
      Category.Automotive,
    ]) {
      expect(resolveHousehold({ category }, NONE)).toEqual({
        status: 'household',
        source: 'category',
      })
    }
  })

  it('starts every other category as not household', () => {
    for (const category of [
      Category.Restaurants,
      Category.Transport,
      Category.Shopping,
      Category.Entertainment,
      Category.Software,
      Category.Personal,
      Category.Fees,
      'mascotas', // a custom category
    ]) {
      expect(resolveHousehold({ category }, NONE).status).toBe('not_household')
    }
  })

  it('treats salary, transfers and ignored rows as plain not household', () => {
    for (const category of [
      Category.Income,
      'salary', // pre-rename id of Income
      Category.InternalTransfer,
      Category.ExternalTransfer,
      'ignored', // what "Ignorar" writes
    ]) {
      expect(resolveHousehold({ category }, NONE).status).toBe('not_household')
    }
  })

  it('lets a mapped external transfer (rent paid by transfer) count as Hogar', () => {
    expect(
      resolveHousehold(
        { category: Category.ExternalTransfer },
        categoryRules([[Category.ExternalTransfer, true]])
      ).status
    ).toBe('household')
  })

  it("follows the user's category choice over the seeded default", () => {
    const mapping = categoryRules([
      [Category.Groceries, false],
      ['mascotas', true],
    ])
    expect(resolveHousehold({ category: Category.Groceries }, mapping)).toEqual(
      { status: 'not_household', source: 'category' }
    )
    expect(resolveHousehold({ category: 'mascotas' }, mapping).status).toBe(
      'household'
    )
  })

  it('reads category ids the way every surface does, on rows and choices', () => {
    expect(resolveHousehold({ category: ' Groceries ' }, NONE).status).toBe(
      'household'
    )
    expect(resolveHousehold({ category: 'food' }, NONE).status).toBe(
      'household'
    )
    // A choice stored under an old id or another casing still applies.
    const mapping = categoryRules([
      ['Restaurant', true],
      ['FOOD', false],
    ])
    expect(
      resolveHousehold({ category: Category.Restaurants }, mapping).status
    ).toBe('household')
    expect(
      resolveHousehold({ category: Category.Groceries }, mapping).status
    ).toBe('not_household')
  })

  it('uses the later default when two stored ids name one category', () => {
    expect(
      resolveHousehold(
        { category: Category.Restaurants },
        categoryRules([
          ['restaurant', true],
          ['restaurants', false],
        ])
      ).status
    ).toBe('not_household')
  })

  it('leaves uncategorized rows without a choice of their own as Sin definir', () => {
    for (const category of [
      undefined,
      Category.Uncategorized,
      '  ',
      'other', // pre-rename id of Uncategorized
    ]) {
      expect(resolveHousehold({ category }, NONE)).toEqual({
        status: 'unassigned',
        source: 'category',
      })
    }
  })

  it('cannot give Ingresos a household default, under any alias', () => {
    const mapping = categoryRules([[Category.Income, true]])
    for (const category of [Category.Income, 'salary']) {
      expect(resolveHousehold({ category }, mapping).status).toBe(
        'not_household'
      )
    }
  })

  it('cannot give Sin categoría a household default', () => {
    expect(
      resolveHousehold(
        { category: Category.Uncategorized },
        categoryRules([[Category.Uncategorized, true]])
      ).status
    ).toBe('unassigned')
  })

  it("lets the row's own choice win over its category, either way", () => {
    expect(
      resolveHousehold({ category: Category.Groceries, household: false }, NONE)
    ).toEqual({ status: 'not_household', source: 'row' })
    expect(
      resolveHousehold(
        { category: Category.Restaurants, household: true },
        categoryRules([[Category.Restaurants, false]])
      )
    ).toEqual({ status: 'household', source: 'row' })
  })

  it('keeps the row choice when the row is recategorized', () => {
    const row = { category: Category.Restaurants, household: true }
    expect(resolveHousehold(row, NONE).status).toBe('household')
    expect(
      resolveHousehold({ ...row, category: Category.Shopping }, NONE).status
    ).toBe('household')
  })

  it('keeps the row choice on an uncategorized row', () => {
    expect(resolveHousehold({ household: true }, NONE)).toEqual({
      status: 'household',
      source: 'row',
    })
  })

  it('follows the category when the row choice is cleared (null)', () => {
    expect(
      resolveHousehold({ category: Category.Groceries, household: null }, NONE)
    ).toEqual({ status: 'household', source: 'category' })
  })

  it('ignores a stored value that is not a yes/no', () => {
    const garbage = 'Hogar' as unknown as boolean
    expect(
      resolveHousehold(
        { category: Category.Restaurants, household: garbage },
        NONE
      )
    ).toEqual({ status: 'not_household', source: 'category' })
    expect(
      resolveHousehold(
        { category: Category.Restaurants },
        categoryRules([[Category.Restaurants, garbage]])
      ).status
    ).toBe('not_household')
  })
})

describe('currentHouseholdRules', () => {
  afterEach(() => replaceCustomCategories([]))

  const row = (id: string, isHousehold?: boolean) => ({
    id,
    label: id,
    color: '#112233',
    isHousehold,
  })

  it('is empty for a user who set no default', () => {
    replaceCustomCategories([row('restaurants')])

    expect(currentHouseholdRules().categories.size).toBe(0)
  })

  it('reflects the category store: built-in and custom rows, true and false', () => {
    replaceCustomCategories([
      row('restaurants', true),
      row('groceries', false),
      row('mascotas', true),
      row('viajes'),
    ])

    const map = currentHouseholdRules().categories

    expect(map.get('restaurants')).toBe(true)
    expect(map.get('groceries')).toBe(false)
    expect(map.get('mascotas')).toBe(true)
    expect(map.has('viajes')).toBe(false)
  })

  it('applies a default stored under an old id (food → groceries)', () => {
    replaceCustomCategories([row('food', false)])

    const rules = currentHouseholdRules()

    expect(rules.categories.get('groceries')).toBe(false)
    expect(resolveHousehold({ category: 'groceries' }, rules).status).toBe(
      'not_household'
    )
  })

  it('returns the same Map until the store changes', () => {
    replaceCustomCategories([row('restaurants', true)])

    const first = currentHouseholdRules().categories
    expect(currentHouseholdRules().categories).toBe(first)

    replaceCustomCategories([row('restaurants', false)])
    const second = currentHouseholdRules().categories
    expect(second).not.toBe(first)
    expect(second.get('restaurants')).toBe(false)
  })
})

describe('isCategoryHousehold', () => {
  it("is the category's effective default", () => {
    expect(isCategoryHousehold(Category.Groceries, NONE)).toBe(true)
    expect(isCategoryHousehold(Category.Restaurants, NONE)).toBe(false)
  })

  it("follows the user's choice over the seeded default", () => {
    expect(
      isCategoryHousehold(
        Category.Groceries,
        categoryRules([[Category.Groceries, false]])
      )
    ).toBe(false)
    expect(
      isCategoryHousehold(
        Category.Restaurants,
        categoryRules([[Category.Restaurants, true]])
      )
    ).toBe(true)
  })

  it('reads an old id the way rows do, and is false for Sin categoría', () => {
    expect(isCategoryHousehold('food', NONE)).toBe(true)
    expect(isCategoryHousehold(Category.Uncategorized, NONE)).toBe(false)
  })
})

describe('categoryHouseholdChoice', () => {
  it('stores nothing when the wish equals the seeded default', () => {
    expect(categoryHouseholdChoice(Category.Groceries, true)).toBeNull()
    expect(categoryHouseholdChoice(Category.Restaurants, false)).toBeNull()
  })

  it('stores the wish when it differs from the seeded default', () => {
    expect(categoryHouseholdChoice(Category.Groceries, false)).toBe(false)
    expect(categoryHouseholdChoice(Category.Restaurants, true)).toBe(true)
  })

  it('compares against the default of the normalized id', () => {
    expect(categoryHouseholdChoice('food', true)).toBeNull()
  })
})

describe('canHaveHouseholdDefault', () => {
  it('is false for Sin categoría and Ingresos, under any alias', () => {
    for (const id of [
      Category.Uncategorized,
      'other',
      Category.Income,
      'salary',
    ]) {
      expect(canHaveHouseholdDefault(id)).toBe(false)
    }
  })

  it('is true for every other category, transfers and custom ones included', () => {
    for (const id of [
      Category.Restaurants,
      Category.ExternalTransfer,
      Category.InternalTransfer,
      'mascotas',
    ]) {
      expect(canHaveHouseholdDefault(id)).toBe(true)
    }
  })
})

function expense(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx',
    date: new Date('2026-03-10T00:00:00.000Z'),
    description: 'row',
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    category: Category.Groceries,
    ...overrides,
  } as Transaction
}

describe('rowHouseholdView / nextHouseholdChoice', () => {
  it('shows a counted expense following its category', () => {
    const tx = expense()
    expect(rowHouseholdView(tx, NONE)).toEqual({
      status: 'household',
      source: 'category',
    })
    // Following Alimentación (household): a click says "no".
    expect(nextHouseholdChoice(tx, NONE)).toBe(false)
  })

  it('shows a row set by hand and sends it back to its category when the click matches it', () => {
    const tx = expense({ category: Category.Restaurants, household: true })
    expect(rowHouseholdView(tx, NONE)).toEqual({
      status: 'household',
      source: 'row',
    })
    // Restaurantes is not household: unmarking equals the category → null.
    expect(nextHouseholdChoice(tx, NONE)).toBeNull()
  })

  it('marks a row that follows a non-household category as household by hand', () => {
    const tx = expense({ category: Category.Restaurants })
    expect(nextHouseholdChoice(tx, NONE)).toBe(true)
  })

  it('writes the boolean when it differs from the category', () => {
    const tx = expense({ household: false })
    // Alimentación is household, row says no: a click → household = category.
    expect(nextHouseholdChoice(tx, NONE)).toBeNull()
    const own = expense({ household: true, category: Category.Groceries })
    expect(nextHouseholdChoice(own, NONE)).toBe(false)
  })

  it('follows the user’s category default', () => {
    const map = categoryRules([[Category.Restaurants, true]])
    const tx = expense({ category: Category.Restaurants })
    expect(nextHouseholdChoice(tx, map)).toBe(false)
  })

  it('an uncategorized expense is Sin definir and a click makes it household', () => {
    const tx = expense({ category: Category.Uncategorized })
    expect(rowHouseholdView(tx, NONE)).toEqual({
      status: 'unassigned',
      source: 'category',
    })
    expect(nextHouseholdChoice(tx, NONE)).toBe(true)
  })

  it('an uncategorized row set to household goes to not household, never back to null', () => {
    const tx = expense({ category: Category.Uncategorized, household: true })
    expect(nextHouseholdChoice(tx, NONE)).toBe(false)
  })

  it('has no view for income, ignored rows and split parents', () => {
    expect(rowHouseholdView(expense({ type: 'credit' }), NONE)).toBeNull()
    expect(
      rowHouseholdView(expense({ category: Category.InternalTransfer }), NONE)
    ).toBeNull()
    expect(rowHouseholdView(expense({ isSplitParent: true }), NONE)).toBeNull()
    expect(nextHouseholdChoice(expense({ type: 'credit' }), NONE)).toBeNull()
  })
})

describe('partitionByHousehold', () => {
  it('splits counted expenses into household and Sin definir, in one pass, keeping order', () => {
    const groceries = expense({ id: 'g' })
    const handMade = expense({
      id: 'h',
      category: Category.Restaurants,
      household: true,
    })
    const plain = expense({ id: 'p', category: Category.Restaurants })
    const loose = expense({ id: 'u', category: Category.Uncategorized })
    const income = expense({
      id: 'i',
      type: 'credit',
      category: Category.Income,
    })
    const transfer = expense({
      id: 't',
      category: Category.InternalTransfer,
    })

    const { household, unassigned } = partitionByHousehold(
      [groceries, plain, loose, income, handMade, transfer],
      NONE
    )

    expect(household.map((t) => t.id)).toEqual(['g', 'h'])
    expect(unassigned.map((t) => t.id)).toEqual(['u'])
  })

  it('agrees with rowHouseholdView for every row', () => {
    const rows = [
      expense({ id: 'a' }),
      expense({ id: 'b', category: Category.Uncategorized, household: false }),
      expense({ id: 'c', category: Category.Uncategorized, household: true }),
    ]
    const { household, unassigned } = partitionByHousehold(rows, NONE)
    for (const tx of rows) {
      const status = rowHouseholdView(tx, NONE)?.status
      expect(household.includes(tx)).toBe(status === 'household')
      expect(unassigned.includes(tx)).toBe(status === 'unassigned')
    }
  })
})

describe('merchant rules', () => {
  const devoto = (description: string, overrides = {}) =>
    ({
      ...expense({ category: Category.Restaurants, description }),
      ...overrides,
    }) as Transaction
  const keyOf = (d: string) => merchantOverrideKey(d) as string
  const rule = (d: string, value: boolean) =>
    householdRulesOf({ merchants: [[keyOf(d), value]] })

  it('a rule true makes a restaurants debit household, from the merchant', () => {
    expect(resolveHousehold(devoto('DEVOTO'), rule('DEVOTO', true))).toEqual({
      status: 'household',
      source: 'merchant',
    })
  })

  it('a rule false makes a groceries debit not household', () => {
    const tx = expense({ description: 'DEVOTO', category: Category.Groceries })
    expect(resolveHousehold(tx, rule('DEVOTO', false))).toEqual({
      status: 'not_household',
      source: 'merchant',
    })
  })

  it('the row’s own choice beats the rule', () => {
    const tx = devoto('DEVOTO', { household: false })
    expect(resolveHousehold(tx, rule('DEVOTO', true))).toEqual({
      status: 'not_household',
      source: 'row',
    })
  })

  it('a rule covers an uncategorized row, which is then not Sin definir', () => {
    const tx = expense({
      description: 'DEVOTO',
      category: Category.Uncategorized,
    })
    expect(resolveHousehold(tx, rule('DEVOTO', true))).toEqual({
      status: 'household',
      source: 'merchant',
    })
  })

  it('a split part ignores the rule and keeps its category default', () => {
    const part = devoto('DEVOTO', { splitParentId: 'parent' })
    expect(resolveHousehold(part, rule('DEVOTO', true))).toEqual({
      status: 'not_household',
      source: 'category',
    })
  })

  it('descriptions that differ only in per-transaction noise share the rule', () => {
    const rules = rule('DEVOTO SUPERMERCADO 12/03/2026 14:05', true)
    const other = devoto('DEVOTO SUPERMERCADO 19/03/2026 09:30')
    expect(resolveHousehold(other, rules).source).toBe('merchant')
  })

  it('without a rule the answer is the category’s', () => {
    expect(resolveHousehold(devoto('DEVOTO'), householdRulesOf())).toEqual({
      status: 'not_household',
      source: 'category',
    })
  })

  it('a click that lands on what the row would inherit clears the choice (rule first)', () => {
    const rules = rule('DEVOTO', true)
    const tx = devoto('DEVOTO', { household: false })
    expect(nextHouseholdChoice(tx, rules)).toBeNull()
    // Following the rule (household), a click says no: the category (no) agrees.
    expect(nextHouseholdChoice(devoto('DEVOTO'), rules)).toBe(false)
  })

  it('a click against the rule on a groceries row writes the boolean', () => {
    const rules = rule('DEVOTO', false)
    const tx = expense({ description: 'DEVOTO', category: Category.Groceries })
    // Rule says no, category says yes: a click means yes = the category's.
    expect(nextHouseholdChoice(tx, rules)).toBe(true)
  })

  it('rowsSharingMerchantRule: counted, non-split rows with the same key, target included', () => {
    const a = devoto('DEVOTO 12/03/2026', { id: 'a' })
    const b = devoto('DEVOTO 19/03/2026', { id: 'b' })
    const other = devoto('TIENDA INGLESA', { id: 'c' })
    const part = devoto('DEVOTO', { id: 'd', splitParentId: 'p' })
    const income = devoto('DEVOTO', { id: 'e', type: 'credit' })
    expect(
      rowsSharingMerchantRule([a, b, other, part, income], a).map((t) => t.id)
    ).toEqual(['a', 'b'])
    expect(rowsSharingMerchantRule([a, b, part], part)).toEqual([])
  })
})

describe('rowsChangedByRule', () => {
  const at = (id: string, day: number, overrides = {}) =>
    ({
      ...expense({ category: Category.Restaurants }),
      id,
      description: `DEVOTO ${day}/03/2026`,
      ...overrides,
    }) as Transaction
  const KEY = merchantOverrideKey('DEVOTO 1/03/2026') as string
  const none = householdRulesOf()
  const target = at('t', 11)
  const plain = at('p', 12)
  const own = at('o', 13, { household: false })
  const loose = at('u', 14, { category: Category.Uncategorized })
  const all = [target, plain, own, loose, expense({ description: 'OTRO' })]
  const ids = (rows: Transaction[]) => rows.map((r) => r.id)

  it('clearing own choices: every similar row whose shown value changes', () => {
    expect(ids(rowsChangedByRule(all, target, true, none, true))).toEqual([
      't',
      'p',
      'o',
      'u',
    ])
  })

  it('keeping own choices: those keep what they show, the rest follow the rule', () => {
    // The target's own choice is cleared in both; "o" keeps its own No.
    expect(ids(rowsChangedByRule(all, target, true, none, false))).toEqual([
      't',
      'p',
      'u',
    ])
  })

  it('leaves out rows that already show the value, and deleting a rule reverts', () => {
    const withRule = householdRulesOf({ merchants: [[KEY, true]] })
    expect(ids(rowsChangedByRule(all, target, true, withRule, true))).toEqual([
      'o',
    ])
    // Rule Sí deleted: "p" and "u" showed the rule, go back to the category.
    expect(ids(rowsChangedByRule(all, target, null, withRule, false))).toEqual([
      't',
      'p',
      'u',
    ])
  })
})

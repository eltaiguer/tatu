import { afterEach, describe, expect, it } from 'vitest'
import { Category } from '../../models'
import {
  buildCategoryHousehold,
  canHaveHouseholdDefault,
  categoryHouseholdChoice,
  currentCategoryHousehold,
  isCategoryHousehold,
  resolveHousehold,
} from './household'
import { replaceCustomCategories } from '../categories/category-store'

const NONE = buildCategoryHousehold([])

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
        isOverride: false,
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
        buildCategoryHousehold([[Category.ExternalTransfer, true]])
      ).status
    ).toBe('household')
  })

  it("follows the user's category choice over the seeded default", () => {
    const mapping = buildCategoryHousehold([
      [Category.Groceries, false],
      ['mascotas', true],
    ])
    expect(resolveHousehold({ category: Category.Groceries }, mapping)).toEqual(
      { status: 'not_household', isOverride: false }
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
    const mapping = buildCategoryHousehold([
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
        buildCategoryHousehold([
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
        isOverride: false,
      })
    }
  })

  it('cannot give Ingresos a household default, under any alias', () => {
    const mapping = buildCategoryHousehold([[Category.Income, true]])
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
        buildCategoryHousehold([[Category.Uncategorized, true]])
      ).status
    ).toBe('unassigned')
  })

  it("lets the row's own choice win over its category, either way", () => {
    expect(
      resolveHousehold({ category: Category.Groceries, household: false }, NONE)
    ).toEqual({ status: 'not_household', isOverride: true })
    expect(
      resolveHousehold(
        { category: Category.Restaurants, household: true },
        buildCategoryHousehold([[Category.Restaurants, false]])
      )
    ).toEqual({ status: 'household', isOverride: true })
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
      isOverride: true,
    })
  })

  it('follows the category when the row choice is cleared (null)', () => {
    expect(
      resolveHousehold({ category: Category.Groceries, household: null }, NONE)
    ).toEqual({ status: 'household', isOverride: false })
  })

  it('ignores a stored value that is not a yes/no', () => {
    const garbage = 'Hogar' as unknown as boolean
    expect(
      resolveHousehold(
        { category: Category.Restaurants, household: garbage },
        NONE
      )
    ).toEqual({ status: 'not_household', isOverride: false })
    expect(
      resolveHousehold(
        { category: Category.Restaurants },
        buildCategoryHousehold([[Category.Restaurants, garbage]])
      ).status
    ).toBe('not_household')
  })
})

describe('currentCategoryHousehold', () => {
  afterEach(() => replaceCustomCategories([]))

  const row = (id: string, isHousehold?: boolean) => ({
    id,
    label: id,
    color: '#112233',
    isHousehold,
  })

  it('is empty for a user who set no default', () => {
    replaceCustomCategories([row('restaurants')])

    expect(currentCategoryHousehold().size).toBe(0)
  })

  it('reflects the category store: built-in and custom rows, true and false', () => {
    replaceCustomCategories([
      row('restaurants', true),
      row('groceries', false),
      row('mascotas', true),
      row('viajes'),
    ])

    const map = currentCategoryHousehold()

    expect(map.get('restaurants')).toBe(true)
    expect(map.get('groceries')).toBe(false)
    expect(map.get('mascotas')).toBe(true)
    expect(map.has('viajes')).toBe(false)
  })

  it('applies a default stored under an old id (food → groceries)', () => {
    replaceCustomCategories([row('food', false)])

    const map = currentCategoryHousehold()

    expect(map.get('groceries')).toBe(false)
    expect(resolveHousehold({ category: 'groceries' }, map).status).toBe(
      'not_household'
    )
  })

  it('returns the same Map until the store changes', () => {
    replaceCustomCategories([row('restaurants', true)])

    const first = currentCategoryHousehold()
    expect(currentCategoryHousehold()).toBe(first)

    replaceCustomCategories([row('restaurants', false)])
    const second = currentCategoryHousehold()
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
        buildCategoryHousehold([[Category.Groceries, false]])
      )
    ).toBe(false)
    expect(
      isCategoryHousehold(
        Category.Restaurants,
        buildCategoryHousehold([[Category.Restaurants, true]])
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

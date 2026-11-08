import { describe, expect, it } from 'vitest'
import { Category } from '../../models'
import { resolveScope, SEEDED_HOUSEHOLD_CATEGORIES } from './scope'

describe('resolveScope', () => {
  it('puts the seeded household categories in Hogar by default', () => {
    for (const category of [
      Category.Groceries,
      Category.Utilities,
      Category.Housing,
      Category.Healthcare,
      Category.Insurance,
      Category.Education,
      Category.Automotive,
    ]) {
      expect(resolveScope({ category }, {})).toEqual({
        scope: 'household',
        isOverride: false,
      })
    }
    expect(SEEDED_HOUSEHOLD_CATEGORIES.size).toBe(7)
  })

  it('puts every other built-in category in Personal by default', () => {
    for (const category of [
      Category.Restaurants,
      Category.Transport,
      Category.Shopping,
      Category.Entertainment,
      Category.Software,
      Category.Personal,
      Category.Fees,
    ]) {
      expect(resolveScope({ category }, {}).scope).toBe('personal')
    }
  })

  it('starts a custom category in Personal', () => {
    expect(resolveScope({ category: 'mascotas' }, {}).scope).toBe('personal')
  })

  it("follows the user's mapping over the seeded default", () => {
    expect(
      resolveScope(
        { category: Category.Groceries },
        { [Category.Groceries]: 'personal' }
      )
    ).toEqual({ scope: 'personal', isOverride: false })
    expect(
      resolveScope({ category: 'mascotas' }, { mascotas: 'household' }).scope
    ).toBe('household')
  })

  it('reads the category id the way every surface does (case, aliases)', () => {
    expect(resolveScope({ category: ' Groceries ' }, {}).scope).toBe(
      'household'
    )
    // 'food' is the pre-rename id of Groceries.
    expect(resolveScope({ category: 'food' }, {}).scope).toBe('household')
    expect(
      resolveScope({ category: 'restaurant' }, { restaurants: 'household' })
        .scope
    ).toBe('household')
  })

  it('leaves uncategorized rows unassigned (Sin definir)', () => {
    expect(resolveScope({}, {})).toEqual({
      scope: 'unassigned',
      isOverride: false,
    })
    expect(resolveScope({ category: Category.Uncategorized }, {}).scope).toBe(
      'unassigned'
    )
    expect(resolveScope({ category: '  ' }, {}).scope).toBe('unassigned')
  })

  it('cannot map Sin categoría to a side', () => {
    expect(
      resolveScope(
        { category: Category.Uncategorized },
        { [Category.Uncategorized]: 'household' }
      ).scope
    ).toBe('unassigned')
  })

  it("lets the row's own choice win over its category", () => {
    expect(
      resolveScope({ category: Category.Groceries, scope: 'personal' }, {})
    ).toEqual({ scope: 'personal', isOverride: true })
    expect(
      resolveScope(
        { category: Category.Restaurants, scope: 'household' },
        { [Category.Restaurants]: 'personal' }
      )
    ).toEqual({ scope: 'household', isOverride: true })
  })

  it('keeps the row choice on an uncategorized row', () => {
    expect(resolveScope({ scope: 'household' }, {})).toEqual({
      scope: 'household',
      isOverride: true,
    })
  })

  it('treats a cleared row choice (null) as following the category', () => {
    expect(
      resolveScope({ category: Category.Groceries, scope: null }, {})
    ).toEqual({ scope: 'household', isOverride: false })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomCategory } from './category-store'

const { listCustomCategoriesMock } = vi.hoisted(() => ({
  listCustomCategoriesMock: vi.fn<[], CustomCategory[]>(),
}))

vi.mock('./category-store', () => ({
  listCustomCategories: listCustomCategoriesMock,
}))

import {
  getCategoryDefinition,
  getCategoryDefinitions,
  isCategoryIgnored,
} from './category-registry'
import { Category } from '../../models'

describe('getCategoryDefinitions', () => {
  beforeEach(() => {
    listCustomCategoriesMock.mockReturnValue([])
  })

  it('returns all 18 built-in categories', () => {
    const defs = getCategoryDefinitions()
    expect(defs).toHaveLength(Object.values(Category).length)
  })

  it('puts Uncategorized last regardless of locale sort', () => {
    const defs = getCategoryDefinitions()
    expect(defs[defs.length - 1].id).toBe(Category.Uncategorized)
  })

  it('sorts built-in categories alphabetically by Spanish label', () => {
    const defs = getCategoryDefinitions()
    const withoutLast = defs.slice(0, -1)
    for (let i = 1; i < withoutLast.length; i++) {
      expect(
        withoutLast[i - 1].label.localeCompare(withoutLast[i].label, 'es')
      ).toBeLessThanOrEqual(0)
    }
  })

  it('marks built-in Ignored category as isIgnored', () => {
    const defs = getCategoryDefinitions()
    const ignored = defs.find((d) => d.id === Category.Ignored)
    expect(ignored?.isIgnored).toBe(true)
  })

  it('marks other built-in categories as not ignored', () => {
    const defs = getCategoryDefinitions()
    const groceries = defs.find((d) => d.id === Category.Groceries)
    expect(groceries?.isIgnored).toBe(false)
  })

  it('sets isCustom: false for built-in categories', () => {
    const defs = getCategoryDefinitions()
    const builtin = defs.filter((d) => !d.isCustom)
    expect(builtin).toHaveLength(Object.values(Category).length)
  })

  it('includes custom categories after built-ins', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: 'my-custom', label: 'Mi categoría', color: '#ff0000' },
    ])

    const defs = getCategoryDefinitions()
    const custom = defs.find((d) => d.id === 'my-custom')
    expect(custom).toBeDefined()
    expect(custom?.isCustom).toBe(true)
  })

  it('deduplicates custom categories with repeated ids', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: 'my-custom', label: 'A', color: '#ff0000' },
      { id: 'my-custom', label: 'B', color: '#00ff00' },
    ])

    const defs = getCategoryDefinitions()
    const matches = defs.filter((d) => d.id === 'my-custom')
    expect(matches).toHaveLength(1)
  })

  it('uses default icon for custom categories with no icon', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: 'my-custom', label: 'Mi categoría', color: '#ff0000', icon: undefined },
    ])

    const defs = getCategoryDefinitions()
    const custom = defs.find((d) => d.id === 'my-custom')
    expect(custom?.icon).toBe('🏷️')
  })

  it('applies label override from a custom entry matching a built-in id', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: Category.Groceries, label: 'Comida', color: '#ff0000' },
    ])

    const defs = getCategoryDefinitions()
    const groceries = defs.find((d) => d.id === Category.Groceries)
    expect(groceries?.label).toBe('Comida')
    expect(groceries?.isCustom).toBe(false)
  })

  it('marks built-in category as ignored via custom override', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: Category.Shopping, label: 'Compras', color: '#ff0000', isIgnored: true },
    ])

    const defs = getCategoryDefinitions()
    const shopping = defs.find((d) => d.id === Category.Shopping)
    expect(shopping?.isIgnored).toBe(true)
  })
})

describe('getCategoryDefinition', () => {
  beforeEach(() => {
    listCustomCategoriesMock.mockReturnValue([])
  })

  it('returns definition for a valid built-in category', () => {
    const def = getCategoryDefinition(Category.Groceries)
    expect(def.id).toBe(Category.Groceries)
    expect(def.label).toBe('Alimentación')
  })

  it('returns Uncategorized fallback for undefined', () => {
    const def = getCategoryDefinition(undefined)
    expect(def.id).toBe(Category.Uncategorized)
  })

  it('returns Uncategorized fallback for unknown id', () => {
    const def = getCategoryDefinition('totally-unknown-id')
    expect(def.id).toBe(Category.Uncategorized)
  })

  it('resolves alias: food → groceries', () => {
    const def = getCategoryDefinition('food')
    expect(def.id).toBe(Category.Groceries)
  })

  it('resolves alias: restaurant → restaurants', () => {
    const def = getCategoryDefinition('restaurant')
    expect(def.id).toBe(Category.Restaurants)
  })

  it('resolves alias: health → healthcare', () => {
    const def = getCategoryDefinition('health')
    expect(def.id).toBe(Category.Healthcare)
  })

  it('resolves alias: salary → income', () => {
    const def = getCategoryDefinition('salary')
    expect(def.id).toBe(Category.Income)
  })

  it('resolves alias: other → uncategorized', () => {
    const def = getCategoryDefinition('other')
    expect(def.id).toBe(Category.Uncategorized)
  })

  it('is case-insensitive for built-in ids', () => {
    const def = getCategoryDefinition('GROCERIES')
    expect(def.id).toBe(Category.Groceries)
  })

  it('applies custom override label for a built-in', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: Category.Transport, label: 'Movilidad', color: '#0000ff' },
    ])

    const def = getCategoryDefinition(Category.Transport)
    expect(def.label).toBe('Movilidad')
    expect(def.isOverridden).toBe(true)
  })

  it('returns a custom category definition when found', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: 'my-custom', label: 'Mi categoría', color: '#ff0000' },
    ])

    const def = getCategoryDefinition('my-custom')
    expect(def.id).toBe('my-custom')
    expect(def.isCustom).toBe(true)
  })
})

describe('isCategoryIgnored', () => {
  beforeEach(() => {
    listCustomCategoriesMock.mockReturnValue([])
  })

  it('returns true for the built-in Ignored category', () => {
    expect(isCategoryIgnored(Category.Ignored)).toBe(true)
  })

  it('returns false for other built-in categories', () => {
    expect(isCategoryIgnored(Category.Groceries)).toBe(false)
    expect(isCategoryIgnored(Category.Income)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isCategoryIgnored(undefined)).toBe(false)
  })

  it('returns true when custom override sets isIgnored: true', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: Category.Shopping, label: 'Compras', color: '#ff0000', isIgnored: true },
    ])

    expect(isCategoryIgnored(Category.Shopping)).toBe(true)
  })

  it('returns false when custom override sets isIgnored: false', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: Category.Shopping, label: 'Compras', color: '#ff0000', isIgnored: false },
    ])

    expect(isCategoryIgnored(Category.Shopping)).toBe(false)
  })
})

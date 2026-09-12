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

  it('marks built-in categories as not ignored by default', () => {
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
      {
        id: 'my-custom',
        label: 'Mi categoría',
        color: '#ff0000',
        icon: undefined,
      },
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
      {
        id: Category.Shopping,
        label: 'Compras',
        color: '#ff0000',
        isIgnored: true,
      },
    ])

    const defs = getCategoryDefinitions()
    const shopping = defs.find((d) => d.id === Category.Shopping)
    expect(shopping?.isIgnored).toBe(true)
  })

  it('uses override icon when a built-in category has a custom icon override', () => {
    listCustomCategoriesMock.mockReturnValue([
      {
        id: Category.Groceries,
        label: 'Comida',
        color: '#ff0000',
        icon: '🛒✨',
      },
    ])

    const defs = getCategoryDefinitions()
    const groceries = defs.find((d) => d.id === Category.Groceries)
    expect(groceries?.icon).toBe('🛒✨')
  })

  it('falls back to built-in icon when override has no icon', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: Category.Groceries, label: 'Comida', color: '#ff0000' },
    ])

    const defs = getCategoryDefinitions()
    const groceries = defs.find((d) => d.id === Category.Groceries)
    expect(groceries?.icon).toBe('🛒')
  })

  it('folds a legacy-id custom row (pre-rename "transfer") into the current built-in instead of duplicating it', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: 'transfer', label: 'Transferencias internas', color: '#0284c7' },
    ])

    const defs = getCategoryDefinitions()
    const transferEntries = defs.filter(
      (d) => d.label === 'Transferencias internas'
    )
    expect(transferEntries).toHaveLength(1)
    expect(transferEntries[0].id).toBe(Category.InternalTransfer)
    expect(transferEntries[0].isCustom).toBe(false)
    expect(defs.find((d) => d.id === 'transfer')).toBeUndefined()
  })

  it('carries over label/color overrides from a legacy-id row onto the current built-in', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: 'transfer', label: 'Mis transferencias', color: '#123456' },
    ])

    const defs = getCategoryDefinitions()
    const internalTransfer = defs.find(
      (d) => d.id === Category.InternalTransfer
    )
    expect(internalTransfer?.label).toBe('Mis transferencias')
    expect(internalTransfer?.color).toBe('#123456')
  })

  it('folds a legacy-id custom row ("transfers" -> external transfer) into the current built-in', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: 'transfers', label: 'Transferencias externas', color: '#7c3aed' },
    ])

    const defs = getCategoryDefinitions()
    const matches = defs.filter((d) => d.label === 'Transferencias externas')
    expect(matches).toHaveLength(1)
    expect(matches[0].id).toBe(Category.ExternalTransfer)
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

  it('uses override icon for a built-in when override has an icon', () => {
    listCustomCategoriesMock.mockReturnValue([
      {
        id: Category.InternalTransfer,
        label: 'Mis transferencias',
        color: '#0000ff',
        icon: '💼',
      },
    ])

    const def = getCategoryDefinition(Category.InternalTransfer)
    expect(def.icon).toBe('💼')
  })

  it('falls back to built-in icon for a built-in override with no icon', () => {
    listCustomCategoriesMock.mockReturnValue([
      {
        id: Category.InternalTransfer,
        label: 'Mis transferencias',
        color: '#0000ff',
      },
    ])

    const def = getCategoryDefinition(Category.InternalTransfer)
    expect(def.icon).toBe('↔️')
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

describe('accessor agreement', () => {
  beforeEach(() => {
    listCustomCategoriesMock.mockReturnValue([])
  })

  it('resolves legacy override rows the same way in all three accessors', () => {
    listCustomCategoriesMock.mockReturnValue([
      {
        id: 'transfer',
        label: 'Transferencias internas',
        color: '#ff0000',
        isIgnored: false,
      },
    ])

    expect(isCategoryIgnored(Category.InternalTransfer)).toBe(false)
    expect(
      getCategoryDefinitions().find((c) => c.id === Category.InternalTransfer)
        ?.isIgnored
    ).toBe(false)
    expect(getCategoryDefinition(Category.InternalTransfer).isIgnored).toBe(
      false
    )
  })
})

describe('isCategoryIgnored', () => {
  beforeEach(() => {
    listCustomCategoriesMock.mockReturnValue([])
  })

  it('returns true for legacy ignored string (backward compat)', () => {
    expect(isCategoryIgnored('ignored')).toBe(true)
  })

  it('returns false for built-in categories', () => {
    expect(isCategoryIgnored(Category.Groceries)).toBe(false)
    expect(isCategoryIgnored(Category.Income)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isCategoryIgnored(undefined)).toBe(false)
  })

  it('returns true when custom override sets isIgnored: true', () => {
    listCustomCategoriesMock.mockReturnValue([
      {
        id: Category.Shopping,
        label: 'Compras',
        color: '#ff0000',
        isIgnored: true,
      },
    ])

    expect(isCategoryIgnored(Category.Shopping)).toBe(true)
  })

  it('returns false when custom override sets isIgnored: false', () => {
    listCustomCategoriesMock.mockReturnValue([
      {
        id: Category.Shopping,
        label: 'Compras',
        color: '#ff0000',
        isIgnored: false,
      },
    ])

    expect(isCategoryIgnored(Category.Shopping)).toBe(false)
  })

  it('returns true for pre-rename transfer ids stored on transactions', () => {
    expect(isCategoryIgnored('transfer')).toBe(true)
    expect(isCategoryIgnored('transfers')).toBe(true)
  })

  it('ignores casing on stored ids', () => {
    expect(isCategoryIgnored('Internal_Transfer')).toBe(true)
    expect(isCategoryIgnored('IGNORED')).toBe(true)
  })

  it('prefers the current-id override over a stale legacy duplicate', () => {
    // upsertBuiltinOverride matches on the exact id and appends otherwise, so
    // un-ignoring Transferencias internas leaves the pre-rename row in place.
    // getCategoryDefinitions resolves this last-wins; the predicate must agree.
    listCustomCategoriesMock.mockReturnValue([
      {
        id: 'transfer',
        label: 'Transferencias internas',
        color: '#ff0000',
        isIgnored: true,
      },
      {
        id: Category.InternalTransfer,
        label: 'Transferencias internas',
        color: '#ff0000',
        isIgnored: false,
      },
    ])

    expect(isCategoryIgnored(Category.InternalTransfer)).toBe(false)
    expect(isCategoryIgnored('transfer')).toBe(false)
  })

  it('prefers the current-id override whatever order the rows arrive in', () => {
    // Supabase returns custom_categories without an ORDER BY, so the stale
    // legacy row can come back either side of the canonical one.
    const legacy = {
      id: 'transfer',
      label: 'Transferencias internas',
      color: '#ff0000',
      isIgnored: true,
    }
    const current = {
      id: Category.InternalTransfer,
      label: 'Transferencias internas',
      color: '#ff0000',
      isIgnored: false,
    }

    for (const rows of [
      [legacy, current],
      [current, legacy],
    ]) {
      listCustomCategoriesMock.mockReturnValue(rows)
      expect(isCategoryIgnored(Category.InternalTransfer)).toBe(false)
      expect(isCategoryIgnored('transfer')).toBe(false)
      expect(
        getCategoryDefinitions().find((c) => c.id === Category.InternalTransfer)
          ?.isIgnored
      ).toBe(false)
    }
  })

  it('resolves two alias rows for one built-in the same way in any order', () => {
    // Ids differing only in case both alias onto internal_transfer, so both
    // land in the aliased bucket and the tie must break on the id rather than
    // on the order select('*') happened to return them in.
    const lower = {
      id: 'transfer',
      label: 'Transferencias',
      color: '#ff0000',
      isIgnored: true,
    }
    const upper = {
      id: 'Transfer',
      label: 'Transferencias',
      color: '#00ff00',
      isIgnored: false,
    }

    listCustomCategoriesMock.mockReturnValue([lower, upper])
    const first = isCategoryIgnored(Category.InternalTransfer)

    listCustomCategoriesMock.mockReturnValue([upper, lower])
    expect(isCategoryIgnored(Category.InternalTransfer)).toBe(first)
  })

  it('keeps the transfer default when a legacy row records no preference', () => {
    // A row with no recorded preference must fall through to the built-in
    // default rather than read as an explicit "not ignored" and let transfers
    // back into totals. Defensive: schema.sql has is_ignored NOT NULL DEFAULT
    // false, so today only the in-memory store can produce undefined.
    listCustomCategoriesMock.mockReturnValue([
      {
        id: 'transfer',
        label: 'Transferencias',
        color: '#ff0000',
        isIgnored: undefined,
      },
    ])

    expect(isCategoryIgnored(Category.InternalTransfer)).toBe(true)
    expect(isCategoryIgnored('transfer')).toBe(true)
  })

  it('lets the Categorías toggle override a legacy alias row', () => {
    // A pre-existing row keyed by an alias ('food' -> groceries) controls the
    // built-in's ignore flag. Unticking "ignorar" in Categorías calls
    // upsertBuiltinOverride, which appends a row keyed by the current id —
    // that row must win, so the state is always correctable from the UI.
    listCustomCategoriesMock.mockReturnValue([
      { id: 'food', label: 'Food', color: '#ff0000', isIgnored: true },
    ])
    expect(isCategoryIgnored(Category.Groceries)).toBe(true)

    listCustomCategoriesMock.mockReturnValue([
      { id: 'food', label: 'Food', color: '#ff0000', isIgnored: true },
      {
        id: Category.Groceries,
        label: 'Alimentación',
        color: '#ff0000',
        isIgnored: false,
      },
    ])
    expect(isCategoryIgnored(Category.Groceries)).toBe(false)
  })

  it('honours a legacy-id override when un-ignoring a renamed built-in', () => {
    listCustomCategoriesMock.mockReturnValue([
      {
        id: 'transfer',
        label: 'Transferencias internas',
        color: '#ff0000',
        isIgnored: false,
      },
    ])

    expect(isCategoryIgnored(Category.InternalTransfer)).toBe(false)
    expect(isCategoryIgnored('transfer')).toBe(false)
  })
})

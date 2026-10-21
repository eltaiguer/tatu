import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CATEGORY_COLOR,
  removeCustomCategory,
  replaceCustomCategories,
  type CustomCategory,
} from './category-store'
import {
  getCategoryDefinitions,
  isCategoryIgnored,
  resolveCategory,
} from './category-registry'
import { normalizeCategoryId } from './category-aliases'
import { Category } from '../../models'

// The registry reads the real in-memory store: tests load it the way the app
// does on sign-in (replaceCustomCategories) instead of mocking it.
function loadCustom(rows: CustomCategory[]) {
  replaceCustomCategories(rows)
}

afterEach(() => {
  replaceCustomCategories([])
  vi.restoreAllMocks()
})

const isIgnored = (id?: string | null) => resolveCategory(id).isIgnored

describe('getCategoryDefinitions', () => {
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
    loadCustom([{ id: 'my-custom', label: 'Mi categoría', color: '#ff0000' }])

    const defs = getCategoryDefinitions()
    const custom = defs.find((d) => d.id === 'my-custom')
    expect(custom).toBeDefined()
    expect(custom?.isCustom).toBe(true)
  })

  it('deduplicates custom categories with repeated ids', () => {
    // The store reports rows that name one category with different settings.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    loadCustom([
      { id: 'my-custom', label: 'A', color: '#ff0000' },
      { id: 'my-custom', label: 'B', color: '#00ff00' },
    ])

    const defs = getCategoryDefinitions()
    const matches = defs.filter((d) => d.id === 'my-custom')
    expect(matches).toHaveLength(1)
    expect(warn).toHaveBeenCalled()
  })

  it('uses default icon for custom categories with no icon', () => {
    loadCustom([
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
    loadCustom([{ id: Category.Groceries, label: 'Comida', color: '#ff0000' }])

    const defs = getCategoryDefinitions()
    const groceries = defs.find((d) => d.id === Category.Groceries)
    expect(groceries?.label).toBe('Comida')
    expect(groceries?.isCustom).toBe(false)
  })

  it('marks built-in category as ignored via custom override', () => {
    loadCustom([
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
    loadCustom([
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
    loadCustom([{ id: Category.Groceries, label: 'Comida', color: '#ff0000' }])

    const defs = getCategoryDefinitions()
    const groceries = defs.find((d) => d.id === Category.Groceries)
    expect(groceries?.icon).toBe('🛒')
  })

  it('folds a legacy-id custom row (pre-rename "transfer") into the current built-in instead of duplicating it', () => {
    loadCustom([
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
    loadCustom([
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
    loadCustom([
      { id: 'transfers', label: 'Transferencias externas', color: '#7c3aed' },
    ])

    const defs = getCategoryDefinitions()
    const matches = defs.filter((d) => d.label === 'Transferencias externas')
    expect(matches).toHaveLength(1)
    expect(matches[0].id).toBe(Category.ExternalTransfer)
  })
})

describe('resolveCategory', () => {
  describe('built-in categories', () => {
    it('resolves a built-in id to its label, colour and icon', () => {
      expect(resolveCategory(Category.Groceries)).toEqual({
        id: 'groceries',
        label: 'Alimentación',
        color: expect.any(String),
        icon: '🛒',
        isCustom: false,
        isIgnored: false,
        known: true,
      })
    })

    it('resolves pre-rename aliases to the current built-in', () => {
      expect(resolveCategory('food').id).toBe(Category.Groceries)
      expect(resolveCategory('food').label).toBe('Alimentación')
      expect(resolveCategory('restaurant').id).toBe(Category.Restaurants)
      expect(resolveCategory('health').id).toBe(Category.Healthcare)
      expect(resolveCategory('salary').id).toBe(Category.Income)
      expect(resolveCategory('other').id).toBe(Category.Uncategorized)
    })

    it('ignores casing', () => {
      expect(resolveCategory('GROCERIES').id).toBe(Category.Groceries)
      expect(resolveCategory('Food').label).toBe('Alimentación')
    })

    it('treats a missing or empty id as Sin categoría', () => {
      for (const id of [undefined, null, '']) {
        const resolved = resolveCategory(id)
        expect(resolved.id).toBe(Category.Uncategorized)
        expect(resolved.label).toBe('Sin categoría')
        expect(resolved.isIgnored).toBe(false)
        expect(resolved.known).toBe(true)
      }
    })

    it('has a label and icon for every built-in category', () => {
      Object.values(Category).forEach((category) => {
        const resolved = resolveCategory(category)
        expect(resolved.label.length).toBeGreaterThan(0)
        expect(resolved.icon.length).toBeGreaterThan(0)
        expect(resolved.known).toBe(true)
      })
    })

    it("applies the user's label, colour and icon override", () => {
      loadCustom([
        {
          id: Category.Transport,
          label: 'Movilidad',
          color: '#0000ff',
          icon: '🚲',
        },
      ])

      expect(resolveCategory(Category.Transport)).toMatchObject({
        id: Category.Transport,
        label: 'Movilidad',
        color: '#0000ff',
        icon: '🚲',
        isCustom: false,
      })
    })

    it('keeps the built-in icon when the override has none', () => {
      loadCustom([
        {
          id: Category.InternalTransfer,
          label: 'Mis transferencias',
          color: '#0000ff',
        },
      ])

      expect(resolveCategory(Category.InternalTransfer).icon).toBe('↔️')
    })

    it('does not apply an override to an unrelated built-in', () => {
      loadCustom([{ id: Category.Groceries, label: 'Comida', color: '#f00' }])

      expect(resolveCategory(Category.Transport).label).toBe('Transporte')
    })
  })

  describe('custom categories', () => {
    it('resolves a custom category to its stored name, colour and icon', () => {
      loadCustom([
        { id: 'cafe', label: 'Café y bares', color: '#123456', icon: '☕' },
      ])

      expect(resolveCategory('cafe')).toEqual({
        id: 'cafe',
        label: 'Café y bares',
        color: '#123456',
        icon: '☕',
        isCustom: true,
        isIgnored: false,
        known: true,
      })
    })

    it('falls back to a label from the id and the default colour when a row has none', () => {
      loadCustom([{ id: 'home-office', label: '', color: '' }])

      expect(resolveCategory('home-office')).toMatchObject({
        label: 'Home office',
        color: DEFAULT_CATEGORY_COLOR,
        isCustom: true,
      })
    })

    it('ignores surrounding whitespace in a stored id', () => {
      loadCustom([{ id: 'viajes', label: 'Viajes', color: '#123456' }])

      expect(resolveCategory(' viajes ')).toEqual(resolveCategory('viajes'))
      expect(normalizeCategoryId(' Viajes ')).toBe('viajes')
    })

    it('uses the default icon for a custom category without one', () => {
      loadCustom([{ id: 'my-custom', label: 'Mi categoría', color: '#f00' }])

      expect(resolveCategory('my-custom').icon).toBe('🏷️')
    })

    it('honours a custom category flagged as ignored', () => {
      loadCustom([
        {
          id: 'reintegros',
          label: 'Reintegros',
          color: '#f00',
          isIgnored: true,
        },
      ])

      expect(isIgnored('reintegros')).toBe(true)
    })

    it('picks up categories loaded after a first lookup', () => {
      expect(resolveCategory('cafe').known).toBe(false)

      loadCustom([{ id: 'cafe', label: 'Café', color: '#123456' }])

      expect(resolveCategory('cafe').label).toBe('Café')
      expect(resolveCategory('cafe').known).toBe(true)
    })
  })

  describe('ids with no definition (e.g. a deleted custom category)', () => {
    it('keeps the id and labels it from the id, never as Sin categoría', () => {
      expect(resolveCategory('home_office')).toEqual({
        id: 'home_office',
        label: 'Home office',
        color: resolveCategory(Category.Uncategorized).color,
        icon: '🏷️',
        isCustom: false,
        isIgnored: false,
        known: false,
      })
      expect(resolveCategory('non-existent-category').label).toBe(
        'Non existent category'
      )
    })

    it('lowercases the id it keeps', () => {
      expect(resolveCategory('Home_Office').id).toBe('home_office')
    })
  })

  describe("the 'ignored' id written by Ignorar", () => {
    it('is a known pseudo-category that never counts toward totals', () => {
      expect(resolveCategory('ignored')).toMatchObject({
        id: 'ignored',
        label: 'Ignorada',
        isIgnored: true,
        isCustom: false,
        known: true,
      })
      expect(isIgnored('IGNORED')).toBe(true)
    })
  })

  it('always returns the id normalizeCategoryId groups rows under', () => {
    loadCustom([
      { id: 'cafe', label: 'Café', color: '#123456' },
      { id: Category.Groceries, label: 'Comida', color: '#f00' },
    ])
    const ids = [
      undefined,
      null,
      '',
      'groceries',
      'GROCERIES',
      'food',
      'transfer',
      'transfers',
      'other',
      'cafe',
      'CAFE',
      'ignored',
      'Ignored',
      'home_office',
      'Viajes-Familia',
    ]
    for (const id of ids) {
      expect(resolveCategory(id).id).toBe(normalizeCategoryId(id))
    }
  })

  it('agrees with getCategoryDefinitions on every listed category', () => {
    loadCustom([
      {
        id: 'transfer',
        label: 'Transferencias internas',
        color: '#ff0000',
        isIgnored: false,
      },
      { id: 'cafe', label: 'Café', color: '#123456', isIgnored: true },
      // Stored before slugs were lowercased.
      { id: 'Viajes-Familia', label: 'Viajes', color: '#654321' },
    ])

    const defs = getCategoryDefinitions()
    expect(defs.map((d) => d.id)).toContain('viajes-familia')
    for (const def of defs) {
      expect(resolveCategory(def.id)).toEqual(def)
      expect(resolveCategory(def.id.toUpperCase())).toEqual(def)
    }
  })

  it('falls back to the built-in icon when an override stores an empty one', () => {
    loadCustom([
      { id: Category.Groceries, label: 'Comida', color: '#f00', icon: '' },
      { id: 'cafe', label: 'Café', color: '#123456', icon: '' },
    ])

    expect(resolveCategory(Category.Groceries).icon).toBe('🛒')
    expect(resolveCategory('cafe').icon).toBe('🏷️')
    for (const def of getCategoryDefinitions()) {
      expect(def.icon).not.toBe('')
    }
  })
})

describe('isCategoryIgnored (the cheap form of resolveCategory(id).isIgnored)', () => {
  it('agrees with resolveCategory for every kind of id', () => {
    const ids = [
      undefined,
      null,
      '',
      'groceries',
      'transfer',
      'Internal_Transfer',
      'ignored',
      'IGNORED',
      'cafe',
      'reintegros',
      'home_office',
    ]
    const stores: CustomCategory[][] = [
      [],
      [
        { id: 'cafe', label: 'Café', color: '#123456' },
        {
          id: 'reintegros',
          label: 'Reintegros',
          color: '#f00',
          isIgnored: true,
        },
        { id: 'transfer', label: 'Transf', color: '#f00', isIgnored: false },
        { id: 'ignored', label: 'Ignorados', color: '#f00' },
        {
          id: Category.Uncategorized,
          label: 'Sin categoría',
          color: '#94a3b8',
          isIgnored: true,
        },
      ],
    ]
    for (const rows of stores) {
      loadCustom(rows)
      for (const id of ids) {
        expect(isCategoryIgnored(id)).toBe(resolveCategory(id).isIgnored)
      }
    }
    expect(isCategoryIgnored('ignored')).toBe(true)
    expect(isCategoryIgnored('reintegros')).toBe(true)
    expect(isCategoryIgnored('transfer')).toBe(false)
  })
})

describe("a legacy custom row keyed 'ignored'", () => {
  it('keeps Ignorar rows out of totals unless the row says otherwise', () => {
    // Rows written before 'ignored' was reserved: with no recorded flag they
    // must not let "Ignorar" rows back into totals.
    loadCustom([{ id: 'ignored', label: 'Ignorados', color: '#f00' }])
    expect(resolveCategory('ignored')).toMatchObject({
      label: 'Ignorados',
      isIgnored: true,
    })

    loadCustom([
      { id: 'ignored', label: 'Ignorados', color: '#f00', isIgnored: false },
    ])
    expect(resolveCategory('ignored').isIgnored).toBe(false)
  })
})

describe('an archived (deleted) custom category', () => {
  it('stops resolving to its stored name but stays its own category', () => {
    loadCustom([
      { id: 'viajes-familia', label: 'Viajes', color: '#123456', icon: '✈️' },
    ])
    removeCustomCategory('viajes-familia')

    // Archived rows are not loaded, so the stored name is gone: the row keeps
    // its id and is labelled from it — not "Sin categoría", not ignored.
    expect(resolveCategory('viajes-familia')).toMatchObject({
      id: 'viajes-familia',
      label: 'Viajes familia',
      isIgnored: false,
      known: false,
    })
    expect(getCategoryDefinitions().map((d) => d.id)).not.toContain(
      'viajes-familia'
    )
  })
})

describe('resolveCategory(...).isIgnored', () => {
  it('is true for transfers by default, false for other built-ins', () => {
    expect(isIgnored(Category.InternalTransfer)).toBe(true)
    expect(isIgnored(Category.ExternalTransfer)).toBe(true)
    expect(isIgnored(Category.Groceries)).toBe(false)
    expect(isIgnored(Category.Income)).toBe(false)
  })

  it('treats a missing id exactly like Sin categoría', () => {
    // A row with no category counts under "Sin categoría" everywhere (donut,
    // filters), so ignoring that category drops it from totals too.
    expect(isIgnored(undefined)).toBe(false)
    loadCustom([
      {
        id: Category.Uncategorized,
        label: 'Sin categoría',
        color: '#94a3b8',
        isIgnored: true,
      },
    ])
    expect(isIgnored(undefined)).toBe(true)
    expect(isIgnored('')).toBe(true)
  })

  it('follows a custom override that sets isIgnored', () => {
    loadCustom([
      {
        id: Category.Shopping,
        label: 'Compras',
        color: '#f00',
        isIgnored: true,
      },
    ])
    expect(isIgnored(Category.Shopping)).toBe(true)

    loadCustom([
      {
        id: Category.Shopping,
        label: 'Compras',
        color: '#f00',
        isIgnored: false,
      },
    ])
    expect(isIgnored(Category.Shopping)).toBe(false)
  })

  it('is true for pre-rename transfer ids stored on transactions', () => {
    expect(isIgnored('transfer')).toBe(true)
    expect(isIgnored('transfers')).toBe(true)
  })

  it('ignores casing on stored ids', () => {
    expect(isIgnored('Internal_Transfer')).toBe(true)
    expect(isIgnored('IGNORED')).toBe(true)
  })

  it('prefers the current-id override whatever order the rows arrive in', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Rows written before upsertBuiltinOverride updated alias rows in place
    // can hold both ids; Supabase returns custom_categories without an ORDER BY, so the stale
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
      loadCustom(rows)
      expect(isIgnored(Category.InternalTransfer)).toBe(false)
      expect(isIgnored('transfer')).toBe(false)
      expect(
        getCategoryDefinitions().find((c) => c.id === Category.InternalTransfer)
          ?.isIgnored
      ).toBe(false)
    }
    expect(warn).toHaveBeenCalled()
  })

  it('keeps the transfer default when a legacy row records no preference', () => {
    // A row with no recorded preference must fall through to the built-in
    // default rather than read as an explicit "not ignored" and let transfers
    // back into totals. Defensive: schema.sql has is_ignored NOT NULL DEFAULT
    // false, so today only the in-memory store can produce undefined.
    loadCustom([
      {
        id: 'transfer',
        label: 'Transferencias',
        color: '#ff0000',
        isIgnored: undefined,
      },
    ])

    expect(isIgnored(Category.InternalTransfer)).toBe(true)
    expect(isIgnored('transfer')).toBe(true)
  })

  it('lets the Categorías toggle override a legacy alias row', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // A pre-existing row keyed by an alias ('food' -> groceries) controls the
    // built-in's ignore flag. A row keyed by the current id (written before
    // alias rows were updated in place) must win when both are stored.
    loadCustom([
      { id: 'food', label: 'Food', color: '#ff0000', isIgnored: true },
    ])
    expect(isIgnored(Category.Groceries)).toBe(true)

    loadCustom([
      { id: 'food', label: 'Food', color: '#ff0000', isIgnored: true },
      {
        id: Category.Groceries,
        label: 'Alimentación',
        color: '#ff0000',
        isIgnored: false,
      },
    ])
    expect(isIgnored(Category.Groceries)).toBe(false)
    expect(warn).toHaveBeenCalled()
  })
})

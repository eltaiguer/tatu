import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addCustomCategory,
  addCustomCategoryWithSync,
  listCustomCategories,
  removeCustomCategory,
  removeCustomCategoryWithSync,
  replaceCustomCategories,
  setCategoryHouseholdWithSync,
  updateCustomCategory,
  updateCustomCategoryWithSync,
  upsertBuiltinOverride,
  upsertBuiltinOverrideWithSync,
  type CustomCategory,
} from './category-store'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../repository/in-memory-repository'
import { workspaceStore } from '../../stores/workspace-state'
import { CATEGORY_COLORS, CATEGORY_LABELS, Category } from '../../models'
import { UserFacingError } from '../../utils/user-error'
import { resolveCategory } from './category-registry'

describe('Custom category store', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('adds and lists custom categories', () => {
    addCustomCategory({ label: 'Coffee', color: '#ff0000' })

    const categories = listCustomCategories()
    expect(categories).toHaveLength(1)
    expect(categories[0].label).toBe('Coffee')
    expect(categories[0].color).toBe('#ff0000')
  })

  it('never hands a custom category a reserved built-in or alias id', () => {
    // 'food' is an ID_ALIASES key for groceries; a custom category taking it
    // would override Alimentación's ignore flag in every total.
    const food = addCustomCategory({ label: 'Food', color: '#ff0000' })
    expect(food.id).not.toBe('food')

    const groceries = addCustomCategory({
      label: 'Groceries',
      color: '#00ff00',
    })
    expect(groceries.id).not.toBe('groceries')

    // Still a usable, unique id rather than a collision or an empty string
    expect(food.id).toMatch(/^food-\d+$/)
    expect(new Set([food.id, groceries.id]).size).toBe(2)
  })

  it('never hands a custom category the legacy ignored id', () => {
    // resolveCategory treats 'ignored' as ignore-by-default, so a category
    // slugged that way would silently drop its transactions from every total.
    const c = addCustomCategory({ label: 'Ignored', color: '#ff0000' })
    expect(c.id).not.toBe('ignored')
  })

  it('does not treat inherited Object properties as reserved ids', () => {
    const c = addCustomCategory({ label: 'Constructor', color: '#ff0000' })
    expect(c.id).toBe('constructor')
  })

  it('updates a custom category', () => {
    const category = addCustomCategory({
      label: 'Coffee',
      color: '#ff0000',
      icon: '☕',
    })
    updateCustomCategory(category.id, { color: '#00ff00', icon: '🫖' })

    const updated = listCustomCategories()[0]
    expect(updated.color).toBe('#00ff00')
    expect(updated.icon).toBe('🫖')
  })

  it('removes a custom category', () => {
    const category = addCustomCategory({ label: 'Coffee', color: '#ff0000' })
    removeCustomCategory(category.id)

    expect(listCustomCategories()).toEqual([])
  })

  describe('saved through the repository it is given (#119)', () => {
    let repo: InMemoryRepository

    beforeEach(() => {
      repo = createInMemoryRepository()
      workspaceStore.setState({ userId: repo.userId, status: 'ready' })
    })

    it('saves add/update/remove on the server', async () => {
      const created = await addCustomCategoryWithSync(repo, {
        label: 'Cloud Category',
        color: '#112233',
      })
      expect(repo.customCategories.get(created.id)?.label).toBe(
        'Cloud Category'
      )

      await updateCustomCategoryWithSync(repo, created.id, {
        label: 'Cloud Category 2',
      })
      expect(repo.customCategories.get(created.id)?.label).toBe(
        'Cloud Category 2'
      )

      await removeCustomCategoryWithSync(repo, created.id)
      expect(repo.customCategories.get(created.id)?.isArchived).toBe(true)
      expect(listCustomCategories()).toEqual([])
    })

    it('saves the isIgnored flag on add and update', async () => {
      const created = await addCustomCategoryWithSync(repo, {
        label: 'Reembolsos',
        color: '#112233',
        isIgnored: true,
      })
      expect(repo.customCategories.get(created.id)?.isIgnored).toBe(true)

      await updateCustomCategoryWithSync(repo, created.id, {
        isIgnored: false,
      })
      expect(repo.customCategories.get(created.id)?.isIgnored).toBe(false)
    })

    it('removes a new category whose remote save failed', async () => {
      repo.failOn('upsertCustomCategory', { error: new Error('timeout') })

      await expect(
        addCustomCategoryWithSync(repo, { label: 'Viajes', color: '#112233' })
      ).rejects.toThrow('timeout')
      expect(listCustomCategories()).toEqual([])
    })

    it('restores only the edited category when its save fails', async () => {
      const a = await addCustomCategoryWithSync(repo, {
        label: 'A',
        color: '#111111',
      })
      const b = await addCustomCategoryWithSync(repo, {
        label: 'B',
        color: '#222222',
      })
      repo.failOn('upsertCustomCategory', {
        times: 1,
        error: new Error('timeout'),
      })

      await expect(
        updateCustomCategoryWithSync(repo, a.id, { label: 'A2' })
      ).rejects.toThrow('timeout')
      expect(listCustomCategories().map((c) => c.label)).toEqual(['A', 'B'])
      expect(listCustomCategories().find((c) => c.id === b.id)).toBeDefined()
    })

    it('puts back a category whose remote archive failed', async () => {
      const a = await addCustomCategoryWithSync(repo, {
        label: 'A',
        color: '#111111',
      })
      repo.failOn('archiveCustomCategory', { error: new Error('timeout') })

      await expect(removeCustomCategoryWithSync(repo, a.id)).rejects.toThrow(
        'timeout'
      )
      expect(listCustomCategories().map((c) => c.id)).toEqual([a.id])
    })

    it("refuses a write for a user whose workspace isn't loaded", async () => {
      workspaceStore.setState({ userId: 'someone-else', status: 'ready' })

      await expect(
        addCustomCategoryWithSync(repo, { label: 'A', color: '#111111' })
      ).rejects.toThrow(/sesión/)
      expect(listCustomCategories()).toEqual([])
      expect(repo.customCategories.size).toBe(0)
    })

    it("does not roll back into another user's categories after a switch", async () => {
      const gate = repo.hold('upsertCustomCategory')
      repo.failOn('upsertCustomCategory', { error: new Error('timeout') })
      const pending = addCustomCategoryWithSync(repo, {
        label: 'A',
        color: '#111111',
      }).catch((e: unknown) => e)

      // Another user signs in and loads a category with the same id.
      workspaceStore.setState({ userId: 'user-b', status: 'ready' })
      replaceCustomCategories([{ id: 'a', label: 'A de B', color: '#000' }])
      gate.release()
      await pending

      expect(listCustomCategories().map((c) => c.label)).toEqual(['A de B'])
    })
  })
})

// Ids are case-insensitive. Rows stored before slugs were lowercased keep
// their stored casing on the server; the store normalizes them once, on the
// way in, and writes back under the stored id.
describe('legacy mixed-case category ids', () => {
  let repo: InMemoryRepository

  beforeEach(() => {
    replaceCustomCategories([])
    repo = createInMemoryRepository()
    workspaceStore.setState({ userId: repo.userId, status: 'ready' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists a loaded mixed-case row under its lowercase id', () => {
    replaceCustomCategories([
      { id: 'Viajes-Familia', label: 'Viajes', color: '#123456' },
    ])

    expect(listCustomCategories().map((c) => c.id)).toEqual(['viajes-familia'])
  })

  it('keeps one row per id when two differ only by case, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const legacy = { id: 'Viajes', label: 'Viajes viejo', color: '#111111' }
    const current = { id: 'viajes', label: 'Viajes', color: '#222222' }

    for (const rows of [
      [legacy, current],
      [current, legacy],
    ]) {
      replaceCustomCategories(rows)
      expect(listCustomCategories()).toEqual([
        expect.objectContaining({ id: 'viajes', label: 'Viajes' }),
      ])
    }
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Viajes"'))
  })

  it('edits and archives the stored row, never a lowercase duplicate', async () => {
    await repo.upsertCustomCategory({
      id: 'Home-Office',
      label: 'Home office',
      color: '#123456',
    })
    replaceCustomCategories([
      { id: 'Home-Office', label: 'Home office', color: '#123456' },
    ])
    const [visible] = listCustomCategories()

    await updateCustomCategoryWithSync(repo, visible.id, { label: 'Oficina' })
    expect(listCustomCategories()[0].label).toBe('Oficina')
    expect(repo.customCategories.get('Home-Office')?.label).toBe('Oficina')
    expect(repo.customCategories.has('home-office')).toBe(false)

    await removeCustomCategoryWithSync(repo, visible.id)
    expect(listCustomCategories()).toEqual([])
    expect(repo.customCategories.get('Home-Office')?.isArchived).toBe(true)
    expect(repo.customCategories.has('home-office')).toBe(false)
  })

  it('never hands a new category the id of a mixed-case row', () => {
    replaceCustomCategories([
      { id: 'Home-Office', label: 'Home office', color: '#123456' },
    ])

    const created = addCustomCategory({ label: 'Home office', color: '#f00' })

    expect(created.id).toBe('home-office-2')
    expect(listCustomCategories().map((c) => c.id)).toEqual([
      'home-office',
      'home-office-2',
    ])
  })

  it('updates a mixed-case built-in override in place', async () => {
    await repo.upsertCustomCategory({
      id: 'Groceries',
      label: 'Súper',
      color: '#123456',
    })
    replaceCustomCategories([
      { id: 'Groceries', label: 'Súper', color: '#123456' },
    ])

    await upsertBuiltinOverrideWithSync(repo, 'groceries', { isIgnored: true })

    expect(listCustomCategories()).toEqual([
      expect.objectContaining({ id: 'groceries', isIgnored: true }),
    ])
    expect(repo.customCategories.get('Groceries')?.isIgnored).toBe(true)
    expect(repo.customCategories.has('groceries')).toBe(false)
  })
})

// Several stored rows can name one category (ids differing only by case, or
// a pre-rename alias next to the current id). Every write goes to all of
// them, so the server converges and a deleted category can't come back from
// a row the screen never showed.
describe('rows that collapse into one category', () => {
  let repo: InMemoryRepository
  const seed = async (rows: CustomCategory[]) => {
    for (const row of rows) await repo.upsertCustomCategory(row)
    replaceCustomCategories(rows)
  }

  beforeEach(() => {
    replaceCustomCategories([])
    repo = createInMemoryRepository()
    workspaceStore.setState({ userId: repo.userId, status: 'ready' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('archives every collapsed row on delete', async () => {
    await seed([
      { id: 'Viajes', label: 'Viajes viejo', color: '#111111' },
      { id: 'viajes', label: 'Viajes', color: '#222222' },
    ])

    await removeCustomCategoryWithSync(repo, 'viajes')

    expect(repo.customCategories.get('Viajes')?.isArchived).toBe(true)
    expect(repo.customCategories.get('viajes')?.isArchived).toBe(true)
  })

  it('sends an edit to every collapsed row', async () => {
    await seed([
      {
        id: 'Viajes',
        label: 'Viajes viejo',
        color: '#111111',
        isIgnored: true,
      },
      { id: 'viajes', label: 'Viajes', color: '#222222' },
    ])

    await updateCustomCategoryWithSync(repo, 'viajes', { label: 'Paseos' })

    for (const id of ['Viajes', 'viajes']) {
      expect(repo.customCategories.get(id)).toMatchObject({
        label: 'Paseos',
        color: '#222222',
        isIgnored: false,
      })
    }
  })

  it('warns about diverging rows only until a write converges them', async () => {
    const warn = vi.mocked(console.warn)
    await seed([
      { id: 'Viajes', label: 'Viajes viejo', color: '#111111' },
      { id: 'viajes', label: 'Viajes', color: '#222222' },
    ])
    expect(warn).toHaveBeenCalledTimes(1)

    await updateCustomCategoryWithSync(repo, 'viajes', { label: 'Paseos' })
    warn.mockClear()
    replaceCustomCategories(Array.from(repo.customCategories.values()))

    expect(warn).not.toHaveBeenCalled()
  })

  it('folds a pre-rename alias row into its built-in and updates it in place', async () => {
    await seed([{ id: 'transfer', label: 'Transferencias', color: '#0284c7' }])

    expect(listCustomCategories().map((c) => c.id)).toEqual([
      'internal_transfer',
    ])

    await upsertBuiltinOverrideWithSync(repo, 'internal_transfer', {
      isIgnored: false,
    })

    expect(repo.customCategories.get('transfer')?.isIgnored).toBe(false)
    expect(repo.customCategories.has('internal_transfer')).toBe(false)
  })
})

describe('upsertBuiltinOverride', () => {
  afterEach(() => replaceCustomCategories([]))

  it("keeps the built-in's own label when only the ignore flag changes", () => {
    upsertBuiltinOverride(Category.Groceries, { isIgnored: true })

    expect(
      listCustomCategories().find((c) => c.id === Category.Groceries)?.label
    ).toBe(CATEGORY_LABELS[Category.Groceries])
  })

  it("keeps the built-in's own colour when only the label changes", () => {
    upsertBuiltinOverride(Category.Groceries, { label: 'Súper' })

    expect(
      listCustomCategories().find((c) => c.id === Category.Groceries)?.color
    ).toBe(CATEGORY_COLORS[Category.Groceries])
  })
})

describe('household default of a category (#251, ADR-0005)', () => {
  let repo: InMemoryRepository
  const byId = (id: string) => listCustomCategories().find((c) => c.id === id)

  beforeEach(() => {
    replaceCustomCategories([])
    repo = createInMemoryRepository()
    workspaceStore.setState({ userId: repo.userId, status: 'ready' })
  })
  afterEach(() => replaceCustomCategories([]))

  it('stores a built-in’s default as an override row, leaving its label, colour and ignore flag alone', async () => {
    await setCategoryHouseholdWithSync(repo, Category.Restaurants, true)

    expect(byId(Category.Restaurants)).toMatchObject({
      label: CATEGORY_LABELS[Category.Restaurants],
      color: CATEGORY_COLORS[Category.Restaurants],
      isHousehold: true,
    })
    expect(repo.customCategories.get(Category.Restaurants)).toMatchObject({
      label: CATEGORY_LABELS[Category.Restaurants],
      color: CATEGORY_COLORS[Category.Restaurants],
      isHousehold: true,
      isIgnored: false,
    })
  })

  it('keeps following the shipped default colour after the override row is created', async () => {
    await setCategoryHouseholdWithSync(repo, Category.Restaurants, false)

    expect(resolveCategory(Category.Restaurants).color).toBe(
      CATEGORY_COLORS[Category.Restaurants]
    )
  })

  it('clears a built-in’s default with null, locally and on the server', async () => {
    await setCategoryHouseholdWithSync(repo, Category.Restaurants, true)

    await setCategoryHouseholdWithSync(repo, Category.Restaurants, null)

    expect(byId(Category.Restaurants)?.isHousehold).toBeUndefined()
    expect(
      repo.customCategories.get(Category.Restaurants)?.isHousehold
    ).toBeUndefined()
  })

  it('keeps a stored false as false (a choice, not a clear)', async () => {
    await setCategoryHouseholdWithSync(repo, Category.Groceries, false)

    expect(byId(Category.Groceries)?.isHousehold).toBe(false)
    expect(repo.customCategories.get(Category.Groceries)?.isHousehold).toBe(
      false
    )
  })

  it('updates a custom category’s own row', async () => {
    const created = await addCustomCategoryWithSync(repo, {
      label: 'Mascotas',
      color: '#112233',
    })

    await setCategoryHouseholdWithSync(repo, created.id, true)

    expect(byId(created.id)).toMatchObject({
      label: 'Mascotas',
      isHousehold: true,
    })
    expect(repo.customCategories.get(created.id)).toMatchObject({
      label: 'Mascotas',
      isHousehold: true,
    })
    await setCategoryHouseholdWithSync(repo, created.id, null)
    expect(repo.customCategories.get(created.id)?.isHousehold).toBeUndefined()
  })

  it('refuses Sin categoría, under its id and its old alias', async () => {
    for (const id of [Category.Uncategorized, 'other']) {
      await expect(
        setCategoryHouseholdWithSync(repo, id, true)
      ).rejects.toThrow(UserFacingError)
    }
    expect(listCustomCategories()).toEqual([])
    expect(repo.customCategories.size).toBe(0)
  })

  it('refuses a category that does not exist', async () => {
    await expect(
      setCategoryHouseholdWithSync(repo, 'no-such-category', true)
    ).rejects.toThrow(UserFacingError)
    expect(repo.customCategories.size).toBe(0)
  })

  it('writes under the normalized id, so an old alias reaches the built-in', async () => {
    await setCategoryHouseholdWithSync(repo, 'food', true)

    expect(byId(Category.Groceries)?.isHousehold).toBe(true)
    expect(repo.customCategories.get(Category.Groceries)?.isHousehold).toBe(
      true
    )
  })

  it('puts the previous state back when the save fails', async () => {
    await setCategoryHouseholdWithSync(repo, Category.Restaurants, true)
    repo.failOn('upsertCustomCategory', { error: new Error('timeout') })

    await expect(
      setCategoryHouseholdWithSync(repo, Category.Restaurants, false)
    ).rejects.toThrow('timeout')
    expect(byId(Category.Restaurants)?.isHousehold).toBe(true)

    await expect(
      setCategoryHouseholdWithSync(repo, Category.Groceries, true)
    ).rejects.toThrow('timeout')
    expect(byId(Category.Groceries)).toBeUndefined()
  })

  it('puts a failed clear back too', async () => {
    await setCategoryHouseholdWithSync(repo, Category.Restaurants, true)
    repo.failOn('upsertCustomCategory', { error: new Error('timeout') })

    await expect(
      setCategoryHouseholdWithSync(repo, Category.Restaurants, null)
    ).rejects.toThrow('timeout')

    expect(byId(Category.Restaurants)?.isHousehold).toBe(true)
  })

  it('keeps the default when the label is edited', async () => {
    const created = await addCustomCategoryWithSync(repo, {
      label: 'Mascotas',
      color: '#112233',
    })
    await setCategoryHouseholdWithSync(repo, created.id, true)

    await updateCustomCategoryWithSync(repo, created.id, { label: 'Perro' })

    expect(byId(created.id)?.isHousehold).toBe(true)
    expect(repo.customCategories.get(created.id)).toMatchObject({
      label: 'Perro',
      isHousehold: true,
    })
  })

  it('does not write a household value on a plain category edit', async () => {
    const created = await addCustomCategoryWithSync(repo, {
      label: 'Mascotas',
      color: '#112233',
    })
    const saved = vi.spyOn(repo, 'upsertCustomCategory')

    await updateCustomCategoryWithSync(repo, created.id, { label: 'Perro' })

    // Absent, not null: a database without the column keeps accepting edits.
    expect(saved.mock.calls[0][0]).not.toHaveProperty('isHousehold')
  })

  it('treats stored rows that disagree on the default as different settings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    replaceCustomCategories([
      { id: 'groceries', label: 'Alimentación', color: '#111111' },
      {
        id: 'food',
        label: 'Alimentación',
        color: '#111111',
        isHousehold: false,
      },
    ])

    expect(warn).toHaveBeenCalledTimes(1)
    // The row under the current id wins.
    expect(byId('groceries')?.isHousehold).toBeUndefined()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addCustomCategory,
  addCustomCategoryWithSync,
  listCustomCategories,
  removeCustomCategory,
  removeCustomCategoryWithSync,
  replaceCustomCategories,
  updateCustomCategory,
  updateCustomCategoryWithSync,
  upsertBuiltinOverrideWithSync,
} from './category-store'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../repository/in-memory-repository'
import { workspaceStore } from '../../stores/workspace-state'

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

import { describe, it, expect, beforeEach } from 'vitest'
import {
  addCustomCategory,
  addCustomCategoryWithSync,
  listCustomCategories,
  removeCustomCategory,
  removeCustomCategoryWithSync,
  replaceCustomCategories,
  updateCustomCategory,
  updateCustomCategoryWithSync,
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
    // isCategoryIgnored treats 'ignored' as ignore-by-default, so a category
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

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  addCustomCategory,
  addCustomCategoryWithSync,
  listCustomCategories,
  removeCustomCategory,
  removeCustomCategoryWithSync,
  updateCustomCategory,
  updateCustomCategoryWithSync,
} from './category-store'

const {
  getActiveSupabaseSessionMock,
  upsertCustomCategoryMock,
  archiveCustomCategoryMock,
} = vi.hoisted(() => ({
  getActiveSupabaseSessionMock: vi.fn(),
  upsertCustomCategoryMock: vi.fn(),
  archiveCustomCategoryMock: vi.fn(),
}))

vi.mock('../supabase/runtime', () => ({
  getActiveSupabaseSession: getActiveSupabaseSessionMock,
}))

vi.mock('../supabase/custom-categories', () => ({
  upsertCustomCategory: upsertCustomCategoryMock,
  archiveCustomCategory: archiveCustomCategoryMock,
}))

describe('Custom category store', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it('adds and lists custom categories', () => {
    addCustomCategory({ label: 'Coffee', color: '#ff0000' })

    const categories = listCustomCategories()
    expect(categories).toHaveLength(1)
    expect(categories[0].label).toBe('Coffee')
    expect(categories[0].color).toBe('#ff0000')
  })

  it('updates a custom category', () => {
    const category = addCustomCategory({ label: 'Coffee', color: '#ff0000' })
    updateCustomCategory(category.id, { color: '#00ff00' })

    const updated = listCustomCategories()[0]
    expect(updated.color).toBe('#00ff00')
  })

  it('removes a custom category', () => {
    const category = addCustomCategory({ label: 'Coffee', color: '#ff0000' })
    removeCustomCategory(category.id)

    expect(listCustomCategories()).toEqual([])
  })

  it('syncs add/update/remove when session exists', async () => {
    getActiveSupabaseSessionMock.mockReturnValue({
      user: { id: 'user-1' },
    })
    upsertCustomCategoryMock.mockResolvedValue(undefined)
    archiveCustomCategoryMock.mockResolvedValue(undefined)

    const created = await addCustomCategoryWithSync({
      label: 'Cloud Category',
      color: '#112233',
    })

    await updateCustomCategoryWithSync(created.id, {
      label: 'Cloud Category 2',
    })
    await removeCustomCategoryWithSync(created.id)

    expect(upsertCustomCategoryMock).toHaveBeenCalledTimes(2)
    expect(archiveCustomCategoryMock).toHaveBeenCalledTimes(1)
  })
})

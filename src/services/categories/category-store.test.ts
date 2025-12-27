import { describe, it, expect, beforeEach } from 'vitest'
import {
  addCustomCategory,
  listCustomCategories,
  removeCustomCategory,
  updateCustomCategory,
} from './category-store'

describe('Custom category store', () => {
  beforeEach(() => {
    window.localStorage.clear()
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
})

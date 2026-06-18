import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomCategory } from '../services/categories/category-store'

const { listCustomCategoriesMock } = vi.hoisted(() => ({
  listCustomCategoriesMock: vi.fn<[], CustomCategory[]>(),
}))

vi.mock('../services/categories/category-store', () => ({
  listCustomCategories: listCustomCategoriesMock,
}))

import { Category } from '../models'
import { getCategoryDisplay } from './category-display'

describe('getCategoryDisplay', () => {
  beforeEach(() => {
    listCustomCategoriesMock.mockReturnValue([])
  })

  it('maps modern category ids', () => {
    const result = getCategoryDisplay('groceries')

    expect(result.id).toBe('groceries')
    expect(result.label).toBe('Alimentación')
    expect(result.icon).toBe('groceries')
  })

  it('maps legacy aliases to modern categories', () => {
    const result = getCategoryDisplay('food')

    expect(result.id).toBe('groceries')
    expect(result.label).toBe('Alimentación')
    expect(result.icon).toBe('groceries')
  })

  it('falls back to uncategorized for unknown ids', () => {
    const result = getCategoryDisplay('non-existent-category')

    expect(result.id).toBe('non-existent-category')
    expect(result.label).toBe('Non existent category')
    expect(result.icon).toBe('uncategorized')
  })

  it('humanizes unknown category ids with underscores', () => {
    const result = getCategoryDisplay('home_office')

    expect(result.id).toBe('home_office')
    expect(result.label).toBe('Home office')
    expect(result.icon).toBe('uncategorized')
  })

  it('has label and icon for every built-in category', () => {
    Object.values(Category).forEach((category) => {
      const result = getCategoryDisplay(category)
      expect(result.label.length).toBeGreaterThan(0)
      expect(result.icon.length).toBeGreaterThan(0)
    })
  })

  it('reflects custom label and color override for a built-in category', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: Category.Groceries, label: 'Comida', color: '#ff0000' },
    ])

    const result = getCategoryDisplay(Category.Groceries)

    expect(result.label).toBe('Comida')
    expect(result.color).toBe('#ff0000')
    expect(result.icon).toBe('groceries')
    expect(result.id).toBe('groceries')
  })

  it('does not apply override to an unrelated built-in category', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: Category.Groceries, label: 'Comida', color: '#ff0000' },
    ])

    const result = getCategoryDisplay(Category.Transport)

    expect(result.label).toBe('Transporte')
    expect(result.icon).toBe('transport')
  })

  it('returns correct label and color for a custom (non-built-in) category', () => {
    listCustomCategoriesMock.mockReturnValue([
      { id: 'transferencias-internas', label: 'Transferencias internas', color: '#0284c7' },
    ])

    const result = getCategoryDisplay('transferencias-internas')

    expect(result.id).toBe('transferencias-internas')
    expect(result.label).toBe('Transferencias internas')
    expect(result.color).toBe('#0284c7')
    expect(result.icon).toBe('uncategorized')
  })

  it('still humanizes label for truly unknown ids not in custom store', () => {
    listCustomCategoriesMock.mockReturnValue([])

    const result = getCategoryDisplay('home_office')

    expect(result.label).toBe('Home office')
    expect(result.icon).toBe('uncategorized')
  })
})

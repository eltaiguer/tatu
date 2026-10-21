import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CategoryBadge } from './CategoryBadge'
import { Category } from '../models'
import { resolveCategory } from '../services/categories/category-registry'
import {
  addCustomCategory,
  replaceCustomCategories,
} from '../services/categories/category-store'

describe('CategoryBadge', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('renders readable label for modern categories', () => {
    render(<CategoryBadge categoryId="groceries" />)

    expect(screen.getByText('Alimentación')).toBeInTheDocument()
  })

  it('renders readable label for legacy category aliases', () => {
    render(<CategoryBadge categoryId="food" />)

    expect(screen.getByText('Alimentación')).toBeInTheDocument()
  })

  it('labels an unknown (e.g. deleted) category from its id, not as Sin categoría', () => {
    render(<CategoryBadge categoryId="unknown-category" />)

    expect(screen.getByText('Unknown category')).toBeInTheDocument()
    expect(screen.queryByText('Sin categoría')).not.toBeInTheDocument()
  })

  it('shows Sin categoría for a missing category', () => {
    render(<CategoryBadge categoryId={undefined} />)

    expect(screen.getByText('Sin categoría')).toBeInTheDocument()
  })

  it('renders all built-in categories with a label', () => {
    Object.values(Category).forEach((category) => {
      const { label } = resolveCategory(category)
      const { unmount } = render(<CategoryBadge categoryId={category} />)
      expect(screen.getByText(label)).toBeInTheDocument()
      unmount()
    })
  })

  it('renders custom category icon and color', () => {
    const custom = addCustomCategory({
      label: 'Coffee',
      color: '#123456',
      icon: '☕',
    })

    render(<CategoryBadge categoryId={custom.id} />)

    expect(screen.getByText('Coffee')).toBeInTheDocument()
    expect(screen.getByText('☕')).toBeInTheDocument()
  })
})

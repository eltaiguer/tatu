import { describe, it, expect, beforeEach } from 'vitest'
import {
  getMerchantCategoryOverride,
  setMerchantCategoryOverride,
  clearMerchantCategoryOverride,
  listMerchantCategoryOverrides,
  clearAllCategoryOverrides,
} from './category-overrides'
import { Category } from '../../models'

describe('Category Overrides', () => {
  beforeEach(() => {
    clearAllCategoryOverrides()
  })

  it('should set and get overrides using normalized merchant name', () => {
    setMerchantCategoryOverride('  Devoto Supermercado ', Category.Shopping)

    expect(getMerchantCategoryOverride('devoto supermercado')).toBe(
      Category.Shopping
    )
  })

  it('should clear an override', () => {
    setMerchantCategoryOverride('Farmashop', Category.Healthcare)
    clearMerchantCategoryOverride('Farmashop')

    expect(getMerchantCategoryOverride('Farmashop')).toBeNull()
  })

  it('should list overrides', () => {
    setMerchantCategoryOverride('Antel', Category.Utilities)
    setMerchantCategoryOverride('Netflix', Category.Entertainment)

    const overrides = listMerchantCategoryOverrides()
    expect(Object.keys(overrides)).toHaveLength(2)
    expect(overrides['antel'].category).toBe(Category.Utilities)
  })

  it('should persist overrides in localStorage', () => {
    setMerchantCategoryOverride('PedidosYa', Category.Restaurants)

    const stored = window.localStorage.getItem('tatu:categoryOverrides')
    expect(stored).toBeTruthy()
    expect(getMerchantCategoryOverride('PedidosYa')).toBe(Category.Restaurants)
  })
})

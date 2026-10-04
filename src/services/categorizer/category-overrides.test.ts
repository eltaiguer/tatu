import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearAllCategoryOverrides,
  clearMerchantCategoryOverride,
  getMerchantCategoryOverride,
  listMerchantCategoryOverrides,
  setMerchantCategoryOverride,
} from './category-overrides'
import { Category } from '../../models'

describe('Category overrides', () => {
  beforeEach(() => {
    clearAllCategoryOverrides()
  })

  it('sets and retrieves overrides', () => {
    setMerchantCategoryOverride('Netflix', Category.Entertainment)

    expect(getMerchantCategoryOverride('Netflix')).toBe(Category.Entertainment)
    expect(listMerchantCategoryOverrides()).toHaveProperty('netflix')
  })

  it('clears overrides', () => {
    setMerchantCategoryOverride('Devoto', Category.Groceries)
    clearMerchantCategoryOverride('Devoto')

    expect(getMerchantCategoryOverride('Devoto')).toBeNull()
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearAllCategoryOverrides,
  clearMerchantCategoryOverride,
  getMerchantCategoryOverride,
  listMerchantCategoryOverrides,
  replaceMerchantCategoryOverrides,
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

describe('Category overrides reach later rows of the same merchant (audit)', () => {
  beforeEach(() => {
    clearAllCategoryOverrides()
  })

  it('matches a row whose codes differ from the corrected one', () => {
    setMerchantCategoryOverride(
      'COMPRA CON TARJETA DEBITO KIOSCO X 12/03 15:22 AUT 123456',
      'healthcare'
    )

    expect(
      getMerchantCategoryOverride(
        'COMPRA CON TARJETA DEBITO KIOSCO X 20/03 09:01 AUT 654321'
      )
    ).toBe('healthcare')
  })

  it('still honours an override stored under the exact normalized description', () => {
    replaceMerchantCategoryOverrides({
      'kiosco x 12/03 aut 123456': {
        merchantName: 'KIOSCO X 12/03 AUT 123456',
        category: 'healthcare',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })

    expect(getMerchantCategoryOverride('KIOSCO X 12/03 AUT 123456')).toBe(
      'healthcare'
    )
  })

  it('clearing from the corrected row clears both key shapes', () => {
    replaceMerchantCategoryOverrides({
      'kiosco x 12/03 aut 123456': {
        merchantName: 'KIOSCO X 12/03 AUT 123456',
        category: 'healthcare',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })
    setMerchantCategoryOverride('KIOSCO X 12/03 AUT 123456', 'shopping')

    clearMerchantCategoryOverride('KIOSCO X 12/03 AUT 123456')

    expect(getMerchantCategoryOverride('KIOSCO X 12/03 AUT 123456')).toBe(null)
  })
})

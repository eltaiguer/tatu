import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  clearAllCategoryOverrides,
  clearMerchantCategoryOverride,
  clearMerchantCategoryOverrideWithSync,
  getMerchantCategoryOverride,
  listMerchantCategoryOverrides,
  setMerchantCategoryOverride,
  setMerchantCategoryOverrideWithSync,
} from './category-overrides'
import { Category } from '../../models'

const {
  getActiveSupabaseSessionMock,
  upsertCategoryOverrideMock,
  deleteCategoryOverrideMock,
} = vi.hoisted(() => ({
  getActiveSupabaseSessionMock: vi.fn(),
  upsertCategoryOverrideMock: vi.fn(),
  deleteCategoryOverrideMock: vi.fn(),
}))

vi.mock('../supabase/runtime', () => ({
  getActiveSupabaseSession: getActiveSupabaseSessionMock,
}))

vi.mock('../supabase/category-overrides', () => ({
  upsertCategoryOverride: upsertCategoryOverrideMock,
  deleteCategoryOverride: deleteCategoryOverrideMock,
}))

describe('Category overrides', () => {
  beforeEach(() => {
    clearAllCategoryOverrides()
    vi.clearAllMocks()
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

  it('syncs override changes when session exists', async () => {
    getActiveSupabaseSessionMock.mockReturnValue({
      user: { id: 'user-1' },
    })
    upsertCategoryOverrideMock.mockResolvedValue(undefined)
    deleteCategoryOverrideMock.mockResolvedValue(undefined)

    await setMerchantCategoryOverrideWithSync('Devoto', Category.Groceries)
    await clearMerchantCategoryOverrideWithSync('Devoto')

    expect(upsertCategoryOverrideMock).toHaveBeenCalledTimes(1)
    expect(deleteCategoryOverrideMock).toHaveBeenCalledTimes(1)
  })

  it('reports a failed remote save instead of swallowing it', async () => {
    getActiveSupabaseSessionMock.mockReturnValue({ user: { id: 'user-1' } })
    upsertCategoryOverrideMock.mockRejectedValue(new Error('timeout'))

    await expect(
      setMerchantCategoryOverrideWithSync('Devoto', Category.Groceries)
    ).rejects.toThrow('timeout')
    // The local rule still applies for this session.
    expect(getMerchantCategoryOverride('Devoto')).toBe(Category.Groceries)
  })
})

import { normalizeMerchantName } from './merchant-patterns'
import { invalidateLearnedPatternsCache } from './learned-patterns'

export interface CategoryOverride {
  merchantName?: string
  category: string
  updatedAt: string
}

export type CategoryOverrides = Record<string, CategoryOverride>

let overrides: CategoryOverrides = {}

export function getMerchantCategoryOverride(
  merchantName: string
): string | null {
  const normalized = normalizeMerchantName(merchantName)
  if (!normalized) {
    return null
  }

  return overrides[normalized]?.category ?? null
}

export function setMerchantCategoryOverride(
  merchantName: string,
  category: string
): void {
  const normalized = normalizeMerchantName(merchantName)
  if (!normalized) {
    return
  }

  overrides[normalized] = {
    category,
    merchantName,
    updatedAt: new Date().toISOString(),
  }
  invalidateLearnedPatternsCache()
}

export function clearMerchantCategoryOverride(merchantName: string): void {
  const normalized = normalizeMerchantName(merchantName)
  if (!normalized) {
    return
  }

  if (overrides[normalized]) {
    delete overrides[normalized]
    invalidateLearnedPatternsCache()
  }
}

export function listMerchantCategoryOverrides(): CategoryOverrides {
  return overrides
}

export function clearAllCategoryOverrides(): void {
  overrides = {}
}

export function replaceMerchantCategoryOverrides(
  nextOverrides: CategoryOverrides
): void {
  overrides = { ...nextOverrides }
}

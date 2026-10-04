import { normalizeMerchantName } from './merchant-patterns'
import { invalidateLearnedPatternsCache } from './learned-patterns'
import {
  deleteCategoryOverride,
  upsertCategoryOverride,
} from '../supabase/category-overrides'
import { getActiveSupabaseSession } from '../supabase/runtime'

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

// Puts a local entry back as it was when the remote write fails, so the
// screen never shows a rule the server didn't get.
function restoreOverride(
  key: string,
  previous: CategoryOverride | undefined
): void {
  if (previous) overrides[key] = previous
  else delete overrides[key]
  invalidateLearnedPatternsCache()
}

export async function setMerchantCategoryOverrideWithSync(
  merchantName: string,
  category: string
): Promise<void> {
  const normalized = normalizeMerchantName(merchantName)
  const previous = normalized ? overrides[normalized] : undefined
  setMerchantCategoryOverride(merchantName, category)
  if (!normalized) {
    return
  }

  // Remote failures propagate (after rolling back the local entry) so the
  // caller can tell the user the rule wasn't saved.
  try {
    const session = getActiveSupabaseSession()
    if (session) {
      await upsertCategoryOverride(session, {
        merchantNormalized: normalized,
        merchantOriginal: merchantName,
        category,
      })
    }
  } catch (error) {
    restoreOverride(normalized, previous)
    throw error
  }
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

export async function clearMerchantCategoryOverrideWithSync(
  merchantName: string
): Promise<void> {
  const normalized = normalizeMerchantName(merchantName)
  const previous = normalized ? overrides[normalized] : undefined
  clearMerchantCategoryOverride(merchantName)
  if (!normalized) {
    return
  }

  try {
    const session = getActiveSupabaseSession()
    if (session) {
      await deleteCategoryOverride(session, normalized)
    }
  } catch (error) {
    restoreOverride(normalized, previous)
    throw error
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

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

export async function setMerchantCategoryOverrideWithSync(
  merchantName: string,
  category: string
): Promise<void> {
  setMerchantCategoryOverride(merchantName, category)
  const normalized = normalizeMerchantName(merchantName)
  if (!normalized) {
    return
  }

  // Remote failures propagate: the local cache is already updated, but
  // the caller must know the change didn't reach the server or it
  // silently disappears on the next reload.
  const { getActiveSupabaseSession } = await import('../supabase/runtime')
  const session = getActiveSupabaseSession()
  if (session) {
    const { upsertCategoryOverride } =
      await import('../supabase/category-overrides')
    await upsertCategoryOverride(session, {
      merchantNormalized: normalized,
      merchantOriginal: merchantName,
      category,
    })
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
  clearMerchantCategoryOverride(merchantName)
  if (!normalized) {
    return
  }

  // Remote failures propagate: the local cache is already updated, but
  // the caller must know the change didn't reach the server or it
  // silently disappears on the next reload.
  const { getActiveSupabaseSession } = await import('../supabase/runtime')
  const session = getActiveSupabaseSession()
  if (session) {
    const { deleteCategoryOverride } =
      await import('../supabase/category-overrides')
    await deleteCategoryOverride(session, normalized)
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

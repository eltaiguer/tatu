import { normalizeMerchantName } from './merchant-patterns'

const STORAGE_KEY = 'tatu:categoryOverrides'

export interface CategoryOverride {
  merchantName?: string
  category: string
  updatedAt: string
}

export type CategoryOverrides = Record<string, CategoryOverride>

function hasLocalStorage(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  )
}

function loadOverrides(): CategoryOverrides {
  if (!hasLocalStorage()) {
    return {}
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as CategoryOverrides
    return parsed || {}
  } catch {
    return {}
  }
}

function saveOverrides(overrides: CategoryOverrides): void {
  if (!hasLocalStorage()) {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

export function getMerchantCategoryOverride(
  merchantName: string
): string | null {
  const normalized = normalizeMerchantName(merchantName)
  if (!normalized) {
    return null
  }

  const overrides = loadOverrides()
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

  const overrides = loadOverrides()
  overrides[normalized] = {
    category,
    merchantName,
    updatedAt: new Date().toISOString(),
  }
  saveOverrides(overrides)
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

  try {
    const { getActiveSupabaseSession } = await import('../supabase/runtime')
    const session = getActiveSupabaseSession()
    if (session) {
      const { upsertCategoryOverride } = await import(
        '../supabase/category-overrides'
      )
      await upsertCategoryOverride(session, {
        merchantNormalized: normalized,
        merchantOriginal: merchantName,
        category,
      })
    }
  } catch {
    // local override remains as fallback
  }
}

export function clearMerchantCategoryOverride(merchantName: string): void {
  const normalized = normalizeMerchantName(merchantName)
  if (!normalized) {
    return
  }

  const overrides = loadOverrides()
  if (overrides[normalized]) {
    delete overrides[normalized]
    saveOverrides(overrides)
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

  try {
    const { getActiveSupabaseSession } = await import('../supabase/runtime')
    const session = getActiveSupabaseSession()
    if (session) {
      const { deleteCategoryOverride } = await import(
        '../supabase/category-overrides'
      )
      await deleteCategoryOverride(session, normalized)
    }
  } catch {
    // local fallback already applied
  }
}

export function listMerchantCategoryOverrides(): CategoryOverrides {
  return loadOverrides()
}

export function clearAllCategoryOverrides(): void {
  if (!hasLocalStorage()) {
    return
  }

  window.localStorage.removeItem(STORAGE_KEY)
}

export function replaceMerchantCategoryOverrides(
  overrides: CategoryOverrides
): void {
  saveOverrides(overrides)
}

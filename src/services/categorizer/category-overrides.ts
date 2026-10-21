import { normalizeMerchantName } from './merchant-patterns'
import { buildDescriptionOverrideKey } from '../descriptions/normalization'
import type { CategoryOverrideRecord } from '../supabase/category-overrides'

export interface CategoryOverride {
  merchantName?: string
  category: string
  updatedAt: string
}

export type CategoryOverrides = Record<string, CategoryOverride>

/** Stored override rows as the in-memory map, keyed as they were stored. */
export function categoryOverridesFrom(
  records: CategoryOverrideRecord[]
): CategoryOverrides {
  return Object.fromEntries(
    records.map((record) => [
      record.merchantNormalized,
      {
        merchantName: record.merchantOriginal,
        category: record.category,
        updatedAt: record.updatedAt,
      },
    ])
  )
}

// Replaced, never mutated, on every write: a reader holding the previous
// object (a UserRules value) keeps a consistent view, and the patterns
// learned from an object (learned-patterns.ts) never go stale.
let overrides: CategoryOverrides = {}

/**
 * The key a merchant override is stored under: the normalized description
 * (lowercase, POS prefix dropped) with its per-transaction noise (dates,
 * times, auth codes, long numbers) stripped — the same key "Todas las
 * similares" selects past rows by, so a category set on one row reaches
 * the merchant's later rows too. Overrides stored before this, under the
 * exact normalized description, are still read (`merchant_original` is
 * nullable, so a one-time re-key on load could not reach every row).
 */
export function merchantOverrideKey(merchantName: string): string | null {
  const normalized = normalizeMerchantName(merchantName)
  return normalized ? buildDescriptionOverrideKey(normalized) : null
}

/** The exact-normalized key an older override of this row would sit under. */
export function legacyMerchantOverrideKey(merchantName: string): string | null {
  const exact = normalizeMerchantName(merchantName)
  return exact && exact !== merchantOverrideKey(merchantName) ? exact : null
}

function keysFor(merchantName: string): string[] {
  const keys: string[] = []
  const stripped = merchantOverrideKey(merchantName)
  if (stripped) keys.push(stripped)
  const legacy = legacyMerchantOverrideKey(merchantName)
  if (legacy) keys.push(legacy)
  return keys
}

/** The category an override in `from` gives this merchant, if any. */
export function findMerchantCategoryOverride(
  from: CategoryOverrides,
  merchantName: string
): string | null {
  for (const key of keysFor(merchantName)) {
    const category = from[key]?.category
    if (category) return category
  }
  return null
}

export function getMerchantCategoryOverride(
  merchantName: string
): string | null {
  return findMerchantCategoryOverride(overrides, merchantName)
}

// The two primitives mirror one server row each, so a write can apply to
// memory exactly what the server confirmed (transaction-mutations.ts).

export function putMerchantCategoryOverrideKey(
  key: string,
  merchantName: string,
  category: string
): void {
  overrides = {
    ...overrides,
    [key]: { category, merchantName, updatedAt: new Date().toISOString() },
  }
}

export function deleteMerchantCategoryOverrideKey(key: string): void {
  if (overrides[key]) {
    const next = { ...overrides }
    delete next[key]
    overrides = next
  }
}

/** Stores under the stripped key and drops the row's exact-key override. */
export function setMerchantCategoryOverride(
  merchantName: string,
  category: string
): void {
  const key = merchantOverrideKey(merchantName)
  if (!key) {
    return
  }
  putMerchantCategoryOverrideKey(key, merchantName, category)
  const legacy = legacyMerchantOverrideKey(merchantName)
  if (legacy) deleteMerchantCategoryOverrideKey(legacy)
}

export function clearMerchantCategoryOverride(merchantName: string): void {
  for (const key of keysFor(merchantName)) {
    deleteMerchantCategoryOverrideKey(key)
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

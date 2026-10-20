import { normalizeMerchantName } from './merchant-patterns'
import { invalidateLearnedPatternsCache } from './learned-patterns'
import { buildDescriptionOverrideKey } from '../descriptions/normalization'

export interface CategoryOverride {
  merchantName?: string
  category: string
  updatedAt: string
}

export type CategoryOverrides = Record<string, CategoryOverride>

let overrides: CategoryOverrides = {}

/**
 * The key a merchant override is stored under: the description with its
 * per-transaction noise (dates, times, auth codes, long numbers) stripped,
 * the same key "Todas las similares" selects past rows by, so a category
 * set on one row reaches the merchant's later rows too. Overrides stored
 * before this (keyed on the exact normalized description) are still read.
 */
export function merchantOverrideKey(merchantName: string): string | null {
  return buildDescriptionOverrideKey(merchantName)
}

function keysFor(merchantName: string): string[] {
  const keys: string[] = []
  const stripped = merchantOverrideKey(merchantName)
  if (stripped) keys.push(stripped)
  const exact = normalizeMerchantName(merchantName)
  if (exact && exact !== stripped) keys.push(exact)
  return keys
}

export function getMerchantCategoryOverride(
  merchantName: string
): string | null {
  for (const key of keysFor(merchantName)) {
    const category = overrides[key]?.category
    if (category) return category
  }
  return null
}

export function setMerchantCategoryOverride(
  merchantName: string,
  category: string
): void {
  const key = merchantOverrideKey(merchantName)
  if (!key) {
    return
  }

  overrides[key] = {
    category,
    merchantName,
    updatedAt: new Date().toISOString(),
  }
  invalidateLearnedPatternsCache()
}

export function clearMerchantCategoryOverride(merchantName: string): void {
  let cleared = false
  for (const key of keysFor(merchantName)) {
    if (overrides[key]) {
      delete overrides[key]
      cleared = true
    }
  }
  if (cleared) invalidateLearnedPatternsCache()
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

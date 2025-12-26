import { Category } from '../../models'
import { normalizeMerchantName } from './merchant-patterns'

const STORAGE_KEY = 'tatu:categoryOverrides'

interface CategoryOverride {
  category: Category
  updatedAt: string
}

type CategoryOverrides = Record<string, CategoryOverride>

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
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
): Category | null {
  const normalized = normalizeMerchantName(merchantName)
  if (!normalized) {
    return null
  }

  const overrides = loadOverrides()
  return overrides[normalized]?.category ?? null
}

export function setMerchantCategoryOverride(
  merchantName: string,
  category: Category
): void {
  const normalized = normalizeMerchantName(merchantName)
  if (!normalized) {
    return
  }

  const overrides = loadOverrides()
  overrides[normalized] = {
    category,
    updatedAt: new Date().toISOString(),
  }
  saveOverrides(overrides)
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

export function listMerchantCategoryOverrides(): CategoryOverrides {
  return loadOverrides()
}

export function clearAllCategoryOverrides(): void {
  if (!hasLocalStorage()) {
    return
  }

  window.localStorage.removeItem(STORAGE_KEY)
}

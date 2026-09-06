import {
  Category,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
} from '../../models'
import type { CustomCategory } from './category-store'
import { listCustomCategories } from './category-store'
import { memoizeByReference } from '../../utils/memo'
import { ID_ALIASES, resolveBuiltinAlias } from './category-aliases'

export { ID_ALIASES }

export interface CategoryDefinition {
  id: string
  label: string
  color: string
  icon: string
  isCustom?: boolean
  isIgnored?: boolean
  isOverridden?: boolean
}

const DEFAULT_CUSTOM_ICON = '🏷️'

// Override rows keyed by the category they actually apply to. A legacy row
// ('transfer') and a current one ('internal_transfer') can coexist —
// upsertBuiltinOverride matches on the exact id and appends otherwise — and
// Supabase returns custom_categories unordered, so resolution must not depend
// on array order: aliased rows claim their built-in first, then any row
// already keyed by the current id overwrites it. Memoized on the store's
// array identity, which every mutator replaces rather than mutating.
const resolvedOverrides = memoizeByReference((categories: CustomCategory[]) => {
  const map = new Map<string, CustomCategory>()
  categories.forEach((c) => {
    const normalized = c.id.toLowerCase()
    const resolved = resolveBuiltinAlias(normalized)
    if (resolved !== normalized) map.set(resolved, c)
  })
  categories.forEach((c) => {
    const normalized = c.id.toLowerCase()
    if (resolveBuiltinAlias(normalized) === normalized) map.set(normalized, c)
  })
  return map
})


export function getCategoryDefinitions(): CategoryDefinition[] {
  const customList = listCustomCategories()
  const builtinIds = new Set(Object.values(Category) as string[])
  const overrideMap = resolvedOverrides(customList)

  const builtin = Object.values(Category).map((category) => {
    const override = overrideMap.get(category)
    return {
      id: category,
      label: override?.label ?? CATEGORY_LABELS[category],
      color: override?.color ?? CATEGORY_COLORS[category],
      icon: override?.icon ?? CATEGORY_ICONS[category],
      isCustom: false,
      isIgnored: override?.isIgnored ?? isTransferCategoryId(category),
    }
  })

  const seenCustomIds = new Set<string>()
  const custom = customList
    .filter((c) => {
      if (builtinIds.has(resolveBuiltinAlias(c.id))) return false
      if (seenCustomIds.has(c.id)) return false
      seenCustomIds.add(c.id)
      return true
    })
    .map((c) => ({
      id: c.id,
      label: c.label,
      color: c.color,
      icon: c.icon || DEFAULT_CUSTOM_ICON,
      isCustom: true,
      isIgnored: c.isIgnored ?? false,
    }))

  return [...builtin, ...custom].sort((a, b) => {
    if (a.id === Category.Uncategorized) return 1
    if (b.id === Category.Uncategorized) return -1
    return a.label.localeCompare(b.label, 'es')
  })
}

export function getCategoryDefinition(
  id: string | undefined
): CategoryDefinition {
  const fallback = {
    id: Category.Uncategorized,
    label: CATEGORY_LABELS[Category.Uncategorized],
    color: CATEGORY_COLORS[Category.Uncategorized],
    icon: CATEGORY_ICONS[Category.Uncategorized],
  }

  if (!id) {
    return fallback
  }

  const normalizedId = id.toLowerCase()
  const resolvedId = resolveBuiltinAlias(normalizedId)
  const overrides = resolvedOverrides(listCustomCategories())

  if (Object.values(Category).includes(resolvedId as Category)) {
    const category = resolvedId as Category
    const override = overrides.get(resolvedId)
    return {
      id: category,
      label: override?.label ?? CATEGORY_LABELS[category],
      color: override?.color ?? CATEGORY_COLORS[category],
      icon: override?.icon ?? CATEGORY_ICONS[category],
      isIgnored: override?.isIgnored ?? isTransferCategoryId(category),
      isOverridden: !!override,
    }
  }

  const custom = overrides.get(resolvedId)
  if (!custom) {
    return fallback
  }

  return {
    id: custom.id,
    label: custom.label,
    color: custom.color,
    icon: custom.icon || DEFAULT_CUSTOM_ICON,
    isCustom: true,
    isIgnored: custom.isIgnored ?? false,
  }
}

function isTransferCategoryId(id: string): boolean {
  return id === Category.InternalTransfer || id === Category.ExternalTransfer
}


export function isCategoryIgnored(id: string | undefined): boolean {
  if (!id) return false
  // Resolve through ID_ALIASES first so pre-rename ids stored on transactions
  // ('transfer', 'transfers') and on override rows match their current built-in.
  const resolvedId = resolveBuiltinAlias(id.toLowerCase())
  const override = resolvedOverrides(listCustomCategories()).get(resolvedId)
  if (override?.isIgnored !== undefined) return override.isIgnored
  // Transfer categories and the legacy 'ignored' id are excluded by default
  return isTransferCategoryId(resolvedId) || resolvedId === 'ignored'
}

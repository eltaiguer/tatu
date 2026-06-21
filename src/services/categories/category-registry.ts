import {
  Category,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
} from '../../models'
import { listCustomCategories } from './category-store'

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

export const ID_ALIASES: Partial<Record<string, Category>> = {
  food: Category.Groceries,
  restaurant: Category.Restaurants,
  restaurants: Category.Restaurants,
  health: Category.Healthcare,
  salary: Category.Income,
  other: Category.Uncategorized,
  // backward-compat: old string values before rename
  transfer: Category.InternalTransfer,
  transfers: Category.ExternalTransfer,
}

export function getCategoryDefinitions(): CategoryDefinition[] {
  const customList = listCustomCategories()
  const builtinIds = new Set(Object.values(Category) as string[])
  const overrideMap = new Map(
    customList.filter((c) => builtinIds.has(c.id)).map((c) => [c.id, c])
  )

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
      if (builtinIds.has(c.id)) return false
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
  const resolvedId = ID_ALIASES[normalizedId] ?? normalizedId

  if (Object.values(Category).includes(resolvedId as Category)) {
    const category = resolvedId as Category
    const override = listCustomCategories().find((c) => c.id === resolvedId)
    return {
      id: category,
      label: override?.label ?? CATEGORY_LABELS[category],
      color: override?.color ?? CATEGORY_COLORS[category],
      icon: override?.icon ?? CATEGORY_ICONS[category],
      isIgnored: override?.isIgnored ?? isTransferCategoryId(category),
      isOverridden: !!override,
    }
  }

  const custom = listCustomCategories().find((category) => category.id === resolvedId)
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
  const override = listCustomCategories().find((c) => c.id === id)
  if (override?.isIgnored !== undefined) return override.isIgnored
  // Transfer categories and the legacy 'ignored' id are excluded by default
  return isTransferCategoryId(id) || id === 'ignored'
}

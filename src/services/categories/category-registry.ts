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
}

const DEFAULT_CUSTOM_ICON = '🏷️'

export function getCategoryDefinitions(): CategoryDefinition[] {
  const builtin = Object.values(Category).map((category) => ({
    id: category,
    label: CATEGORY_LABELS[category],
    color: CATEGORY_COLORS[category],
    icon: CATEGORY_ICONS[category],
    isCustom: false,
  }))

  const custom = listCustomCategories().map((category) => ({
    id: category.id,
    label: category.label,
    color: category.color,
    icon: category.icon || DEFAULT_CUSTOM_ICON,
    isCustom: true,
  }))

  return [...builtin, ...custom]
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

  if (Object.values(Category).includes(id as Category)) {
    const category = id as Category
    return {
      id: category,
      label: CATEGORY_LABELS[category],
      color: CATEGORY_COLORS[category],
      icon: CATEGORY_ICONS[category],
    }
  }

  const custom = listCustomCategories().find((category) => category.id === id)
  if (!custom) {
    return fallback
  }

  return {
    id: custom.id,
    label: custom.label,
    color: custom.color,
    icon: custom.icon || DEFAULT_CUSTOM_ICON,
    isCustom: true,
  }
}

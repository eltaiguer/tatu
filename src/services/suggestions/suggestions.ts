// Category and tag suggestions for the edit pickers (EditTransactionDialog,
// BulkEditDialog). The filters are pure; building the category list reads
// the custom-category registry.
import { Category } from '../../models'
import { listCustomCategories } from '../categories/category-store'
import { getCategoryDisplay } from '../../utils/category-display'

function uniqueTrimmed(values: Iterable<string>): string[] {
  return Array.from(
    new Set(
      Array.from(values)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  )
}

// Every built-in and custom category, plus `extra` ids (e.g. a row's
// legacy category), sorted by Spanish label.
export function buildCategorySuggestions(extra: string[] = []): string[] {
  return uniqueTrimmed([
    ...Object.values(Category),
    ...listCustomCategories().map((category) => category.id),
    ...extra,
  ]).sort((a, b) =>
    getCategoryDisplay(a).label.localeCompare(getCategoryDisplay(b).label, 'es')
  )
}

// Categories whose id or label contains the query (case-insensitive).
export function filterCategorySuggestions(
  categories: string[],
  query: string
): string[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return categories
  return categories.filter((category) => {
    const label = getCategoryDisplay(category).label.toLowerCase()
    return category.toLowerCase().includes(needle) || label.includes(needle)
  })
}

// Distinct tags, sorted in Spanish order.
export function buildTagSuggestions(tags: Iterable<string>): string[] {
  return uniqueTrimmed(tags).sort((a, b) => a.localeCompare(b, 'es'))
}

// Tags containing the query (case-insensitive).
export function filterTagSuggestions(tags: string[], query: string): string[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return tags
  return tags.filter((tag) => tag.toLowerCase().includes(needle))
}

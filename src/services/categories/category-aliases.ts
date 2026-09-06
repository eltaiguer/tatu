import { Category } from '../../models'

// Pre-rename category ids that may still be stored on transactions and on
// custom_categories rows. Lives in its own module so category-store can guard
// against slug collisions without importing the registry (which imports it).
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

export function resolveBuiltinAlias(id: string): string {
  return ID_ALIASES[id.toLowerCase()] ?? id
}

// True when the id is spoken for by a built-in category or one of its
// pre-rename aliases — such an id must never be handed to a custom category.
export function isReservedCategoryId(id: string): boolean {
  const normalized = id.toLowerCase()
  return (
    normalized in ID_ALIASES ||
    (Object.values(Category) as string[]).includes(normalized)
  )
}

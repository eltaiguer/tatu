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

// hasOwnProperty rather than `in`: ID_ALIASES is a plain object literal, so
// `'constructor' in ID_ALIASES` is true and the lookup yields a function.
function aliasFor(id: string): string | undefined {
  const normalized = id.toLowerCase()
  if (!Object.prototype.hasOwnProperty.call(ID_ALIASES, normalized)) {
    return undefined
  }
  const alias = ID_ALIASES[normalized]
  return typeof alias === 'string' ? alias : undefined
}

export function resolveBuiltinAlias(id: string): string {
  return aliasFor(id) ?? id
}

// True when the id is spoken for by a built-in category or one of its
// pre-rename aliases — such an id must never be handed to a custom category.
export function isReservedCategoryId(id: string): boolean {
  const normalized = id.toLowerCase()
  return (
    aliasFor(normalized) !== undefined ||
    (Object.values(Category) as string[]).includes(normalized)
  )
}

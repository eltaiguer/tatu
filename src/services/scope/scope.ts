import { Category } from '../../models'
import type { ResolvedScopeValue, Scope } from '../../models'
import { normalizeCategoryId } from '../categories/category-aliases'

// THE answer to "is this expense for the household or personal?" (Hogar /
// Personal / Sin definir). Every surface — the row toggle, the Ámbito filter,
// the Resumen mode — calls resolveScope; never re-derive it.

/**
 * Categories that start in Hogar until the user says otherwise. Every other
 * category, built-in or custom, starts in Personal; Sin categoría is
 * unassigned.
 */
export const SEEDED_HOUSEHOLD_CATEGORIES: ReadonlySet<string> = new Set<string>(
  [
    Category.Groceries,
    Category.Utilities,
    Category.Housing,
    Category.Healthcare,
    Category.Insurance,
    Category.Education,
    Category.Automotive,
  ]
)

/** The user's per-category choices, keyed by normalized category id. */
export type CategoryScopes = Readonly<Record<string, Scope>>

export interface ResolvedScope {
  scope: ResolvedScopeValue
  /** The row's own choice, not its category's. */
  isOverride: boolean
}

/** The scope a category's rows get when they carry no choice of their own. */
export function categoryScope(
  category: string | null | undefined,
  categoryScopes: CategoryScopes
): ResolvedScopeValue {
  const id = normalizeCategoryId(category)
  if (id === Category.Uncategorized) return 'unassigned'
  if (Object.prototype.hasOwnProperty.call(categoryScopes, id)) {
    return categoryScopes[id]
  }
  return SEEDED_HOUSEHOLD_CATEGORIES.has(id) ? 'household' : 'personal'
}

/**
 * Precedence: the row's own choice → the user's mapping for its category →
 * the seeded default. An uncategorized row without its own choice is
 * 'unassigned'.
 */
export function resolveScope(
  tx: { category?: string | null; scope?: Scope | null },
  categoryScopes: CategoryScopes
): ResolvedScope {
  if (tx.scope) return { scope: tx.scope, isOverride: true }
  return {
    scope: categoryScope(tx.category, categoryScopes),
    isOverride: false,
  }
}

import { Category } from '../../models'
import type { CategoryHousehold, HouseholdResolution } from '../../models'
import { normalizeCategoryId } from '../categories/category-aliases'
import {
  listCustomCategories,
  type CustomCategory,
} from '../categories/category-store'
import { memoizeByReference } from '../../utils/memo'

// THE answer to "is this a household expense?" (Hogar sí / no / Sin
// definir). Every surface (the row toggle, the Hogar filter, the Resumen
// mode) calls resolveHousehold; never re-derive it. It says nothing about
// whether a row counts toward totals: callers combine it with
// services/spending/spending-rules.ts (Hogar mode shows counted expenses).

/**
 * Categories whose rows are household expenses until the user says
 * otherwise. Every other category (built-in, custom, income, transfers) is
 * not; Sin categoría is unassigned.
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

/**
 * The user's per-category defaults, keyed the way rows are read
 * (normalizeCategoryId), so a choice stored under an old id or another
 * casing still applies. Entries that are not a yes/no are dropped; a later
 * entry for the same category wins.
 */
export function buildCategoryHousehold(
  entries: Iterable<readonly [string, boolean]>
): CategoryHousehold {
  const map = new Map<string, boolean>()
  for (const [id, household] of entries) {
    if (typeof household === 'boolean') {
      map.set(normalizeCategoryId(id), household)
    }
  }
  return map
}

/**
 * Precedence: the row's own choice → the user's default for its category →
 * the seeded default. An uncategorized row without a choice of its own is
 * 'unassigned', and Sin categoría cannot be given a default.
 */
export function resolveHousehold(
  tx: { category?: string | null; household?: boolean | null },
  categoryHousehold: CategoryHousehold
): HouseholdResolution {
  if (typeof tx.household === 'boolean') {
    return { status: statusOf(tx.household), isOverride: true }
  }
  const id = normalizeCategoryId(tx.category)
  if (id === Category.Uncategorized) {
    return { status: 'unassigned', isOverride: false }
  }
  return {
    status: statusOf(
      categoryHousehold.get(id) ?? SEEDED_HOUSEHOLD_CATEGORIES.has(id)
    ),
    isOverride: false,
  }
}

/** The effective household default of a category (false for Sin categoría). */
export function isCategoryHousehold(
  categoryId: string,
  categoryHousehold: CategoryHousehold
): boolean {
  return (
    resolveHousehold({ category: categoryId }, categoryHousehold).status ===
    'household'
  )
}

/**
 * What to store when the user wants `household` for a category: null (follow
 * the app's default) when that is already the seeded default, else the value.
 */
export function categoryHouseholdChoice(
  categoryId: string,
  household: boolean
): boolean | null {
  const seeded = SEEDED_HOUSEHOLD_CATEGORIES.has(
    normalizeCategoryId(categoryId)
  )
  return household === seeded ? null : household
}

/** Sin categoría and Ingresos (income is never an expense) cannot have one. */
export function canHaveHouseholdDefault(categoryId: string): boolean {
  const id = normalizeCategoryId(categoryId)
  return id !== Category.Uncategorized && id !== Category.Income
}

/** The signed-in user's category defaults, from the category store. */
export function currentCategoryHousehold(): CategoryHousehold {
  return categoryHouseholdOf(listCustomCategories())
}

// The category store replaces its array on every change (category-registry
// relies on it too), so the array's identity is the cache key.
const categoryHouseholdOf = memoizeByReference(
  (categories: CustomCategory[]): CategoryHousehold =>
    buildCategoryHousehold(
      categories.flatMap((c) =>
        typeof c.isHousehold === 'boolean'
          ? [[c.id, c.isHousehold] as const]
          : []
      )
    )
)

function statusOf(household: boolean): HouseholdResolution['status'] {
  return household ? 'household' : 'not_household'
}

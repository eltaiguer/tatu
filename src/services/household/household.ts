import { Category } from '../../models'
import type {
  CategoryHousehold,
  HouseholdResolution,
  HouseholdRules,
  MerchantHousehold,
} from '../../models'
import {
  canHaveHouseholdDefault,
  normalizeCategoryId,
} from '../categories/category-aliases'
import {
  listCustomCategories,
  type CustomCategory,
} from '../categories/category-store'
import { listMerchantHouseholdRules } from './household-rules-store'
import { merchantOverrideKey } from '../categorizer/category-overrides'
import { isCountedExpense } from '../spending/spending-rules'
import type { Transaction } from '../../models'

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
 * Precedence: the row's own choice → the user's rule for its merchant → the
 * user's default for its category → the seeded default. An uncategorized row
 * with no choice and no merchant rule is 'unassigned', and Sin categoría
 * cannot be given a default. A split part ignores merchant rules (a split is a
 * mixed purchase) and keeps its own choice and its category default.
 */
export function resolveHousehold(
  tx: {
    category?: string | null
    household?: boolean | null
    description?: string
    splitParentId?: string
  },
  householdRules: HouseholdRules
): HouseholdResolution {
  if (typeof tx.household === 'boolean') {
    return { status: statusOf(tx.household), source: 'row' }
  }
  const merchant = merchantRule(tx, householdRules.merchants)
  if (merchant !== undefined) {
    return { status: statusOf(merchant), source: 'merchant' }
  }
  const id = normalizeCategoryId(tx.category)
  if (id === Category.Uncategorized) {
    return { status: 'unassigned', source: 'category' }
  }
  // Ingresos cannot have a default: a stray stored one is ignored.
  const stored = canHaveHouseholdDefault(id)
    ? householdRules.categories.get(id)
    : undefined
  return {
    status: statusOf(stored ?? SEEDED_HOUSEHOLD_CATEGORIES.has(id)),
    source: 'category',
  }
}

// merchantOverrideKey runs regexes and Resumen resolves thousands of rows per
// render, so the key is cached per description (bounded: cleared when full).
const KEY_CACHE_LIMIT = 20000
const keyCache = new Map<string, string | null>()

function merchantKeyOf(description: string): string | null {
  const cached = keyCache.get(description)
  if (cached !== undefined) return cached
  if (keyCache.size >= KEY_CACHE_LIMIT) keyCache.clear()
  const key = merchantOverrideKey(description)
  keyCache.set(description, key)
  return key
}

/**
 * The user's merchant rule for this row (true / false), or undefined when no
 * rule covers it: none stored, no merchant key, or a split part (a split is a
 * mixed purchase, so it never takes a merchant's rule).
 */
export function merchantHouseholdRule(
  tx: { description?: string; splitParentId?: string },
  householdRules: HouseholdRules
): boolean | undefined {
  return merchantRule(tx, householdRules.merchants)
}

function merchantRule(
  tx: { description?: string; splitParentId?: string },
  merchants: MerchantHousehold
): boolean | undefined {
  if (merchants.size === 0 || tx.splitParentId || !tx.description) {
    return undefined
  }
  const key = merchantKeyOf(tx.description)
  return key === null ? undefined : merchants.get(key)
}

/**
 * The counted expenses, split parts excluded, that share `tx`'s merchant key
 * (`tx` included when it qualifies): the rows a merchant rule reaches. The
 * toast count, the dialog count and both writes read this one list, so a
 * preview cannot drift from the save. Empty when `tx` has no key, is a split
 * part or is not a counted expense.
 */
export function rowsSharingMerchantRule(
  all: readonly Transaction[],
  tx: Transaction
): Transaction[] {
  if (!isCountedExpense(tx) || tx.splitParentId) return []
  const key = merchantKeyOf(tx.description)
  if (key === null) return []
  return all.filter(
    (row) =>
      isCountedExpense(row) &&
      !row.splitParentId &&
      merchantKeyOf(row.description) === key
  )
}

/** The effective household default of a category (false for Sin categoría). */
export function isCategoryHousehold(
  categoryId: string,
  householdRules: HouseholdRules
): boolean {
  return (
    resolveHousehold({ category: categoryId }, householdRules).status ===
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

/**
 * What a transaction row shows for the household control, or null when the
 * row has none: only counted expenses can be household (income, ignored rows
 * and split parents get no control). The row toggle, the edit dialog and the
 * bulk action all read this, so they agree.
 */
export function rowHouseholdView(
  tx: Transaction,
  householdRules: HouseholdRules
): HouseholdResolution | null {
  if (!isCountedExpense(tx)) return null
  return resolveHousehold(tx, householdRules)
}

/**
 * The counted expenses that are household and those still Sin definir, in one
 * pass over `rows` (order kept). Both come from `rowHouseholdView`, so every
 * surface that splits rows this way agrees with the row toggle.
 */
export function partitionByHousehold(
  rows: readonly Transaction[],
  householdRules: HouseholdRules
): { household: Transaction[]; unassigned: Transaction[] } {
  const household: Transaction[] = []
  const unassigned: Transaction[] = []
  for (const tx of rows) {
    const status = rowHouseholdView(tx, householdRules)?.status
    if (status === 'household') household.push(tx)
    else if (status === 'unassigned') unassigned.push(tx)
  }
  return { household, unassigned }
}

/**
 * What a category alone says: true / false, or null for Sin categoría (it has
 * no default, so a row there is Sin definir until chosen by hand).
 */
export function categoryDefault(
  categoryId: string | null | undefined,
  householdRules: HouseholdRules
): boolean | null {
  const id = normalizeCategoryId(categoryId)
  return id === Category.Uncategorized
    ? null
    : isCategoryHousehold(id, householdRules)
}

/**
 * What a click on the row's house writes: the opposite of what the row is
 * now (Sin definir goes to household). When that equals what the category
 * alone says, null: the row goes back to following its category. Null also
 * for a row with no control; callers never write it.
 */
export function nextHouseholdChoice(
  tx: Transaction,
  householdRules: HouseholdRules
): boolean | null {
  const view = rowHouseholdView(tx, householdRules)
  if (!view) return null
  const target = view.status !== 'household'
  // What the row would show with no choice of its own: rule, then category.
  const inherited = resolveHousehold({ ...tx, household: null }, householdRules)
  return inherited.status !== 'unassigned' &&
    (inherited.status === 'household') === target
    ? null
    : target
}

export { canHaveHouseholdDefault } from '../categories/category-aliases'

/**
 * Everything resolveHousehold reads besides the row: the signed-in user's
 * category defaults and merchant rules. The same object comes back until the
 * category store or the rules store changes (both replace their value on
 * every write), so memos keyed on it recompute only when they must.
 */
export function currentHouseholdRules(): HouseholdRules {
  const categories = listCustomCategories()
  const merchants = listMerchantHouseholdRules()
  if (
    cached &&
    cached.categories === categories &&
    cached.merchants === merchants
  ) {
    return cached.rules
  }
  const rules: HouseholdRules = {
    categories: buildCategoryHousehold(
      categories.flatMap((c) =>
        typeof c.isHousehold === 'boolean'
          ? [[c.id, c.isHousehold] as const]
          : []
      )
    ),
    merchants,
  }
  cached = { categories, merchants, rules }
  return rules
}

let cached: {
  categories: CustomCategory[]
  merchants: MerchantHousehold
  rules: HouseholdRules
} | null = null

function statusOf(household: boolean): HouseholdResolution['status'] {
  return household ? 'household' : 'not_household'
}

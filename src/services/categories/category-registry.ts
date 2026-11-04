import {
  Category,
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  PAST_CATEGORY_COLORS,
  PAST_DEFAULT_CATEGORY_COLORS,
  isShippedDefaultColor,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
} from '../../models'
import type { CustomCategory } from './category-store'
import { listCustomCategories } from './category-store'
import { memoizeByReference } from '../../utils/memo'
import {
  ID_ALIASES,
  LEGACY_IGNORED_ID,
  normalizeCategoryId,
} from './category-aliases'

export { ID_ALIASES }

/**
 * Everything the app knows about one category id: what to call it, how to
 * draw it, and whether its rows count toward totals. `resolveCategory` is the
 * one place that answers this; `getCategoryDefinitions` lists the categories
 * a user can pick.
 */
export interface CategoryDefinition {
  /** The id rows are grouped and filtered under (= normalizeCategoryId). */
  id: string
  label: string
  color: string
  /** Emoji. */
  icon: string
  /** A user-created category (not a built-in, even an overridden one). */
  isCustom: boolean
  /** Its rows are left out of every total. */
  isIgnored: boolean
  /**
   * False for an id with nothing behind it — typically a custom category the
   * user deleted (archived rows are not loaded), whose rows keep its id.
   */
  known: boolean
}

const DEFAULT_CUSTOM_ICON = '🏷️'

// Custom/override rows by category id. The store already normalized ids
// (case, whitespace, pre-rename aliases) and collapsed rows naming one
// category, so this is a plain lookup. Memoized on the store's array
// identity, which every mutator replaces rather than mutating.
const resolvedOverrides = memoizeByReference(
  (categories: CustomCategory[]) => new Map(categories.map((c) => [c.id, c]))
)

const BUILTIN_IDS = new Set<string>(Object.values(Category))

function isBuiltinId(id: string): id is Category {
  return BUILTIN_IDS.has(id)
}

// THE ignore rule, for every id: the user's choice if a row records one,
// else ignored by default for the transfer categories and the 'ignored' id
// that "Ignorar" writes. resolveCategory and isCategoryIgnored both use it.
function ignoredFor(key: string, row: CustomCategory | undefined): boolean {
  return (
    row?.isIgnored ??
    (key === Category.InternalTransfer ||
      key === Category.ExternalTransfer ||
      key === LEGACY_IGNORED_ID)
  )
}

// A stored colour, unless it is a default the app shipped (see
// PAST_CATEGORY_COLORS): then it follows the current default.
function followDefault(
  stored: string | undefined,
  current: string,
  past: readonly string[]
): string {
  return stored && !isShippedDefaultColor(stored, current, past)
    ? stored
    : current
}

function builtinDefinition(
  category: Category,
  override: CustomCategory | undefined
): CategoryDefinition {
  return {
    id: category,
    // A label equal to the raw id was a fallback, never typed by the user.
    label:
      override?.label && override.label !== category
        ? override.label
        : CATEGORY_LABELS[category],
    color: followDefault(
      override?.color,
      CATEGORY_COLORS[category],
      PAST_CATEGORY_COLORS[category]
    ),
    icon: override?.icon || CATEGORY_ICONS[category],
    isCustom: false,
    isIgnored: ignoredFor(category, override),
    known: true,
  }
}

function customDefinition(key: string, c: CustomCategory): CategoryDefinition {
  return {
    id: key,
    label: c.label || humanizeCategoryId(key),
    color: followDefault(
      c.color,
      DEFAULT_CATEGORY_COLOR,
      PAST_DEFAULT_CATEGORY_COLORS
    ),
    icon: c.icon || DEFAULT_CUSTOM_ICON,
    isCustom: true,
    isIgnored: ignoredFor(key, c),
    known: true,
  }
}

// 'home_office' -> 'Home office'. Archived custom categories are not loaded,
// so their id (a slug of the old name) is the best label left.
function humanizeCategoryId(categoryId: string): string {
  const words = categoryId
    .trim()
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase())

  if (words.length === 0) {
    return CATEGORY_LABELS[Category.Uncategorized]
  }

  const humanized = words.join(' ')
  return humanized.charAt(0).toUpperCase() + humanized.slice(1)
}

/**
 * What a stored category id means, for every surface (badges, rows, filters,
 * donut, export, totals). Missing or '' is Sin categoría; casing is ignored;
 * pre-rename ids resolve to their current built-in. The 'ignored' id
 * ("Ignorar") is "Ignorada", left out of totals. Any other id with no
 * definition — usually a deleted custom category — stays its own category,
 * labelled from its id, counted in totals, and is never Sin categoría.
 */
export function resolveCategory(id?: string | null): CategoryDefinition {
  const key = normalizeCategoryId(id)
  const row = resolvedOverrides(listCustomCategories()).get(key)

  if (isBuiltinId(key)) return builtinDefinition(key, row)
  if (row) return customDefinition(key, row)

  if (key === LEGACY_IGNORED_ID) {
    return {
      id: key,
      label: 'Ignorada',
      color: CATEGORY_COLORS[Category.Uncategorized],
      icon: '🚫',
      isCustom: false,
      isIgnored: ignoredFor(key, undefined),
      known: true,
    }
  }

  return {
    id: key,
    label: humanizeCategoryId(key),
    color: CATEGORY_COLORS[Category.Uncategorized],
    icon: DEFAULT_CUSTOM_ICON,
    isCustom: false,
    isIgnored: ignoredFor(key, undefined),
    known: false,
  }
}

/**
 * `resolveCategory(id).isIgnored` without building the definition — for the
 * per-row totals hot path (spending-rules). Same rule, same lookup.
 */
export function isCategoryIgnored(id?: string | null): boolean {
  const key = normalizeCategoryId(id)
  return ignoredFor(key, resolvedOverrides(listCustomCategories()).get(key))
}

/**
 * The categories a user can pick: every built-in, then their own. Built from
 * the same resolved rows as resolveCategory, so each entry equals
 * resolveCategory(entry.id) — ids are normalized (lowercase) here too.
 */
export function getCategoryDefinitions(): CategoryDefinition[] {
  const overrideMap = resolvedOverrides(listCustomCategories())

  const builtin = Object.values(Category).map((category) =>
    builtinDefinition(category, overrideMap.get(category))
  )
  const custom = Array.from(overrideMap)
    .filter(([key]) => !isBuiltinId(key))
    .map(([key, row]) => customDefinition(key, row))

  return [...builtin, ...custom].sort((a, b) => {
    if (a.id === Category.Uncategorized) return 1
    if (b.id === Category.Uncategorized) return -1
    return a.label.localeCompare(b.label, 'es')
  })
}

/**
 * Whether a row in this category needs the separate "Ignorada" flag: it is
 * left out of totals and its category's own badge doesn't already say so
 * (the 'ignored' category is itself "Ignorada").
 */
export function needsIgnoredFlag(category: CategoryDefinition): boolean {
  return category.isIgnored && category.id !== LEGACY_IGNORED_ID
}

/** Category ids in Spanish label order, resolving each id once. */
export function sortCategoryIdsByLabel(ids: string[]): string[] {
  return ids
    .map((id) => ({ id, label: resolveCategory(id).label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))
    .map(({ id }) => id)
}

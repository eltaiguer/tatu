import { isReservedCategoryId, normalizeCategoryId } from './category-aliases'
import { UserFacingError } from '../../utils/user-error'
import type { Repository } from '../repository/repository'
import { isWorkspaceOwner } from '../../stores/workspace-state'

/** The part of the repository port the category store writes through. */
export type CategoryRepository = Pick<
  Repository,
  'userId' | 'upsertCustomCategory' | 'archiveCustomCategory'
>

export const DEFAULT_CATEGORY_COLOR = '#0ea5e9'

export interface CustomCategory {
  /** The id rows are grouped under: always normalizeCategoryId(stored id). */
  id: string
  /**
   * The server rows behind this category when they are not just `id`: a row
   * stored before slugs were lowercased ('Viajes-Familia'), a pre-rename
   * alias row ('transfer' for internal_transfer), or several rows that name
   * one category. Every write and archive goes to all of them, so editing a
   * legacy row never creates a duplicate and the server converges.
   */
  storedIds?: string[]
  label: string
  color: string
  icon?: string
  isIgnored?: boolean
}

let _customCategories: CustomCategory[] = []

function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

function ensureUniqueId(base: string, existingIds: Set<string>): string {
  // A slug that collides with a built-in id or one of its pre-rename aliases
  // would silently override that built-in everywhere — a custom "Food" would
  // take over Alimentación's ignore flag in every total.
  const taken = (id: string) => existingIds.has(id) || isReservedCategoryId(id)

  if (!taken(base)) {
    return base
  }

  let suffix = 2
  while (taken(`${base}-${suffix}`)) {
    suffix += 1
  }
  return `${base}-${suffix}`
}

export function listCustomCategories(): CustomCategory[] {
  return _customCategories
}

function serverIds(c: CustomCategory): string[] {
  return c.storedIds ?? [c.id]
}

// Which stored row's settings a category shows when several rows name it:
// the one stored under the current id (what the app writes today), else the
// smallest stored id — never whichever order Supabase returned them in.
function rank(key: string, storedId: string): [number, string] {
  return [storedId === key ? 0 : 1, storedId]
}

function sameSettings(a: CustomCategory, b: CustomCategory): boolean {
  return (
    a.label === b.label &&
    a.color === b.color &&
    (a.icon ?? '') === (b.icon ?? '') &&
    (a.isIgnored ?? false) === (b.isIgnored ?? false)
  )
}

/**
 * Loads a user's categories — the one place ids are normalized. Each row is
 * keyed by normalizeCategoryId (trimmed, lowercase, pre-rename alias
 * resolved), keeping the server ids in `storedIds` for writes. Rows that
 * name one category collapse into it: the preferred row's settings win, and
 * the next write goes to every row, so the server converges. Until then the
 * disagreement is reported once per load.
 */
export function replaceCustomCategories(categories: CustomCategory[]): void {
  const groups = new Map<
    string,
    Array<{ storedId: string; row: CustomCategory }>
  >()
  for (const row of categories) {
    for (const storedId of serverIds(row)) {
      const key = normalizeCategoryId(storedId)
      groups.set(key, [...(groups.get(key) ?? []), { storedId, row }])
    }
  }

  _customCategories = Array.from(groups, ([key, rows]) => {
    const sorted = [...rows].sort((a, b) => {
      const [ra, ia] = rank(key, a.storedId)
      const [rb, ib] = rank(key, b.storedId)
      return ra - rb || (ia < ib ? -1 : ia > ib ? 1 : 0)
    })
    const storedIds = Array.from(new Set(sorted.map((r) => r.storedId)))
    const winner = sorted[0].row
    const diverging = sorted.filter((r) => !sameSettings(r.row, winner))
    if (diverging.length > 0) {
      console.warn(
        `[categories] stored categories ${storedIds.map((id) => `"${id}"`).join(', ')} are one category with different settings; showing "${sorted[0].storedId}" until the next save updates them all`
      )
    }
    return {
      ...winner,
      id: key,
      storedIds:
        storedIds.length === 1 && storedIds[0] === key ? undefined : storedIds,
    }
  })
}

export function addCustomCategory(input: {
  label: string
  color: string
  icon?: string
  isIgnored?: boolean
}): CustomCategory {
  const existingIds = new Set(_customCategories.map((c) => c.id))
  const baseId = slugifyLabel(input.label) || 'custom-category'
  const id = ensureUniqueId(baseId, existingIds)
  const next: CustomCategory = {
    id,
    label: input.label.trim(),
    color: input.color,
    icon: input.icon,
    isIgnored: input.isIgnored,
  }
  _customCategories = [..._customCategories, next]
  return next
}

export function updateCustomCategory(
  id: string,
  updates: Partial<
    Pick<CustomCategory, 'label' | 'color' | 'icon' | 'isIgnored'>
  >
): void {
  _customCategories = _customCategories.map((c) =>
    c.id === id ? { ...c, ...updates } : c
  )
}

export function removeCustomCategory(id: string): void {
  _customCategories = _customCategories.filter((c) => c.id !== id)
}

// The *WithSync functions save through the repository they are given (the
// signed-in user's, #119): they apply a change locally, push it, and on
// failure undo exactly that change (not a snapshot of the whole list, which
// would also undo concurrent edits) before rethrowing, so the UI never shows
// a category the server doesn't have. They refuse to start unless that
// repository's user owns the loaded workspace, and skip the undo if another
// user signed in meanwhile (their categories are not this change's to undo).
function requireOwner(repo: CategoryRepository): void {
  if (!isWorkspaceOwner(repo.userId)) {
    throw new UserFacingError(
      'Tu sesión terminó. Iniciá sesión de nuevo para guardar cambios.'
    )
  }
}

async function pushCategory(
  repo: CategoryRepository,
  id: string
): Promise<void> {
  const category = _customCategories.find((c) => c.id === id)
  if (!category) return
  for (const storedId of serverIds(category)) {
    await repo.upsertCustomCategory({
      id: storedId,
      label: category.label,
      color: category.color,
      icon: category.icon,
      isIgnored: category.isIgnored,
      isArchived: false,
    })
  }
}

function restoreCategory(
  repo: CategoryRepository,
  id: string,
  previous: CustomCategory | undefined
) {
  if (!isWorkspaceOwner(repo.userId)) return
  if (previous) {
    _customCategories = _customCategories.some((c) => c.id === id)
      ? _customCategories.map((c) => (c.id === id ? previous : c))
      : [..._customCategories, previous]
  } else {
    _customCategories = _customCategories.filter((c) => c.id !== id)
  }
}

export async function addCustomCategoryWithSync(
  repo: CategoryRepository,
  input: {
    label: string
    color: string
    icon?: string
    isIgnored?: boolean
  }
): Promise<CustomCategory> {
  requireOwner(repo)
  const created = addCustomCategory(input)
  try {
    await pushCategory(repo, created.id)
  } catch (error) {
    restoreCategory(repo, created.id, undefined)
    throw error
  }
  return created
}

export async function updateCustomCategoryWithSync(
  repo: CategoryRepository,
  id: string,
  updates: Partial<
    Pick<CustomCategory, 'label' | 'color' | 'icon' | 'isIgnored'>
  >
): Promise<void> {
  requireOwner(repo)
  const previous = _customCategories.find((c) => c.id === id)
  if (!previous) return
  updateCustomCategory(id, updates)
  try {
    await pushCategory(repo, id)
  } catch (error) {
    restoreCategory(repo, id, previous)
    throw error
  }
}

export function upsertBuiltinOverride(
  id: string,
  updates: Partial<
    Pick<CustomCategory, 'label' | 'color' | 'icon' | 'isIgnored'>
  >
): void {
  const existing = _customCategories.find((c) => c.id === id)
  if (existing) {
    _customCategories = _customCategories.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    )
  } else {
    _customCategories = [
      ..._customCategories,
      {
        id,
        label: updates.label ?? id,
        color: updates.color ?? '#94a3b8',
        isIgnored: updates.isIgnored,
      },
    ]
  }
}

export async function upsertBuiltinOverrideWithSync(
  repo: CategoryRepository,
  id: string,
  updates: Partial<
    Pick<CustomCategory, 'label' | 'color' | 'icon' | 'isIgnored'>
  >
): Promise<void> {
  requireOwner(repo)
  const previous = _customCategories.find((c) => c.id === id)
  upsertBuiltinOverride(id, updates)
  try {
    await pushCategory(repo, id)
  } catch (error) {
    restoreCategory(repo, id, previous)
    throw error
  }
}

export async function removeCustomCategoryWithSync(
  repo: CategoryRepository,
  id: string
): Promise<void> {
  requireOwner(repo)
  const previous = _customCategories.find((c) => c.id === id)
  removeCustomCategory(id)
  try {
    for (const storedId of previous ? serverIds(previous) : [id]) {
      await repo.archiveCustomCategory(storedId)
    }
  } catch (error) {
    restoreCategory(repo, id, previous)
    throw error
  }
}

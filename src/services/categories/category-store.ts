import { isReservedCategoryId } from './category-aliases'
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
  /** Lowercase: the id rows are grouped under (= normalizeCategoryId). */
  id: string
  /**
   * The server row's id when it differs from `id` — a row stored before
   * slugs were lowercased ('Viajes-Familia'). Writes always target it, so
   * editing a legacy row never creates a lowercase duplicate.
   */
  storedId?: string
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

function serverId(c: CustomCategory): string {
  return c.storedId ?? c.id
}

// Which of two rows whose ids differ only by case to keep: the one already
// stored lowercase (what the app writes today), else the smaller stored id —
// never whichever order Supabase happened to return them in.
function preferred(a: CustomCategory, b: CustomCategory): CustomCategory {
  const aLower = serverId(a) === a.id
  const bLower = serverId(b) === b.id
  if (aLower !== bLower) return aLower ? a : b
  return serverId(a) <= serverId(b) ? a : b
}

/**
 * Loads a user's categories — the one place ids are normalized. Each row is
 * keyed by its lowercase id, keeping the server's id in `storedId` for
 * writes. Rows whose ids differ only by case are one category: one is kept
 * deterministically, the others are reported and left untouched on the
 * server.
 */
export function replaceCustomCategories(categories: CustomCategory[]): void {
  const byId = new Map<string, CustomCategory>()
  for (const row of categories) {
    const stored = serverId(row)
    const id = stored.toLowerCase()
    const next: CustomCategory = {
      ...row,
      id,
      storedId: stored === id ? undefined : stored,
    }
    const held = byId.get(id)
    if (!held) {
      byId.set(id, next)
      continue
    }
    const keep = preferred(held, next)
    const drop = keep === held ? next : held
    if (serverId(drop) !== serverId(keep)) {
      console.warn(
        `[categories] custom categories "${serverId(drop)}" and "${serverId(keep)}" differ only by case; using "${serverId(keep)}", ignoring "${serverId(drop)}"`
      )
    }
    byId.set(id, keep)
  }
  _customCategories = Array.from(byId.values())
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
  await repo.upsertCustomCategory({
    id: serverId(category),
    label: category.label,
    color: category.color,
    icon: category.icon,
    isIgnored: category.isIgnored,
    isArchived: false,
  })
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
    await repo.archiveCustomCategory(previous ? serverId(previous) : id)
  } catch (error) {
    restoreCategory(repo, id, previous)
    throw error
  }
}

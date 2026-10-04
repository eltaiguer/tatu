import { isReservedCategoryId } from './category-aliases'
import { UserFacingError } from '../../utils/user-error'
import {
  archiveCustomCategory,
  upsertCustomCategory,
} from '../supabase/custom-categories'
import { getActiveSupabaseSession } from '../supabase/runtime'

export const DEFAULT_CATEGORY_COLOR = '#0ea5e9'

export interface CustomCategory {
  id: string
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

export function replaceCustomCategories(categories: CustomCategory[]): void {
  const seen = new Set<string>()
  _customCategories = categories.filter((c) => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
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

// The *WithSync functions apply a change locally, push it, and on failure
// undo exactly that change (not a snapshot of the whole list, which would
// also undo concurrent edits) before rethrowing, so the UI never shows a
// category the server doesn't have.
async function requireSession() {
  const session = getActiveSupabaseSession()
  if (!session) {
    throw new UserFacingError(
      'Tu sesión terminó. Iniciá sesión de nuevo para guardar cambios.'
    )
  }
  return session
}

async function pushCategory(id: string): Promise<void> {
  const category = _customCategories.find((c) => c.id === id)
  if (!category) return
  const session = await requireSession()
  await upsertCustomCategory(session, {
    id: category.id,
    label: category.label,
    color: category.color,
    icon: category.icon,
    isIgnored: category.isIgnored,
    isArchived: false,
  })
}

function restoreCategory(id: string, previous: CustomCategory | undefined) {
  if (previous) {
    _customCategories = _customCategories.some((c) => c.id === id)
      ? _customCategories.map((c) => (c.id === id ? previous : c))
      : [..._customCategories, previous]
  } else {
    _customCategories = _customCategories.filter((c) => c.id !== id)
  }
}

export async function addCustomCategoryWithSync(input: {
  label: string
  color: string
  icon?: string
  isIgnored?: boolean
}): Promise<CustomCategory> {
  const created = addCustomCategory(input)
  try {
    await pushCategory(created.id)
  } catch (error) {
    restoreCategory(created.id, undefined)
    throw error
  }
  return created
}

export async function updateCustomCategoryWithSync(
  id: string,
  updates: Partial<
    Pick<CustomCategory, 'label' | 'color' | 'icon' | 'isIgnored'>
  >
): Promise<void> {
  const previous = _customCategories.find((c) => c.id === id)
  if (!previous) return
  updateCustomCategory(id, updates)
  try {
    await pushCategory(id)
  } catch (error) {
    restoreCategory(id, previous)
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
  id: string,
  updates: Partial<
    Pick<CustomCategory, 'label' | 'color' | 'icon' | 'isIgnored'>
  >
): Promise<void> {
  const previous = _customCategories.find((c) => c.id === id)
  upsertBuiltinOverride(id, updates)
  try {
    await pushCategory(id)
  } catch (error) {
    restoreCategory(id, previous)
    throw error
  }
}

export async function removeCustomCategoryWithSync(id: string): Promise<void> {
  const previous = _customCategories.find((c) => c.id === id)
  removeCustomCategory(id)
  try {
    const session = await requireSession()
    await archiveCustomCategory(session, id)
  } catch (error) {
    restoreCategory(id, previous)
    throw error
  }
}

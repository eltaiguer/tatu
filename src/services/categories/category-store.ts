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
  if (!existingIds.has(base)) {
    return base
  }

  let suffix = 2
  while (existingIds.has(`${base}-${suffix}`)) {
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
  updates: Partial<Pick<CustomCategory, 'label' | 'color' | 'icon' | 'isIgnored'>>
): void {
  _customCategories = _customCategories.map((c) =>
    c.id === id ? { ...c, ...updates } : c
  )
}

export function removeCustomCategory(id: string): void {
  _customCategories = _customCategories.filter((c) => c.id !== id)
}

export async function syncCustomCategoryToCloud(id: string): Promise<void> {
  const category = _customCategories.find((c) => c.id === id)
  if (!category) return

  try {
    const { getActiveSupabaseSession } = await import('../supabase/runtime')
    const session = getActiveSupabaseSession()
    if (session) {
      const { upsertCustomCategory } = await import(
        '../supabase/custom-categories'
      )
      await upsertCustomCategory(session, {
        id: category.id,
        label: category.label,
        color: category.color,
        icon: category.icon,
        isIgnored: category.isIgnored ?? false,
        isArchived: false,
      })
    }
  } catch {
    // in-memory state remains applied
  }
}

export async function addCustomCategoryWithSync(input: {
  label: string
  color: string
  icon?: string
  isIgnored?: boolean
}): Promise<CustomCategory> {
  const created = addCustomCategory(input)
  await syncCustomCategoryToCloud(created.id)
  return created
}

export async function updateCustomCategoryWithSync(
  id: string,
  updates: Partial<Pick<CustomCategory, 'label' | 'color' | 'icon' | 'isIgnored'>>
): Promise<void> {
  updateCustomCategory(id, updates)
  const category = _customCategories.find((c) => c.id === id)
  if (!category) return

  try {
    const { getActiveSupabaseSession } = await import('../supabase/runtime')
    const session = getActiveSupabaseSession()
    if (session) {
      const { upsertCustomCategory } = await import(
        '../supabase/custom-categories'
      )
      await upsertCustomCategory(session, {
        id: category.id,
        label: category.label,
        color: category.color,
        icon: category.icon,
        isIgnored: category.isIgnored ?? false,
        isArchived: false,
      })
    }
  } catch {
    // in-memory update remains applied
  }
}

export function upsertBuiltinOverride(
  id: string,
  updates: Partial<Pick<CustomCategory, 'label' | 'color' | 'icon' | 'isIgnored'>>
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
  updates: Partial<Pick<CustomCategory, 'label' | 'color' | 'icon' | 'isIgnored'>>
): Promise<void> {
  upsertBuiltinOverride(id, updates)
  await syncCustomCategoryToCloud(id)
}

export async function removeCustomCategoryWithSync(id: string): Promise<void> {
  removeCustomCategory(id)

  try {
    const { getActiveSupabaseSession } = await import('../supabase/runtime')
    const session = getActiveSupabaseSession()
    if (session) {
      const { archiveCustomCategory } = await import(
        '../supabase/custom-categories'
      )
      await archiveCustomCategory(session, id)
    }
  } catch {
    // in-memory deletion remains applied
  }
}

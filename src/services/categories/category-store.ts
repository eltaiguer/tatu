export interface CustomCategory {
  id: string
  label: string
  color: string
  icon?: string
}

const STORAGE_KEY = 'tatu:customCategories'

function hasLocalStorage(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  )
}

function loadCustomCategories(): CustomCategory[] {
  if (!hasLocalStorage()) {
    return []
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as CustomCategory[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCustomCategories(categories: CustomCategory[]): void {
  if (!hasLocalStorage()) {
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(categories))
}

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
  return loadCustomCategories()
}

export function addCustomCategory(input: {
  label: string
  color: string
  icon?: string
}): CustomCategory {
  const categories = loadCustomCategories()
  const existingIds = new Set(categories.map((category) => category.id))
  const baseId = slugifyLabel(input.label) || 'custom-category'
  const id = ensureUniqueId(baseId, existingIds)
  const next: CustomCategory = {
    id,
    label: input.label.trim(),
    color: input.color,
    icon: input.icon,
  }
  const updated = [...categories, next]
  saveCustomCategories(updated)
  return next
}

export function updateCustomCategory(
  id: string,
  updates: Partial<Pick<CustomCategory, 'label' | 'color' | 'icon'>>
): void {
  const categories = loadCustomCategories()
  const updated = categories.map((category) =>
    category.id === id ? { ...category, ...updates } : category
  )
  saveCustomCategories(updated)
}

export function removeCustomCategory(id: string): void {
  const categories = loadCustomCategories()
  const updated = categories.filter((category) => category.id !== id)
  saveCustomCategories(updated)
}

export function replaceCustomCategories(categories: CustomCategory[]): void {
  saveCustomCategories(categories)
}

export async function addCustomCategoryWithSync(input: {
  label: string
  color: string
  icon?: string
}): Promise<CustomCategory> {
  const created = addCustomCategory(input)

  try {
    const { getActiveSupabaseSession } = await import('../supabase/runtime')
    const session = getActiveSupabaseSession()
    if (session) {
      const { upsertCustomCategory } = await import(
        '../supabase/custom-categories'
      )
      await upsertCustomCategory(session, {
        id: created.id,
        label: created.label,
        color: created.color,
        icon: created.icon,
        isArchived: false,
      })
    }
  } catch {
    // local state is source of truth fallback when cloud sync fails
  }

  return created
}

export async function updateCustomCategoryWithSync(
  id: string,
  updates: Partial<Pick<CustomCategory, 'label' | 'color' | 'icon'>>
): Promise<void> {
  updateCustomCategory(id, updates)
  const category = listCustomCategories().find((entry) => entry.id === id)
  if (!category) {
    return
  }

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
        isArchived: false,
      })
    }
  } catch {
    // local update remains applied
  }
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
    // local deletion remains applied
  }
}

/**
 * Category system for transaction categorization
 * Designed for Uruguayan expenses and income
 */

/**
 * Transaction categories enum
 */
export enum Category {
  // Expenses
  Groceries = 'groceries',
  Restaurants = 'restaurants',
  Transport = 'transport',
  Utilities = 'utilities',
  Healthcare = 'healthcare',
  Shopping = 'shopping',
  Entertainment = 'entertainment',
  Software = 'software',
  Education = 'education',
  Automotive = 'automotive',
  Housing = 'housing',
  Personal = 'personal',
  Insurance = 'insurance',

  // Special categories
  Income = 'income',
  InternalTransfer = 'internal_transfer',
  ExternalTransfer = 'external_transfer',
  Fees = 'fees',

  // Default
  Uncategorized = 'uncategorized',
}

/**
 * Human-readable labels for each category
 */
export const CATEGORY_LABELS: Record<Category, string> = {
  [Category.Groceries]: 'Alimentación',
  [Category.Restaurants]: 'Restaurantes',
  [Category.Transport]: 'Transporte',
  [Category.Utilities]: 'Servicios',
  [Category.Healthcare]: 'Salud',
  [Category.Shopping]: 'Compras',
  [Category.Entertainment]: 'Entretenimiento',
  [Category.Software]: 'Software y suscripciones',
  [Category.Education]: 'Educación',
  [Category.Automotive]: 'Automotor',
  [Category.Housing]: 'Vivienda',
  [Category.Personal]: 'Personal',
  [Category.Insurance]: 'Seguros',
  [Category.Income]: 'Ingresos',
  [Category.InternalTransfer]: 'Transferencias internas',
  [Category.ExternalTransfer]: 'Transferencias externas',
  [Category.Fees]: 'Comisiones',
  [Category.Uncategorized]: 'Sin categoría',
}

/**
 * Icons for each category
 */
export const CATEGORY_ICONS: Record<Category, string> = {
  [Category.Groceries]: '🛒',
  [Category.Restaurants]: '🍽️',
  [Category.Transport]: '🚗',
  [Category.Utilities]: '💡',
  [Category.Healthcare]: '🏥',
  [Category.Shopping]: '🛍️',
  [Category.Entertainment]: '🎬',
  [Category.Software]: '💻',
  [Category.Education]: '📚',
  [Category.Automotive]: '🚙',
  [Category.Housing]: '🏠',
  [Category.Personal]: '💇',
  [Category.Insurance]: '🛡️',
  [Category.Income]: '💰',
  [Category.InternalTransfer]: '↔️',
  [Category.ExternalTransfer]: '💸',
  [Category.Fees]: '💳',
  [Category.Uncategorized]: '❓',
}

/**
 * Color tokens for each category. Designed in OKLCH (matched lightness and
 * moderate chroma, so the set reads as one palette on the bone and espresso
 * canvases) and stored as hex: icon tiles append an alpha byte, and custom
 * category colours are hex in the schema. category-palette.test.ts guards
 * contrast and distinctness — re-run it when changing one.
 */
export const CATEGORY_COLORS: Record<Category, string> = {
  // Categories that share the donut: ≥ 6.5 apart (OKLab ×100).
  [Category.Groceries]: '#4e9a52', // oklch(0.62 0.13 145)
  [Category.Restaurants]: '#cb6c30', // oklch(0.63 0.14 50)
  [Category.Transport]: '#3179b7', // oklch(0.56 0.12 248)
  [Category.Utilities]: '#566577', // oklch(0.5 0.035 255)
  [Category.Healthcare]: '#b2403d', // oklch(0.53 0.15 25)
  [Category.Shopping]: '#c75b90', // oklch(0.62 0.15 352)
  [Category.Entertainment]: '#af8724', // oklch(0.645 0.12 85)
  [Category.Software]: '#6758b4', // oklch(0.52 0.14 288)
  [Category.Education]: '#299dac', // oklch(0.64 0.1 208)
  [Category.Automotive]: '#817f24', // oklch(0.58 0.11 108)
  [Category.Housing]: '#88674a', // oklch(0.54 0.06 62)
  [Category.Personal]: '#ab6fb4', // oklch(0.63 0.12 322)
  [Category.Insurance]: '#32766e', // oklch(0.52 0.07 185)
  [Category.Fees]: '#af7378', // oklch(0.62 0.075 15)
  [Category.Uncategorized]: '#8b8985', // oklch(0.63 0.006 70)
  // Rows that don't count as spend by default: muted, ≥ 5 from the rest.
  [Category.Income]: '#21763c', // oklch(0.5 0.12 150), the hue of --pos
  [Category.InternalTransfer]: '#53899e', // oklch(0.6 0.065 225)
  [Category.ExternalTransfer]: '#8871a4', // oklch(0.59 0.08 305)
}

/**
 * Every default each built-in has shipped with before the current one. The
 * colour column is NOT NULL, so editing a built-in saves its colour with the
 * override even when the user never touched the picker: a stored colour equal
 * to the current or a past default means "follow the default". When the
 * palette changes again, append the outgoing CATEGORY_COLORS value here.
 * (Trade-off: a user who picks exactly a shipped default gets the current one.)
 */
// What upsertBuiltinOverride stored for any built-in saved without a colour,
// before the 2026-10 palette.
const OLD_OVERRIDE_FALLBACK = '#94a3b8'

export const PAST_CATEGORY_COLORS: Record<Category, readonly string[]> = {
  [Category.Groceries]: ['#22c55e', OLD_OVERRIDE_FALLBACK],
  [Category.Restaurants]: ['#f97316', OLD_OVERRIDE_FALLBACK],
  [Category.Transport]: ['#0ea5e9', OLD_OVERRIDE_FALLBACK],
  [Category.Utilities]: ['#64748b', OLD_OVERRIDE_FALLBACK],
  [Category.Healthcare]: ['#ef4444', OLD_OVERRIDE_FALLBACK],
  [Category.Shopping]: ['#ec4899', OLD_OVERRIDE_FALLBACK],
  [Category.Entertainment]: ['#f59e0b', OLD_OVERRIDE_FALLBACK],
  [Category.Software]: ['#6366f1', OLD_OVERRIDE_FALLBACK],
  [Category.Education]: ['#14b8a6', OLD_OVERRIDE_FALLBACK],
  [Category.Automotive]: ['#84cc16', OLD_OVERRIDE_FALLBACK],
  [Category.Housing]: ['#6b7280', OLD_OVERRIDE_FALLBACK],
  [Category.Personal]: ['#f43f5e', OLD_OVERRIDE_FALLBACK],
  [Category.Insurance]: ['#10b981', OLD_OVERRIDE_FALLBACK],
  [Category.Income]: ['#16a34a', OLD_OVERRIDE_FALLBACK],
  [Category.InternalTransfer]: ['#0284c7', OLD_OVERRIDE_FALLBACK],
  [Category.ExternalTransfer]: ['#7c3aed', OLD_OVERRIDE_FALLBACK],
  [Category.Fees]: ['#fb7185', OLD_OVERRIDE_FALLBACK],
  [Category.Uncategorized]: ['#94a3b8'],
}

/** New custom categories start here: distinct from every built-in. */
export const DEFAULT_CATEGORY_COLOR = '#718ce8' // oklch(0.66 0.14 270)

/**
 * Past DEFAULT_CATEGORY_COLOR values, same rule as PAST_CATEGORY_COLORS
 * (and the same trade-off), plus the slate the legacy "ignored" row shipped
 * with.
 */
export const PAST_DEFAULT_CATEGORY_COLORS: readonly string[] = [
  '#0ea5e9',
  OLD_OVERRIDE_FALLBACK,
]

/** A stored colour that is one the app chose, not the user. */
export function isShippedDefaultColor(
  color: string,
  current: string,
  past: readonly string[]
): boolean {
  const c = color.toLowerCase()
  return c === current.toLowerCase() || past.some((p) => p.toLowerCase() === c)
}

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
  [Category.Groceries]: '#4e9a52', // oklch(0.62 0.13 145)
  [Category.Restaurants]: '#cb6c30', // oklch(0.63 0.14 50)
  [Category.Transport]: '#3179b7', // oklch(0.56 0.12 248)
  [Category.Utilities]: '#566577', // oklch(0.5 0.035 255)
  [Category.Healthcare]: '#b2403d', // oklch(0.53 0.15 25)
  [Category.Shopping]: '#c75b90', // oklch(0.62 0.15 352)
  [Category.Entertainment]: '#b38728', // oklch(0.65 0.12 82)
  [Category.Software]: '#6758b4', // oklch(0.52 0.14 288)
  [Category.Education]: '#299dac', // oklch(0.64 0.1 208)
  [Category.Automotive]: '#899332', // oklch(0.635 0.12 115)
  [Category.Housing]: '#88674a', // oklch(0.54 0.06 62)
  [Category.Personal]: '#ab6fb4', // oklch(0.63 0.12 322)
  [Category.Insurance]: '#31715b', // oklch(0.5 0.075 168)
  [Category.Fees]: '#af7378', // oklch(0.62 0.075 15)
  // Rows that don't count as spend: muted, so they recede behind it.
  [Category.Income]: '#237f49', // = --pos
  [Category.InternalTransfer]: '#5f7f95', // oklch(0.58 0.05 240)
  [Category.ExternalTransfer]: '#776e94', // oklch(0.56 0.06 295)
  [Category.Uncategorized]: '#8a8580', // oklch(0.62 0.01 70)
}

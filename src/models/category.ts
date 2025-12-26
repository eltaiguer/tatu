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
  Transfer = 'transfer',
  Fees = 'fees',

  // Default
  Uncategorized = 'uncategorized',
}

/**
 * Human-readable labels for each category
 */
export const CATEGORY_LABELS: Record<Category, string> = {
  [Category.Groceries]: 'Groceries',
  [Category.Restaurants]: 'Restaurants & Dining',
  [Category.Transport]: 'Transport & Fuel',
  [Category.Utilities]: 'Utilities',
  [Category.Healthcare]: 'Healthcare & Pharmacy',
  [Category.Shopping]: 'Shopping',
  [Category.Entertainment]: 'Entertainment',
  [Category.Software]: 'Software & Subscriptions',
  [Category.Education]: 'Education',
  [Category.Automotive]: 'Automotive',
  [Category.Housing]: 'Housing & Rent',
  [Category.Personal]: 'Personal Care',
  [Category.Insurance]: 'Insurance',
  [Category.Income]: 'Income',
  [Category.Transfer]: 'Transfer',
  [Category.Fees]: 'Fees & Charges',
  [Category.Uncategorized]: 'Uncategorized',
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
  [Category.Transfer]: '💸',
  [Category.Fees]: '💳',
  [Category.Uncategorized]: '❓',
}

/**
 * Helper to check if a category is an expense
 */
export function isExpenseCategory(category: Category): boolean {
  return (
    category !== Category.Income &&
    category !== Category.Transfer &&
    category !== Category.Uncategorized
  )
}

/**
 * Helper to check if a category is income
 */
export function isIncomeCategory(category: Category): boolean {
  return category === Category.Income
}

/**
 * Helper to check if a category is a transfer
 */
export function isTransferCategory(category: Category): boolean {
  return category === Category.Transfer
}

/**
 * Get all available categories
 */
export function getAllCategories(): Category[] {
  return Object.values(Category)
}

/**
 * Get expense categories only (excludes Income, Transfer, Uncategorized)
 */
export function getExpenseCategories(): Category[] {
  return getAllCategories().filter(
    (cat) =>
      cat !== Category.Income &&
      cat !== Category.Transfer &&
      cat !== Category.Uncategorized
  )
}

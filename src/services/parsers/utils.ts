/**
 * Parsing utilities for Santander Uruguay CSV files
 */

/**
 * Parse a number from Santander format
 * - Credit Card format: "1.234,56" (period as thousands, comma as decimal)
 * - Bank Account format: "1234.56" (period as decimal)
 * - Handles both formats automatically
 *
 * @param value - The string value to parse
 * @returns Parsed number, or 0 if empty/invalid
 */
export function parseSantanderNumber(value: string): number {
  if (!value || value.trim() === '') {
    return 0
  }

  const trimmed = value.trim()

  // Check if it uses comma as decimal separator (credit card format)
  if (trimmed.includes(',')) {
    // Remove thousand separators (periods) and replace comma with period
    const normalized = trimmed.replace(/\./g, '').replace(',', '.')
    return parseFloat(normalized)
  }

  // Otherwise, it's already in US format (bank account format)
  return parseFloat(trimmed)
}

/**
 * Parse a date from Santander DD/MM/YYYY format
 *
 * @param dateStr - Date string in DD/MM/YYYY format
 * @returns Date object set to midnight
 */
export function parseSantanderDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split('/').map((part) => parseInt(part, 10))

  // Month is 0-indexed in JavaScript Date
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

/**
 * Generate a unique transaction ID from transaction data
 * Uses date, description, and amount to create a hash-like ID
 *
 * @param date - Transaction date string
 * @param description - Transaction description
 * @param amount - Transaction amount string
 * @param index - Optional index for duplicate transactions on same date
 * @returns Unique transaction ID
 */
export function generateTransactionId(
  date: string,
  description: string,
  amount: string,
  index?: number
): string {
  const base = `${date}-${description}-${amount}`
  const suffix = index !== undefined ? `-${index}` : ''

  // Simple hash function for creating shorter IDs
  let hash = 0
  for (let i = 0; i < base.length; i++) {
    const char = base.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }

  return `txn_${Math.abs(hash)}${suffix}`
}

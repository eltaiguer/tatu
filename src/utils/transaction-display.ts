import { normalizeCategoryId } from '../services/categories/category-aliases'
import { getDescriptionOverride } from '../services/descriptions/description-overrides'
import type { Transaction } from '../models'

export function getDisplayDescription(transaction: Transaction): string {
  if (transaction.displayDescription?.trim()) {
    return transaction.displayDescription.trim()
  }

  const override = getDescriptionOverride(transaction.description)
  if (override?.friendlyDescription?.trim()) {
    return override.friendlyDescription.trim()
  }

  return transaction.description
}

// Confidence below which an automatic category is worth a second look (the
// old meter's "baja" band).
const LOW_CONFIDENCE = 0.55

// Whether a row's category deserves the user's attention: it has none, or
// it was assigned automatically with low confidence. Rows the user
// categorized (confidence 1) and legacy rows with no recorded confidence are
// not flagged; split parents carry no category of their own.
export function needsCategoryReview(transaction: Transaction): boolean {
  if (transaction.isSplitParent) return false
  if (normalizeCategoryId(transaction.category) === 'uncategorized') {
    return true
  }
  const confidence = transaction.categoryConfidence
  return (
    typeof confidence === 'number' &&
    confidence > 0 &&
    confidence < LOW_CONFIDENCE
  )
}

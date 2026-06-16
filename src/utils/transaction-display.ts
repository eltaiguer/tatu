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

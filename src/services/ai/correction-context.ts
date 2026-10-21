import type { CustomCategory } from '../categories/category-store'
import type { UserRules } from '../categorizer/user-rules'
import type { AiCorrectionContext } from './transaction-ai'

/**
 * What the AI is told about the user's own decisions: their latest
 * corrections as examples, their custom patterns and categories. Built from
 * the same rules snapshot the caller gates rows with (hasUserRule).
 */
export function buildCorrectionContext(
  rules: UserRules,
  customCategories: CustomCategory[]
): AiCorrectionContext {
  const descriptionExamples = Object.values(rules.descriptionOverrides)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20)
    .map((o) => ({
      raw: o.descriptionOriginal ?? '',
      friendly: o.friendlyDescription,
      category: o.category,
    }))

  const categoryExamples = Object.values(rules.merchantOverrides)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20)
    .map((o) => ({
      merchant: o.merchantName ?? '',
      category: o.category,
    }))

  return {
    descriptionExamples,
    categoryExamples,
    customCategories,
    customPatterns: rules.customPatterns,
  }
}

import { listMerchantCategoryOverrides } from '../categorizer/category-overrides'
import { listDescriptionOverrides } from '../descriptions/description-overrides'
import { listCustomPatterns } from '../categorizer/custom-patterns'
import { listCustomCategories } from '../categories/category-store'
import type { AiCorrectionContext } from './transaction-ai'

export function buildCorrectionContext(): AiCorrectionContext {
  const descOverrides = listDescriptionOverrides()
  const catOverrides = listMerchantCategoryOverrides()

  const descriptionExamples = Object.values(descOverrides)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20)
    .map((o) => ({
      raw: o.descriptionOriginal ?? '',
      friendly: o.friendlyDescription,
      category: o.category,
    }))

  const categoryExamples = Object.values(catOverrides)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20)
    .map((o) => ({
      merchant: o.merchantName ?? '',
      category: o.category,
    }))

  return {
    descriptionExamples,
    categoryExamples,
    customCategories: listCustomCategories(),
    customPatterns: listCustomPatterns(),
  }
}

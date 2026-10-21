import type { CustomPattern } from '../services/categorizer/custom-patterns'
import {
  merchantOverrideKey,
  type CategoryOverrides,
} from '../services/categorizer/category-overrides'
import type { DescriptionOverrides } from '../services/descriptions/description-overrides'
import { buildDescriptionOverrideKey } from '../services/descriptions/normalization'
import type { UserRules } from '../services/categorizer/user-rules'

const UPDATED_AT = '2026-03-01T00:00:00.000Z'

/**
 * A `UserRules` value for a test, keyed exactly as the stores key them, so a
 * test never exercises the legacy-key fallback by accident. Each rule is
 * written the way the user made it: a description override from the row's
 * description, a merchant override from the merchant's description.
 */
export function userRules(input: {
  descriptionOverrides?: Array<{
    description: string
    friendlyDescription: string
    category?: string
  }>
  merchantOverrides?: Array<{ merchantName: string; category: string }>
  customPatterns?: Array<Omit<CustomPattern, 'id' | 'createdAt'>>
}): UserRules {
  const descriptionOverrides: DescriptionOverrides = {}
  for (const o of input.descriptionOverrides ?? []) {
    const key = buildDescriptionOverrideKey(o.description)
    if (!key) throw new Error(`no override key for "${o.description}"`)
    descriptionOverrides[key] = {
      descriptionOriginal: o.description,
      friendlyDescription: o.friendlyDescription,
      category: o.category,
      updatedAt: UPDATED_AT,
    }
  }
  const merchantOverrides: CategoryOverrides = {}
  for (const o of input.merchantOverrides ?? []) {
    const key = merchantOverrideKey(o.merchantName)
    if (!key) throw new Error(`no override key for "${o.merchantName}"`)
    merchantOverrides[key] = {
      merchantName: o.merchantName,
      category: o.category,
      updatedAt: UPDATED_AT,
    }
  }
  const customPatterns = (input.customPatterns ?? []).map((p, i) => ({
    ...p,
    id: `cp_test_${i}`,
    createdAt: UPDATED_AT,
  }))
  return { descriptionOverrides, merchantOverrides, customPatterns }
}

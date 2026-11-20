/**
 * The user's categorization rules as one value, handed to the categorizer
 * instead of read by it from the stores. Each rule type keeps its single
 * owner (the stores below: loaded by the workspace, written by the
 * mutations); `currentUserRules()` is how a call site reads them all at once,
 * at the moment it categorizes. An empty value means "rules withheld": the
 * built-in sources only, as the categorizer eval scores them.
 */
import {
  findMerchantCategoryOverride,
  listMerchantCategoryOverrides,
  type CategoryOverrides,
} from './category-overrides'
import {
  findDescriptionOverride,
  listDescriptionOverrides,
  type DescriptionOverrides,
} from '../descriptions/description-overrides'
import {
  firstMatchingPattern,
  listCustomPatterns,
  matchCustomPattern,
  testPattern,
  type CustomPattern,
} from './custom-patterns'
import { isSplitParentTx, type Transaction } from '../../models'
import { normalizeCategoryId } from '../categories/category-aliases'
import { effectiveConfidence } from './confidence'

/** Read-only: a value is never changed after it is read (see currentUserRules). */
export interface UserRules {
  /** Renames (and optionally recategorizes) rows by their description. */
  readonly descriptionOverrides: Readonly<DescriptionOverrides>
  /** A category per merchant; the learned patterns are built from these. */
  readonly merchantOverrides: Readonly<CategoryOverrides>
  /** The user's pattern rules (Categorías → reglas). */
  readonly customPatterns: readonly CustomPattern[]
}

export function emptyUserRules(): UserRules {
  return { descriptionOverrides: {}, merchantOverrides: {}, customPatterns: [] }
}

/**
 * A snapshot of the signed-in user's rules as the stores hold them now. The
 * stores replace their objects on every write, never mutate them, so the
 * snapshot keeps exactly these rules however long it is held: read it after
 * the last await before the rules are used, so it is current.
 */
export function currentUserRules(): UserRules {
  return {
    descriptionOverrides: listDescriptionOverrides(),
    merchantOverrides: listMerchantCategoryOverrides(),
    customPatterns: listCustomPatterns(),
  }
}

/**
 * True when a rule the user wrote covers a row with this description: a
 * description override, a merchant override, or a custom pattern. Such a row
 * keeps what the user decided — the AI neither recategorizes nor renames it
 * (import, and the dev AI preview, use this one gate).
 *
 * A description override that only renames the row (no category) counts:
 * the AI must not rename it again. The categorizer's first step, by
 * contrast, takes a description override only when it sets a category — the
 * row's category then comes from the next source, as before.
 */
export function hasUserRule(rules: UserRules, description: string): boolean {
  return (
    !!findDescriptionOverride(rules.descriptionOverrides, description) ||
    !!findMerchantCategoryOverride(rules.merchantOverrides, description) ||
    !!matchCustomPattern(description, rules.customPatterns)
  )
}

/**
 * THE rows a custom rule would change now — what "Aplicar a las N" counts and
 * `applyPatternToPast` writes, so the button never promises more or less than
 * the write does. A row counts when the pattern matches it and the rule is the
 * one the categorizer would pick for it (no categorized description override,
 * no merchant override, no earlier rule; an unlisted rule is decided by its
 * pattern alone), it is not a split row, was not categorized by hand
 * (confidence 1) and does not already carry the rule's category (and name,
 * when the rule sets one). Categories compare normalized: a stored rule can
 * hold a legacy id.
 */
export function rowsRuleWouldChange(
  rows: readonly Transaction[],
  rule: CustomPattern,
  rules: UserRules
): Transaction[] {
  const listed = rules.customPatterns.some((p) => p.id === rule.id)
  const ruleCategory = normalizeCategoryId(rule.category)
  return rows.filter((tx) => {
    if (isSplitParentTx(tx) || tx.splitParentId) return false
    if (!testPattern(tx.description, rule)) return false
    if (effectiveConfidence(tx) >= 1) return false
    if (
      findDescriptionOverride(rules.descriptionOverrides, tx.description)
        ?.category
    )
      return false
    if (findMerchantCategoryOverride(rules.merchantOverrides, tx.description))
      return false
    if (
      listed &&
      firstMatchingPattern(tx.description, rules.customPatterns)?.id !== rule.id
    )
      return false
    const sameCategory = normalizeCategoryId(tx.category) === ruleCategory
    const sameName =
      !rule.description || tx.displayDescription === rule.description
    return !(sameCategory && sameName)
  })
}

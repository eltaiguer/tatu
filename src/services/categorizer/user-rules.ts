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
 * True when the user renamed this description (a description override with a
 * friendly name, with or without a category). A rule never writes a name over
 * it: for the name part there is nothing to change.
 */
export function isRenamedByUser(
  rules: UserRules,
  description: string
): boolean {
  return !!findDescriptionOverride(rules.descriptionOverrides, description)
    ?.friendlyDescription
}

// A categorized description override or a merchant override wins over every
// custom pattern (categorizer steps 1-2).
function overrideWins(description: string, rules: UserRules): boolean {
  return (
    !!findDescriptionOverride(rules.descriptionOverrides, description)
      ?.category ||
    !!findMerchantCategoryOverride(rules.merchantOverrides, description)
  )
}

// The custom pattern the categorizer would pick for this description, or null
// when an override wins first or no pattern matches (steps 1-3).
function winningRule(
  description: string,
  rules: UserRules
): CustomPattern | null {
  if (overrideWins(description, rules)) return null
  return firstMatchingPattern(description, rules.customPatterns) ?? null
}

// A row any rule may still change: not a split row, not categorized by hand,
// and no override wins over a custom pattern.
function isOpenToRules(tx: Transaction, rules: UserRules): boolean {
  if (isSplitParentTx(tx) || tx.splitParentId) return false
  if (effectiveConfidence(tx) >= 1) return false
  return !overrideWins(tx.description, rules)
}

// Categories compare normalized: a stored rule can hold a legacy id.
function sameCategory(a: string | undefined, b: string | undefined): boolean {
  return normalizeCategoryId(a) === normalizeCategoryId(b)
}

// The rule would change the row: it differs in category, or in the name the
// rule sets (unless the user renamed the row).
function differsFromRule(
  tx: Transaction,
  rule: CustomPattern,
  rules: UserRules
): boolean {
  const sameName =
    !rule.description ||
    tx.displayDescription === rule.description ||
    isRenamedByUser(rules, tx.description)
  return !(sameCategory(tx.category, rule.category) && sameName)
}

/**
 * THE rows a custom rule would change now — what "Aplicar a las N" counts and
 * `applyPatternToPast` writes, so the button never promises more or less than
 * the write does. A row counts when the pattern matches it and the rule is the
 * one the categorizer would pick for it (no categorized description override,
 * no merchant override, no earlier rule; an unlisted rule is decided by its
 * pattern alone), it is not a split row, was not categorized by hand
 * (confidence 1) and does not already carry the rule's category (and name,
 * when the rule sets one and the user did not rename the row). Categories
 * compare normalized: a stored rule can hold a legacy id.
 */
export function rowsRuleWouldChange(
  rows: readonly Transaction[],
  rule: CustomPattern,
  rules: UserRules
): Transaction[] {
  const listed = rules.customPatterns.some((p) => p.id === rule.id)
  return rows.filter((tx) => {
    if (!isOpenToRules(tx, rules)) return false
    if (!testPattern(tx.description, rule)) return false
    if (
      listed &&
      firstMatchingPattern(tx.description, rules.customPatterns)?.id !== rule.id
    )
      return false
    return differsFromRule(tx, rule, rules)
  })
}

/**
 * `rowsRuleWouldChange(...).length` for every listed rule, in one pass over
 * the rows (the winning rule is found once per row): what Categorías shows on
 * each rule's "Aplicar a las N".
 */
export function countRowsEachRuleWouldChange(
  rows: readonly Transaction[],
  rules: UserRules
): Map<string, number> {
  const counts = new Map(rules.customPatterns.map((p) => [p.id, 0]))
  for (const tx of rows) {
    if (!isOpenToRules(tx, rules)) continue
    const winner = firstMatchingPattern(tx.description, rules.customPatterns)
    if (winner && differsFromRule(tx, winner, rules)) {
      counts.set(winner.id, (counts.get(winner.id) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * True when the row carries the category its winning custom pattern gives it:
 * the row has a category, no categorized description override or merchant
 * override wins over the pattern, and the first matching pattern's category
 * (normalized: a rule can hold a legacy id) is the row's. Such a row is the
 * user's rule at work, so transfer inference leaves it alone (#289). Compares
 * the category only, never the name.
 */
export function isCategorizedByRule(
  tx: Transaction,
  rules: UserRules
): boolean {
  if (!tx.category) return false
  const winner = winningRule(tx.description, rules)
  return !!winner && sameCategory(tx.category, winner.category)
}

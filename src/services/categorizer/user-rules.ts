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
  listCustomPatterns,
  matchCustomPattern,
  type CustomPattern,
} from './custom-patterns'

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

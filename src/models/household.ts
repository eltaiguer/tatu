/**
 * Whether an expense was for the household/family (UI "Hogar"), as every
 * surface reads it: Hogar or not (ADR-0007; an uncategorized row nobody has
 * flagged is not household).
 */
export type HouseholdStatus = 'household' | 'not_household'

/** The Transacciones Hogar filter: everything, or only household expenses. */
export type HouseholdFilter = 'all' | 'household'

/** A row's household status and where it came from. */
export interface HouseholdResolution {
  status: HouseholdStatus
  /** Where the value comes from: the row's own choice, its merchant's rule or its category. */
  source: 'row' | 'merchant' | 'category'
}

/**
 * The user's per-category household defaults, keyed by normalized category id.
 * Build it with buildCategoryHousehold, which normalizes the keys.
 */
export type CategoryHousehold = ReadonlyMap<string, boolean>

/** The user's merchant household rules, keyed by merchantOverrideKey. */
export type MerchantHousehold = ReadonlyMap<string, boolean>

/** Everything resolveHousehold reads besides the row. */
export interface HouseholdRules {
  categories: CategoryHousehold
  merchants: MerchantHousehold
}

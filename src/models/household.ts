/**
 * Whether an expense was for the household/family (UI "Hogar"), as every
 * surface reads it. 'unassigned' ("Sin definir") is an uncategorized row
 * nobody has flagged yet: counted on neither side.
 */
export type HouseholdStatus = 'household' | 'not_household' | 'unassigned'

/** The Transacciones Hogar filter: everything, or one household status. */
export type HouseholdFilter = 'all' | 'household' | 'unassigned'

/** A row's household status and where it came from. */
export interface HouseholdResolution {
  status: HouseholdStatus
  /** The row's own choice, not its category's default. */
  isOverride: boolean
}

/**
 * The user's per-category household defaults, keyed by normalized category id.
 * Build it with buildCategoryHousehold, which normalizes the keys.
 */
export type CategoryHousehold = ReadonlyMap<string, boolean>

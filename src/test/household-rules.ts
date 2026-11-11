import { buildCategoryHousehold } from '../services/household/household'
import type { HouseholdRules } from '../models'

/** A HouseholdRules literal for fixtures: category defaults + merchant rules. */
export function householdRulesOf({
  categories = [],
  merchants = [],
}: {
  categories?: Iterable<readonly [string, boolean]>
  merchants?: Iterable<readonly [string, boolean]>
} = {}): HouseholdRules {
  return {
    categories: buildCategoryHousehold(categories),
    merchants: new Map(merchants),
  }
}

/** Only category defaults, in the shape fixtures write them. */
export function categoryRules(
  entries: Iterable<readonly [string, boolean]> = []
): HouseholdRules {
  return householdRulesOf({ categories: entries })
}

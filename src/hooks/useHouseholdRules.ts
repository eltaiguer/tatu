import { useSyncExternalStore } from 'react'
import type { HouseholdRules } from '../models'
import { currentHouseholdRules } from '../services/household/household'
import { subscribeHouseholdRules } from '../services/household/household-rules-store'

/**
 * The user's household rules for rendering. Re-renders when a merchant rule
 * changes, even if no row was written (a rule alone can change what rows
 * show). Category defaults are read with it; they re-read on the next render
 * as before. The same object comes back until either changes.
 */
export function useHouseholdRules(): HouseholdRules {
  return useSyncExternalStore(subscribeHouseholdRules, currentHouseholdRules)
}

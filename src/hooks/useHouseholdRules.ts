import { useSyncExternalStore } from 'react'
import type { HouseholdRules } from '../models'
import { currentHouseholdRules } from '../services/household/household'
import {
  listHouseholdRuleRecords,
  subscribeHouseholdRules,
} from '../services/household/household-rules-store'
import type { HouseholdRuleRecord } from '../services/supabase/household-rules'

/**
 * The user's household rules for rendering. Re-renders when a merchant rule
 * changes, even if no row was written (a rule alone can change what rows
 * show). Category defaults are read with it; they re-read on the next render
 * as before. The same object comes back until either changes.
 */
export function useHouseholdRules(): HouseholdRules {
  return useSyncExternalStore(subscribeHouseholdRules, currentHouseholdRules)
}

/**
 * The household rules as records (name, dates), newest first, for the
 * Categorías list. Re-renders on any change to them, from anywhere.
 */
export function useHouseholdRuleRecords(): readonly HouseholdRuleRecord[] {
  return useSyncExternalStore(subscribeHouseholdRules, listHouseholdRuleRecords)
}

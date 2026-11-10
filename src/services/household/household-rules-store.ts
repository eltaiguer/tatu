import type { MerchantHousehold } from '../../models'
import type { HouseholdRuleRecord } from '../supabase/household-rules'

// The user's merchant household rules, keyed by merchantOverrideKey. Like the
// category override store: replaced, never mutated, on every write, so the
// map's identity changes exactly when the rules do (currentHouseholdRules
// caches on it).
let rules: MerchantHousehold = new Map()

export function listMerchantHouseholdRules(): MerchantHousehold {
  return rules
}

/** Loads a user's stored rows (the workspace load). */
export function loadHouseholdRules(records: HouseholdRuleRecord[]): void {
  rules = new Map(records.map((r) => [r.merchantNormalized, r.isHousehold]))
}

export function putMerchantHouseholdRule(
  key: string,
  isHousehold: boolean
): void {
  rules = new Map(rules).set(key, isHousehold)
}

export function deleteMerchantHouseholdRule(key: string): void {
  if (!rules.has(key)) return
  const next = new Map(rules)
  next.delete(key)
  rules = next
}

export function clearHouseholdRules(): void {
  rules = new Map()
}

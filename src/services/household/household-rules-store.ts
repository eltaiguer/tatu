import type { MerchantHousehold } from '../../models'
import type { HouseholdRuleRecord } from '../supabase/household-rules'

// The user's merchant household rules, keyed by merchantOverrideKey. Like the
// category override store: replaced, never mutated, on every write, so the
// map's identity changes exactly when the rules do (currentHouseholdRules
// caches on it).
let rules: MerchantHousehold = new Map()

// Screens that show a resolved house subscribe (useHouseholdRules): a rule
// can change what rows show without any row being written, so nothing else
// would re-render them.
const listeners = new Set<() => void>()

export function subscribeHouseholdRules(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function replaceRules(next: MerchantHousehold): void {
  rules = next
  for (const listener of [...listeners]) listener()
}

export function listMerchantHouseholdRules(): MerchantHousehold {
  return rules
}

/** Loads a user's stored rows (the workspace load). */
export function loadHouseholdRules(records: HouseholdRuleRecord[]): void {
  replaceRules(
    new Map(records.map((r) => [r.merchantNormalized, r.isHousehold]))
  )
}

export function putMerchantHouseholdRule(
  key: string,
  isHousehold: boolean
): void {
  replaceRules(new Map(rules).set(key, isHousehold))
}

export function deleteMerchantHouseholdRule(key: string): void {
  if (!rules.has(key)) return
  const next = new Map(rules)
  next.delete(key)
  replaceRules(next)
}

export function clearHouseholdRules(): void {
  replaceRules(new Map())
}

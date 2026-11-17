import type { MerchantHousehold } from '../../models'
import type { HouseholdRuleRecord } from '../supabase/household-rules'

// The user's merchant household rules, keyed by merchantOverrideKey. Like the
// category override store: replaced, never mutated, on every write, so the
// map's identity changes exactly when the rules do (currentHouseholdRules
// caches on it).
let rules: MerchantHousehold = new Map()
// The same rules as full records (name, dates), for the Categorías list. Kept
// beside `rules` and replaced with it, newest created first.
let records: ReadonlyMap<string, HouseholdRuleRecord> = new Map()
let sortedRecords: readonly HouseholdRuleRecord[] = []

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

function replaceRecords(next: ReadonlyMap<string, HouseholdRuleRecord>): void {
  records = next
  rules = new Map([...next].map(([key, r]) => [key, r.isHousehold]))
  // Newest created first: flipping a rule's value does not move it. Ties by
  // key so the order is deterministic.
  sortedRecords = [...next.values()].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) ||
      a.merchantNormalized.localeCompare(b.merchantNormalized)
  )
  for (const listener of [...listeners]) listener()
}

export function listMerchantHouseholdRules(): MerchantHousehold {
  return rules
}

/**
 * The rules as records, newest first. The same array comes back until a
 * write (useSyncExternalStore needs a stable snapshot).
 */
export function listHouseholdRuleRecords(): readonly HouseholdRuleRecord[] {
  return sortedRecords
}

/** Loads a user's stored rows (the workspace load). */
export function loadHouseholdRules(loaded: HouseholdRuleRecord[]): void {
  replaceRecords(new Map(loaded.map((r) => [r.merchantNormalized, r])))
}

/**
 * Mirrors a saved rule, as Postgres would: a new rule gets its creation date
 * (and the name it was made from); an existing one keeps both and only bumps
 * `updatedAt`.
 */
export function putMerchantHouseholdRule(
  key: string,
  isHousehold: boolean,
  merchantOriginal?: string
): void {
  const now = new Date().toISOString()
  const existing = records.get(key)
  replaceRecords(
    new Map(records).set(key, {
      merchantNormalized: key,
      merchantOriginal: merchantOriginal ?? existing?.merchantOriginal,
      isHousehold,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
  )
}

export function deleteMerchantHouseholdRule(key: string): void {
  if (!records.has(key)) return
  const next = new Map(records)
  next.delete(key)
  replaceRecords(next)
}

export function clearHouseholdRules(): void {
  replaceRecords(new Map())
}

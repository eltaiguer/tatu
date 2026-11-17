import type { MerchantHousehold } from '../../models'
import type { HouseholdRuleRecord } from '../supabase/household-rules'
import type { Repository } from '../repository/repository'
import { isWorkspaceOwner } from '../../stores/workspace-state'
import { WorkspaceChangedError } from '../../utils/user-error'

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
  // By instant, not by string: Postgres and the local mirror format
  // timestamps differently ("…Z", "…+00:00", with or without milliseconds).
  sortedRecords = [...next.values()].sort(
    (a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
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
 * Mirrors a saved rule, as Postgres does: the row holds exactly what was
 * sent (name included), a new rule gets its creation date and an existing
 * one keeps it and only bumps `updatedAt`.
 */
export function putMerchantHouseholdRule(
  key: string,
  isHousehold: boolean,
  merchantOriginal?: string
): void {
  const now = new Date().toISOString()
  replaceRecords(
    new Map(records).set(key, {
      merchantNormalized: key,
      merchantOriginal,
      isHousehold,
      createdAt: records.get(key)?.createdAt ?? now,
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

type RuleRepository = Pick<
  Repository,
  'userId' | 'upsertHouseholdRule' | 'deleteHouseholdRule'
>

// A write starts only for the user who owns the loaded workspace: an undo
// toast outlives a sign-out, and must not write against the previous user's
// repository.
function requireOwner(repo: RuleRepository): void {
  if (!isWorkspaceOwner(repo.userId)) throw new WorkspaceChangedError()
}

/**
 * Deletes a merchant's rule: server first, then the screen ("screen mirrors
 * database"), so a failure leaves both as they were. Resolves with the
 * removed record (the Deshacer payload), or undefined when there was no rule.
 * Rows' own choices are not touched: only rows that followed the rule go back
 * to their category.
 */
export async function deleteHouseholdRuleWithSync(
  repo: RuleRepository,
  key: string
): Promise<HouseholdRuleRecord | undefined> {
  requireOwner(repo)
  const existing = records.get(key)
  if (!existing) return undefined
  await repo.deleteHouseholdRule(key)
  if (!isWorkspaceOwner(repo.userId)) throw new WorkspaceChangedError()
  deleteMerchantHouseholdRule(key)
  return existing
}

/**
 * Puts a deleted rule back exactly (value, name and creation date, so it
 * keeps its place in the list, also after a reload). Server first. If the
 * merchant got a new rule meanwhile, the old value wins (last write).
 */
export async function restoreHouseholdRuleWithSync(
  repo: RuleRepository,
  record: HouseholdRuleRecord
): Promise<void> {
  requireOwner(repo)
  await repo.upsertHouseholdRule({
    merchantNormalized: record.merchantNormalized,
    merchantOriginal: record.merchantOriginal,
    isHousehold: record.isHousehold,
    createdAt: record.createdAt,
  })
  if (!isWorkspaceOwner(repo.userId)) throw new WorkspaceChangedError()
  // The upsert returns no row: the server stamped updated_at, so the mirror
  // does too.
  replaceRecords(
    new Map(records).set(record.merchantNormalized, {
      ...record,
      updatedAt: new Date().toISOString(),
    })
  )
}

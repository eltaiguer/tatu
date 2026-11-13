// The in-memory adapter of the repository port (#119): a whole user's stored
// data in plain maps, with the same chunking as Supabase (`batching.ts`) so a
// failure injected into "the chunk holding tx-150" hits the same rows it
// would in production. Tests assert on what ends up here and in the store,
// not on request payloads.
import type { Transaction } from '../../models'
import type { ExistingTransaction } from '../dedup/import-dedup'
import type { CategoryOverrideRecord } from '../supabase/category-overrides'
import type { HouseholdRuleRecord } from '../supabase/household-rules'
import type { DescriptionOverrideRecord } from '../supabase/description-overrides'
import type { CustomCategoryRecord } from '../supabase/custom-categories'
import type { UserPreferences } from '../supabase/user-preferences'
import type { CustomPattern } from '../categorizer/custom-patterns'
import type { CachedInsightsRow } from '../supabase/ai-insights'
import { UserFacingError } from '../../utils/user-error'
import type { InsightsMode } from '../insights/insight-data'
import { groupByPatch, insertSequentially, settleChunks } from './batching'
import {
  applyPatch,
  SPLIT_CONFLICT_MESSAGE,
  SplitIncompleteError,
  UnsplitIncompleteError,
  type ImportFileType,
  type Repository,
  type TransactionPatch,
  type WriteOutcome,
} from './repository'

const CANDIDATE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000

/** Operations a test can make fail or pause. */
export type InMemoryOp =
  | 'load'
  | 'loadTransactions'
  | 'findImportCandidates'
  | 'findExistingIds'
  | 'insert'
  | 'update'
  | 'softDelete'
  | 'restore'
  | 'hardDelete'
  | 'splitParts'
  | 'splitMark'
  | 'splitUndo'
  | 'unsplitMark'
  | 'unsplitParts'
  | 'unsplitRemark'
  | 'createImportRun'
  | 'completeImportRun'
  | 'failImportRun'
  | 'upsertDescriptionOverride'
  | 'deleteDescriptionOverride'
  | 'upsertCategoryOverride'
  | 'deleteCategoryOverride'
  | 'upsertHouseholdRule'
  | 'deleteHouseholdRule'
  | 'upsertCustomPattern'
  | 'deleteCustomPattern'
  | 'upsertCustomCategory'
  | 'archiveCustomCategory'
  | 'savePreferences'
  | 'loadInsights'
  | 'saveInsights'
  /** One request per table; `when` receives `[tableName]`. */
  | 'resetAll'

interface Fault {
  op: InMemoryOp
  /** Fails only requests whose ids (chunk) or rows match. Default: all. */
  when?: (ids: string[]) => boolean
  /** How many matching requests fail; default: every one. */
  times?: number
  error: Error
}

export interface ImportRunRecord {
  id: string
  fileName: string
  fileType: ImportFileType
  fileChecksum: string
  status: 'processing' | 'completed' | 'failed'
  errorMessage?: string
  stats?: { totalRows: number; insertedRows: number; duplicateRows: number }
}

interface StoredRow {
  tx: Transaction
  deleted: boolean
}

export interface InMemoryRepository extends Repository {
  /** Live (not deleted) rows, in insertion order. */
  rows(): Transaction[]
  row(id: string): Transaction | undefined
  isDeleted(id: string): boolean
  /** Ids that exist in any state. */
  has(id: string): boolean
  descriptionOverrides: Map<string, DescriptionOverrideRecord>
  categoryOverrides: Map<string, CategoryOverrideRecord>
  householdRules: Map<string, HouseholdRuleRecord>
  customPatterns: Map<string, CustomPattern>
  customCategories: Map<string, CustomCategoryRecord>
  preferences: UserPreferences | null
  insights: CachedInsightsRow | null
  /** Hogar's own cache row (ai_household_insights). */
  householdInsights: CachedInsightsRow | null
  importRuns: ImportRunRecord[]
  /** Makes matching requests of `op` reject. */
  failOn(
    op: InMemoryOp,
    options?: {
      when?: (ids: string[]) => boolean
      times?: number
      error?: Error
    }
  ): void
  /**
   * Pauses the next request of `op` until `release()` — for races (e.g. a
   * user switch while a write is in flight). The write lands on release.
   */
  hold(op: InMemoryOp): { release: () => void }
  /** Requests made per op, for chunking assertions. */
  requests: Partial<Record<InMemoryOp, number>>
  /**
   * Whose token the client is sending (default: this repository's user).
   * Like RLS + `.eq('user_id')`: under another user, row writes match
   * nothing and inserts are rejected.
   */
  actingUserId: string
}

// The row each mode's cache lives in (ai_insights / ai_household_insights).
const INSIGHTS_SLOTS = {
  todo: 'insights',
  hogar: 'householdInsights',
} as const satisfies Record<InsightsMode, string>

export function createInMemoryRepository(
  seed: {
    userId?: string
    transactions?: Transaction[]
    deleted?: Transaction[]
    descriptionOverrides?: DescriptionOverrideRecord[]
    categoryOverrides?: CategoryOverrideRecord[]
    householdRules?: HouseholdRuleRecord[]
    customPatterns?: CustomPattern[]
    customCategories?: CustomCategoryRecord[]
    preferences?: UserPreferences | null
  } = {}
): InMemoryRepository {
  const userId = seed.userId ?? 'user-1'
  const table = new Map<string, StoredRow>()
  for (const tx of seed.transactions ?? []) {
    table.set(tx.id, { tx: clone(tx), deleted: false })
  }
  for (const tx of seed.deleted ?? []) {
    table.set(tx.id, { tx: clone(tx), deleted: true })
  }
  const faults: Fault[] = []
  const holds = new Map<InMemoryOp, Promise<void>[]>()
  const requests: Partial<Record<InMemoryOp, number>> = {}
  let nextRunId = 1
  const authorized = () => repo.actingUserId === userId
  function requireAuthorized() {
    if (!authorized()) {
      throw new Error('new row violates row-level security policy')
    }
  }

  // Every request goes through here: counted, maybe paused, maybe failed.
  async function request(op: InMemoryOp, ids: string[] = []): Promise<void> {
    requests[op] = (requests[op] ?? 0) + 1
    const pending = holds.get(op)?.shift()
    if (pending) await pending
    const fault = faults.find(
      (f) => f.op === op && (f.times ?? 1) > 0 && (!f.when || f.when(ids))
    )
    if (fault) {
      if (fault.times !== undefined) fault.times -= 1
      throw fault.error
    }
  }

  const repo: InMemoryRepository = {
    userId,
    descriptionOverrides: new Map(
      (seed.descriptionOverrides ?? []).map((o) => [o.descriptionNormalized, o])
    ),
    categoryOverrides: new Map(
      (seed.categoryOverrides ?? []).map((o) => [o.merchantNormalized, o])
    ),
    householdRules: new Map(
      (seed.householdRules ?? []).map((o) => [o.merchantNormalized, o])
    ),
    customPatterns: new Map((seed.customPatterns ?? []).map((p) => [p.id, p])),
    customCategories: new Map(
      (seed.customCategories ?? []).map((c) => [c.id, c])
    ),
    preferences: seed.preferences ?? null,
    insights: null,
    householdInsights: null,
    importRuns: [],
    requests,
    actingUserId: userId,

    rows: () =>
      Array.from(table.values())
        .filter((r) => !r.deleted)
        .map((r) => clone(r.tx)),
    row: (id) => {
      const stored = table.get(id)
      return stored && !stored.deleted ? clone(stored.tx) : undefined
    },
    isDeleted: (id) => table.get(id)?.deleted === true,
    has: (id) => table.has(id),

    failOn(op, options = {}) {
      faults.push({
        op,
        when: options.when,
        times: options.times ?? Infinity,
        error: options.error ?? new Error(`${op} failed`),
      })
    },
    hold(op) {
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      holds.set(op, [...(holds.get(op) ?? []), gate])
      return { release }
    },

    async loadWorkspace() {
      await request('load')
      // As RLS: another user's token reads nothing.
      if (!authorized()) {
        return {
          transactions: [],
          categoryOverrides: [],
          householdRules: [],
          descriptionOverrides: [],
          customPatterns: [],
          customCategories: [],
          preferences: null,
        }
      }
      return {
        transactions: repo.rows().map(clone),
        categoryOverrides: Array.from(repo.categoryOverrides.values()),
        householdRules: Array.from(repo.householdRules.values()),
        descriptionOverrides: Array.from(repo.descriptionOverrides.values()),
        customPatterns: Array.from(repo.customPatterns.values()),
        customCategories: Array.from(repo.customCategories.values()).filter(
          (c) => !c.isArchived
        ),
        preferences: repo.preferences,
      }
    },
    async loadTransactions() {
      await request('loadTransactions')
      return authorized() ? repo.rows().map(clone) : []
    },
    async savePreferences(preferences) {
      await request('savePreferences')
      requireAuthorized()
      repo.preferences = { ...preferences }
    },

    async findImportCandidates(incoming): Promise<ExistingTransaction[]> {
      await request('findImportCandidates')
      // As Supabase: any row holding an incoming id, plus the non-part rows
      // of the file's sources dated within its range ± 2 days.
      if (incoming.length === 0) return []
      const sources = new Set(incoming.map((tx) => tx.source))
      const ids = new Set(incoming.map((tx) => tx.id))
      const times = incoming.map((tx) => tx.date.getTime())
      const from = Math.min(...times) - CANDIDATE_WINDOW_MS
      const to = Math.max(...times) + CANDIDATE_WINDOW_MS
      return Array.from(table.values())
        .filter(
          (r) =>
            ids.has(r.tx.id) ||
            (sources.has(r.tx.source) &&
              !r.tx.splitParentId &&
              r.tx.date.getTime() >= from &&
              r.tx.date.getTime() <= to)
        )
        .map((r) => ({ tx: clone(r.tx), deleted: r.deleted }))
    },
    async findExistingIds(ids) {
      await request('findExistingIds', ids)
      const active = new Set<string>()
      const deleted = new Set<string>()
      for (const id of ids) {
        const stored = table.get(id)
        if (!stored) continue
        if (stored.deleted) deleted.add(id)
        else active.add(id)
      }
      return { active, deleted }
    },

    insertTransactions(rows, options) {
      return insertSequentially(
        rows,
        async (part) => {
          await request(
            'insert',
            part.map((tx) => tx.id)
          )
          requireAuthorized()
          // Like the primary key: a taken id fails the whole statement.
          if (part.some((tx) => table.has(tx.id))) {
            throw new UserFacingError(
              'Algunas transacciones ya estaban guardadas (¿otra importación en curso?). Recargá e importá de nuevo.'
            )
          }
          for (const tx of part) {
            // As `import_id` on Supabase, read back on load.
            const row = clone(tx)
            if (options?.importId) row.importId = options.importId
            table.set(tx.id, { tx: row, deleted: false })
          }
        },
        options?.shouldContinue
      )
    },
    updateTransactions(changes: ReadonlyMap<string, TransactionPatch>) {
      return settleChunks(
        groupByPatch(changes).map(({ patch, ids }) => ({
          ids,
          write: async (chunk) => {
            await request('update', chunk)
            // RLS + `.eq('user_id')`: only this user's rows, deleted or not.
            const hit = authorized() ? chunk.filter((id) => table.has(id)) : []
            for (const id of hit) {
              const stored = table.get(id)!
              stored.tx = applyPatch(stored.tx, patch)
            }
            return hit
          },
        }))
      )
    },
    softDeleteTransactions(ids) {
      return setDeleted('softDelete', ids, true)
    },
    restoreTransactions(ids) {
      return setDeleted('restore', ids, false)
    },
    hardDeleteTransactions(ids) {
      return settleChunks([
        {
          ids,
          write: async (chunk) => {
            await request('hardDelete', chunk)
            // DELETE ... RETURNING: only what existed.
            const hit = authorized() ? chunk.filter((id) => table.has(id)) : []
            hit.forEach((id) => table.delete(id))
            return hit
          },
        },
      ])
    },
    // Same order and outcomes as the Supabase adapter: parts, then the flag
    // on the stored row (only the flag — the rest of the row is kept).
    async splitTransaction(parent, parts) {
      const partIds = parts.map((p) => p.id)
      await request('splitParts', partIds)
      requireAuthorized()
      // An insert, as on Supabase: parts already there (another device's
      // split) fail it as a whole, and nothing is overwritten.
      if (partIds.some((id) => table.has(id))) {
        throw new UserFacingError(SPLIT_CONFLICT_MESSAGE)
      }
      for (const part of parts) {
        table.set(part.id, { tx: clone(part), deleted: false })
      }
      const removeParts = () => partIds.forEach((id) => table.delete(id))
      try {
        await request('splitMark', [parent.id])
      } catch (error) {
        try {
          await request('splitUndo', [parent.id])
        } catch {
          throw new SplitIncompleteError(error)
        }
        removeParts()
        throw error
      }
      const stored = table.get(parent.id)
      if (!stored || stored.deleted || stored.tx.isSplitParent) {
        removeParts()
        throw new UserFacingError(SPLIT_CONFLICT_MESSAGE)
      }
      stored.tx = { ...stored.tx, isSplitParent: true }
    },
    async unsplitTransaction(parent) {
      await request('unsplitMark', [parent.id])
      const stored = authorized() ? table.get(parent.id) : undefined
      if (!stored || stored.deleted) {
        throw new UserFacingError(
          'La transacción ya no existe. Recargá para ver el estado actual.'
        )
      }
      stored.tx = { ...stored.tx, isSplitParent: false }
      try {
        await request('unsplitParts', [parent.id])
      } catch (error) {
        try {
          await request('unsplitRemark', [parent.id])
        } catch {
          throw new UnsplitIncompleteError(error)
        }
        stored.tx = { ...stored.tx, isSplitParent: true }
        throw error
      }
      for (const [id, row] of table) {
        if (row.tx.splitParentId === parent.id) table.delete(id)
      }
    },

    async createImportRun(input) {
      await request('createImportRun')
      requireAuthorized()
      const id = `import-${nextRunId++}`
      repo.importRuns.push({ id, ...input, status: 'processing' })
      return id
    },
    async completeImportRun(importId, stats) {
      await request('completeImportRun')
      requireAuthorized()
      const run = repo.importRuns.find((r) => r.id === importId)
      if (run) Object.assign(run, { status: 'completed', stats })
    },
    async failImportRun(importId, errorMessage) {
      await request('failImportRun')
      requireAuthorized()
      const run = repo.importRuns.find((r) => r.id === importId)
      if (run) Object.assign(run, { status: 'failed', errorMessage })
    },

    async upsertDescriptionOverride(input) {
      await request('upsertDescriptionOverride', [input.descriptionNormalized])
      requireAuthorized()
      const now = new Date().toISOString()
      repo.descriptionOverrides.set(input.descriptionNormalized, {
        descriptionNormalized: input.descriptionNormalized,
        descriptionOriginal: input.descriptionOriginal,
        friendlyDescription: input.friendlyDescription,
        category: input.category,
        createdAt: now,
        updatedAt: now,
      })
    },
    async deleteDescriptionOverride(key) {
      await request('deleteDescriptionOverride', [key])
      requireAuthorized()
      repo.descriptionOverrides.delete(key)
    },
    async upsertCategoryOverride(input) {
      await request('upsertCategoryOverride', [input.merchantNormalized])
      requireAuthorized()
      const now = new Date().toISOString()
      repo.categoryOverrides.set(input.merchantNormalized, {
        merchantNormalized: input.merchantNormalized,
        merchantOriginal: input.merchantOriginal,
        category: input.category,
        createdAt: now,
        updatedAt: now,
      })
    },
    async deleteCategoryOverride(key) {
      await request('deleteCategoryOverride', [key])
      requireAuthorized()
      repo.categoryOverrides.delete(key)
    },
    async upsertHouseholdRule(input) {
      await request('upsertHouseholdRule', [input.merchantNormalized])
      requireAuthorized()
      const now = new Date().toISOString()
      repo.householdRules.set(input.merchantNormalized, {
        merchantNormalized: input.merchantNormalized,
        merchantOriginal: input.merchantOriginal,
        isHousehold: input.isHousehold,
        createdAt: now,
        updatedAt: now,
      })
    },
    async deleteHouseholdRule(key) {
      await request('deleteHouseholdRule', [key])
      requireAuthorized()
      repo.householdRules.delete(key)
    },
    async upsertCustomPattern(pattern) {
      await request('upsertCustomPattern', [pattern.id])
      requireAuthorized()
      repo.customPatterns.set(pattern.id, { ...pattern })
    },
    async deleteCustomPattern(id) {
      await request('deleteCustomPattern', [id])
      requireAuthorized()
      repo.customPatterns.delete(id)
    },
    async upsertCustomCategory(input) {
      await request('upsertCustomCategory', [input.id])
      requireAuthorized()
      const now = new Date().toISOString()
      repo.customCategories.set(input.id, {
        id: input.id,
        label: input.label,
        color: input.color,
        icon: input.icon,
        isIgnored: input.isIgnored ?? false,
        // As the column behaves: absent keeps what is stored, null clears.
        isHousehold:
          input.isHousehold === undefined
            ? repo.customCategories.get(input.id)?.isHousehold
            : (input.isHousehold ?? undefined),
        isArchived: input.isArchived ?? false,
        createdAt: now,
        updatedAt: now,
      })
    },
    async archiveCustomCategory(id) {
      await request('archiveCustomCategory', [id])
      requireAuthorized()
      const existing = repo.customCategories.get(id)
      if (existing)
        repo.customCategories.set(id, { ...existing, isArchived: true })
    },

    async loadInsights(mode = 'todo') {
      await request('loadInsights')
      const cached = repo[INSIGHTS_SLOTS[mode]]
      return cached && authorized() ? { ...cached } : null
    },
    async saveInsights(row, mode = 'todo') {
      await request('saveInsights')
      requireAuthorized()
      const saved = { ...row, generatedAt: new Date().toISOString() }
      repo[INSIGHTS_SLOTS[mode]] = saved
    },

    // Same tables, same order and same failure rule as the Supabase adapter.
    // As RLS: under another user's token every delete is sent and matches
    // nothing.
    async resetAll() {
      const steps: [string, () => void][] = [
        ['transactions', () => table.clear()],
        ['import_runs', () => repo.importRuns.splice(0)],
        ['category_overrides', () => repo.categoryOverrides.clear()],
        ['household_rules', () => repo.householdRules.clear()],
        ['description_overrides', () => repo.descriptionOverrides.clear()],
        ['custom_categories', () => repo.customCategories.clear()],
        ['custom_patterns', () => repo.customPatterns.clear()],
        ['user_preferences', () => (repo.preferences = null)],
      ]
      for (const [name, clear] of steps) {
        await request('resetAll', [name])
        if (authorized()) clear()
      }
      // Both caches are best-effort, each on its own (as the adapter).
      const caches: [string, () => void][] = [
        ['ai_household_insights', () => (repo.householdInsights = null)],
        ['ai_insights', () => (repo.insights = null)],
      ]
      for (const [name, clear] of caches) {
        try {
          await request('resetAll', [name])
          if (authorized()) clear()
        } catch (error) {
          console.warn('Could not clear cached insights during reset:', error)
        }
      }
    },
  }

  function setDeleted(
    op: 'softDelete' | 'restore',
    ids: string[],
    deleted: boolean
  ): Promise<WriteOutcome> {
    return settleChunks([
      {
        ids,
        write: async (chunk) => {
          await request(op, chunk)
          const hit = authorized() ? chunk.filter((id) => table.has(id)) : []
          hit.forEach((id) => {
            table.get(id)!.deleted = deleted
          })
          return hit
        },
      },
    ])
  }

  return repo
}

function clone(tx: Transaction): Transaction {
  return {
    ...tx,
    date: new Date(tx.date),
    // As a stored row reads back: tags never null.
    tags: [...(tx.tags ?? [])],
  }
}

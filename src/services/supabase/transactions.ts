import type { Transaction } from '../../models'
import { getSupabaseClient, type SupabaseSession } from './client'
import { UserFacingError } from '../../utils/user-error'
import type { ExistingTransaction } from '../dedup/import-dedup'

interface TransactionRow {
  user_id: string
  transaction_id: string
  date: string
  description: string
  display_description?: string | null
  amount: number
  currency: string
  type: string
  source: string
  category: string | null
  tags?: string[] | null
  category_confidence: number | null
  balance: number | null
  raw_data: Record<string, unknown>
  import_id?: string | null
  created_at?: string
  is_deleted?: boolean
  deleted_at?: string | null
  is_split_parent?: boolean
  split_parent_id?: string | null
}

function transactionToRow(userId: string, tx: Transaction): TransactionRow {
  return {
    user_id: userId,
    transaction_id: tx.id,
    date: tx.date.toISOString(),
    description: tx.description,
    display_description: tx.displayDescription ?? null,
    amount: tx.amount,
    currency: tx.currency,
    type: tx.type,
    source: tx.source,
    category: tx.category ?? null,
    tags: tx.tags ?? [],
    category_confidence: tx.categoryConfidence ?? null,
    balance: tx.balance ?? null,
    raw_data: (tx.rawData ?? {}) as Record<string, unknown>,
    is_split_parent: tx.isSplitParent ?? false,
    split_parent_id: tx.splitParentId ?? null,
  }
}

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.transaction_id,
    date: new Date(row.date),
    description: row.description,
    displayDescription: row.display_description ?? undefined,
    amount: Number(row.amount),
    currency: row.currency as Transaction['currency'],
    type: row.type as Transaction['type'],
    source: row.source as Transaction['source'],
    category: row.category ?? undefined,
    tags: row.tags ?? [],
    categoryConfidence: row.category_confidence ?? undefined,
    balance: row.balance ?? undefined,
    rawData: row.raw_data ?? {},
    isSplitParent: row.is_split_parent ?? undefined,
    splitParentId: row.split_parent_id ?? undefined,
    importId: row.import_id ?? undefined,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
  }
}

// PostgREST silently truncates each response at its max-rows setting (1000 by
// default), so the full history has to be read page by page. Pages are keyed on
// the primary key (transaction_id > last seen) rather than offsets, so a row
// inserted or deleted elsewhere mid-load can't shift a later page and skip or
// duplicate a row. The loop ends on an empty page rather than a short one — a
// short page may just mean the server cap is lower than LOAD_PAGE_SIZE.
const LOAD_PAGE_SIZE = 1000

export async function loadUserTransactions(
  session: SupabaseSession
): Promise<Transaction[]> {
  const client = getSupabaseClient()
  const rows: TransactionRow[] = []

  for (;;) {
    let query = client
      .from('transactions')
      .select('*')
      .eq('user_id', session.user.id)
      .is('is_deleted', false)
    const lastId = rows[rows.length - 1]?.transaction_id
    if (lastId !== undefined) {
      query = query.gt('transaction_id', lastId)
    }
    const { data, error } = await query
      .order('transaction_id', { ascending: true })
      .limit(LOAD_PAGE_SIZE)

    if (error) {
      throw new Error(error.message)
    }
    if (!data || data.length === 0) {
      break
    }
    rows.push(...(data as TransactionRow[]))
  }

  return rows
    .map((row) => rowToTransaction(row))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
}

/**
 * Saves the new rows of an import. A plain insert, not an upsert: import
 * dedup has already given every new row a free id, and if one were ever taken
 * anyway, failing the import beats silently overwriting another transaction
 * (or giving a deleted one new content).
 */
export async function persistTransactions(
  session: SupabaseSession,
  transactions: Transaction[],
  options?: {
    importId?: string
  }
): Promise<void> {
  if (transactions.length === 0) {
    return
  }

  const client = getSupabaseClient()
  const rows = transactions.map((tx) => ({
    ...transactionToRow(session.user.id, tx),
    import_id: options?.importId ?? null,
  }))

  const { error } = await client.from('transactions').insert(rows)

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new UserFacingError(
        'Algunas transacciones ya estaban guardadas (¿otra importación en curso?). Recargá e importá de nuevo.'
      )
    }
    throw new Error(error.message)
  }
}

const UNIQUE_VIOLATION = '23505'

// Which of `ids` already exist on the server, split by whether the user
// deleted them. Imports use this instead of the in-memory store, which never
// holds deleted rows and can lag the server (other devices, sync in flight).
// Chunked so the id list stays within URL limits.
const EXISTING_LOOKUP_CHUNK = 200

export async function findExistingTransactionIds(
  session: SupabaseSession,
  ids: string[]
): Promise<{ active: Set<string>; deleted: Set<string> }> {
  const active = new Set<string>()
  const deleted = new Set<string>()
  const unique = Array.from(new Set(ids))
  const client = getSupabaseClient()
  for (let i = 0; i < unique.length; i += EXISTING_LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + EXISTING_LOOKUP_CHUNK)
    const { data, error } = await client
      .from('transactions')
      .select('transaction_id, is_deleted')
      .eq('user_id', session.user.id)
      .in('transaction_id', chunk)
    if (error) {
      throw new Error(error.message)
    }
    for (const row of (data ?? []) as Array<{
      transaction_id: string
      is_deleted: boolean | null
    }>) {
      if (row.is_deleted) deleted.add(row.transaction_id)
      else active.add(row.transaction_id)
    }
  }
  return { active, deleted }
}

// What import dedup needs from a stored row: its content and whether the user
// deleted it.
const CANDIDATE_COLUMNS =
  'transaction_id, date, description, amount, currency, type, source, raw_data, is_deleted, is_split_parent, split_parent_id'

// Stored dates may be local midnight (03:00Z at UTC-3) or UTC midnight (#58);
// two days of slack either side covers both in any time zone.
const CANDIDATE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000

/**
 * The stored rows an import is deduplicated against (#57,
 * `services/dedup/import-dedup.ts`): every row of the file's sources dated
 * within the file's date range (± 2 days), live or deleted — a deleted row
 * must keep matching so it stays deleted — plus any row holding one of the
 * incoming ids, wherever it is dated, so a taken id is never reused. Split
 * parts are left out of the window: they are not bank rows.
 */
export async function findImportCandidates(
  session: SupabaseSession,
  incoming: Transaction[]
): Promise<ExistingTransaction[]> {
  if (incoming.length === 0) {
    return []
  }
  const client = getSupabaseClient()
  const rows = new Map<string, TransactionRow>()

  const ids = Array.from(new Set(incoming.map((tx) => tx.id)))
  for (let i = 0; i < ids.length; i += EXISTING_LOOKUP_CHUNK) {
    const { data, error } = await client
      .from('transactions')
      .select(CANDIDATE_COLUMNS)
      .eq('user_id', session.user.id)
      .in('transaction_id', ids.slice(i, i + EXISTING_LOOKUP_CHUNK))
    if (error) {
      throw new Error(error.message)
    }
    for (const row of (data ?? []) as TransactionRow[]) {
      rows.set(row.transaction_id, row)
    }
  }

  const times = incoming.map((tx) => tx.date.getTime())
  const from = new Date(Math.min(...times) - CANDIDATE_WINDOW_MS).toISOString()
  const to = new Date(Math.max(...times) + CANDIDATE_WINDOW_MS).toISOString()
  const sources = Array.from(new Set(incoming.map((tx) => tx.source)))
  // Paged by key until an empty page, like loadUserTransactions: the server
  // truncates each response silently.
  let lastId: string | undefined
  for (;;) {
    let query = client
      .from('transactions')
      .select(CANDIDATE_COLUMNS)
      .eq('user_id', session.user.id)
      .in('source', sources)
      .gte('date', from)
      .lte('date', to)
      .is('split_parent_id', null)
    if (lastId !== undefined) {
      query = query.gt('transaction_id', lastId)
    }
    const { data, error } = await query
      .order('transaction_id', { ascending: true })
      .limit(LOAD_PAGE_SIZE)
    if (error) {
      throw new Error(error.message)
    }
    const page = (data ?? []) as TransactionRow[]
    if (page.length === 0) {
      break
    }
    for (const row of page) {
      rows.set(row.transaction_id, row)
    }
    lastId = page[page.length - 1].transaction_id
  }

  return Array.from(rows.values(), (row) => ({
    tx: rowToTransaction(row),
    deleted: row.is_deleted === true,
  }))
}

// ---------------------------------------------------------------------------
// Single-request primitives for the repository's Supabase adapter
// (`services/repository/supabase-repository.ts`, #119). Each is one statement,
// so it is atomic; the adapter decides how to cut a large write into them.
// Every one is scoped by `.eq('user_id')` on top of RLS, so a request sent
// with another user's token matches nothing instead of their rows.

/** A row change in the repository port's convention: absent = untouched, null = clear. */
export interface TransactionColumnsPatch {
  displayDescription?: string | null
  category?: string | null
  categoryConfidence?: number | null
  tags?: string[]
  description?: string
  rawData?: Transaction['rawData']
}

function patchToColumns(
  patch: TransactionColumnsPatch
): Record<string, unknown> {
  const columns: Record<string, unknown> = {}
  if (patch.displayDescription !== undefined) {
    columns.display_description = patch.displayDescription || null
  }
  if (patch.category !== undefined) columns.category = patch.category || null
  if (patch.categoryConfidence !== undefined) {
    columns.category_confidence = patch.categoryConfidence
  }
  if (patch.tags !== undefined) columns.tags = patch.tags
  if (patch.description !== undefined) columns.description = patch.description
  if (patch.rawData !== undefined) columns.raw_data = patch.rawData
  return columns
}

function returnedIds(data: unknown): string[] {
  return ((data ?? []) as Array<{ transaction_id: string }>).map(
    (row) => row.transaction_id
  )
}

/** Applies one patch to every id (≤ ~100: URL length); returns the ids changed. */
export async function updateTransactionsByIds(
  session: SupabaseSession,
  ids: string[],
  patch: TransactionColumnsPatch
): Promise<string[]> {
  const columns = patchToColumns(patch)
  if (ids.length === 0 || Object.keys(columns).length === 0) return ids
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .update(columns)
    .eq('user_id', session.user.id)
    .in('transaction_id', ids)
    .select('transaction_id')
  if (error) throw new Error(error.message)
  return returnedIds(data)
}

/** Soft-deletes (or restores) every id; returns the ids changed. */
export async function setTransactionsDeleted(
  session: SupabaseSession,
  ids: string[],
  deleted: boolean
): Promise<string[]> {
  if (ids.length === 0) return []
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .update(
      deleted
        ? { is_deleted: true, deleted_at: new Date().toISOString() }
        : { is_deleted: false, deleted_at: null }
    )
    .eq('user_id', session.user.id)
    .in('transaction_id', ids)
    .select('transaction_id')
  if (error) throw new Error(error.message)
  return returnedIds(data)
}

/** Removes rows for good (split parts); returns the ids that existed. */
export async function hardDeleteTransactionsByIds(
  session: SupabaseSession,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return []
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .delete()
    .eq('user_id', session.user.id)
    .in('transaction_id', ids)
    .select('transaction_id')
  if (error) throw new Error(error.message)
  return returnedIds(data)
}

/**
 * Saves new split parts, always live. A plain insert, never an upsert: part
 * ids are deterministic (`${parent}_split_${i}`), so parts another device
 * already saved for this parent make the whole insert fail ('taken') instead
 * of being overwritten.
 */
export async function insertSplitParts(
  session: SupabaseSession,
  parts: Transaction[]
): Promise<'saved' | 'taken'> {
  if (parts.length === 0) return 'saved'
  const { error } = await getSupabaseClient()
    .from('transactions')
    .insert(
      parts.map((part) => ({
        ...transactionToRow(session.user.id, part),
        is_deleted: false,
        deleted_at: null,
      }))
    )
  if (error?.code === UNIQUE_VIOLATION) return 'taken'
  if (error) throw new Error(error.message)
  return 'saved'
}

/**
 * Sets only `is_split_parent` on a live row — never the whole row, so edits
 * made meanwhile survive. `onlyIfSplit` adds a condition on the current
 * value. Returns how many rows changed (0 or 1).
 */
export async function setSplitParentFlag(
  session: SupabaseSession,
  parentId: string,
  isSplitParent: boolean,
  options: { onlyIfSplit?: boolean } = {}
): Promise<number> {
  let query = getSupabaseClient()
    .from('transactions')
    .update({ is_split_parent: isSplitParent })
    .eq('user_id', session.user.id)
    .eq('transaction_id', parentId)
    .is('is_deleted', false)
  if (options.onlyIfSplit !== undefined) {
    query = query.eq('is_split_parent', options.onlyIfSplit)
  }
  const { data, error } = await query.select('transaction_id')
  if (error) throw new Error(error.message)
  return returnedIds(data).length
}

/** Deletes a parent's parts: every one pointing at it, or just `ids`. */
export async function deleteSplitParts(
  session: SupabaseSession,
  parentId: string,
  ids?: string[]
): Promise<void> {
  let query = getSupabaseClient()
    .from('transactions')
    .delete()
    .eq('user_id', session.user.id)
    .eq('split_parent_id', parentId)
  if (ids) query = query.in('transaction_id', ids)
  const { error } = await query
  if (error) throw new Error(error.message)
}

/** How many parts point at `parentId`. */
export async function countSplitParts(
  session: SupabaseSession,
  parentId: string
): Promise<number> {
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .select('transaction_id')
    .eq('user_id', session.user.id)
    .eq('split_parent_id', parentId)
  if (error) throw new Error(error.message)
  return returnedIds(data).length
}

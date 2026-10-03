import type { Transaction } from '../../models'
import { getSupabaseClient, type SupabaseSession } from './client'
import { UserFacingError } from '../../utils/user-error'

// PostgREST answers an UPDATE that matched no rows with success; callers
// reporting "saved" need to know nothing was written (row deleted elsewhere).
const MISSING_ROW_MESSAGE =
  'La transacción ya no existe en el servidor. Recargá para ver el estado actual.'

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

  const { error } = await client
    .from('transactions')
    .upsert(rows, { onConflict: 'user_id,transaction_id' })

  if (error) {
    throw new Error(error.message)
  }
}

export async function softDeleteTransaction(
  session: SupabaseSession,
  transactionId: string
): Promise<void> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('transactions')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('user_id', session.user.id)
    .eq('transaction_id', transactionId)
    .select('transaction_id')

  if (error) {
    throw new Error(error.message)
  }
  if (!data || data.length === 0) {
    throw new UserFacingError(MISSING_ROW_MESSAGE)
  }
}

// Undoes soft deletes in one request, so a failure can't leave some rows
// restored and others not. Throws unless every id came back.
export async function restoreTransactions(
  session: SupabaseSession,
  transactionIds: string[]
): Promise<void> {
  if (transactionIds.length === 0) {
    return
  }
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('transactions')
    .update({ is_deleted: false, deleted_at: null })
    .eq('user_id', session.user.id)
    .in('transaction_id', transactionIds)
    .select('transaction_id')

  if (error) {
    throw new Error(error.message)
  }
  if (!data || data.length !== transactionIds.length) {
    throw new UserFacingError(
      'No se pudieron restaurar todas las transacciones. Recargá para ver el estado actual.'
    )
  }
}

export interface UpdateTransactionInput {
  description?: string
  /**
   * `undefined` leaves the column untouched; `null` (or '') clears it. The
   * distinction matters: every field here is guarded by `!== undefined`, so
   * passing `undefined` to mean "clear" silently omits the column from the
   * payload and the old value survives on the server.
   */
  displayDescription?: string | null
  category?: string
  categoryConfidence?: number
  tags?: string[]
}

export async function updateTransaction(
  session: SupabaseSession,
  transactionId: string,
  updates: UpdateTransactionInput
): Promise<void> {
  const payload: Record<string, unknown> = {}

  if (updates.description !== undefined) {
    payload.description = updates.description
  }

  if (updates.displayDescription !== undefined) {
    payload.display_description = updates.displayDescription || null
  }

  if (updates.category !== undefined) {
    payload.category = updates.category || null
  }

  if (updates.categoryConfidence !== undefined) {
    payload.category_confidence = updates.categoryConfidence
  }

  if (updates.tags !== undefined) {
    payload.tags = updates.tags
  }

  if (Object.keys(payload).length === 0) {
    return
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from('transactions')
    .update(payload)
    .eq('user_id', session.user.id)
    .eq('transaction_id', transactionId)
    .select('transaction_id')

  if (error) {
    throw new Error(error.message)
  }
  if (!data || data.length === 0) {
    throw new UserFacingError(MISSING_ROW_MESSAGE)
  }
}

export interface SplitPart {
  description: string
  amount: number
  category?: string
}

export async function splitTransaction(
  session: SupabaseSession,
  parent: Transaction,
  parts: SplitPart[]
): Promise<{ parent: Transaction; children: Transaction[] }> {
  const client = getSupabaseClient()

  const updatedParent: Transaction = { ...parent, isSplitParent: true }

  const { error: parentError } = await client
    .from('transactions')
    .upsert(transactionToRow(session.user.id, updatedParent), {
      onConflict: 'user_id,transaction_id',
    })

  if (parentError) {
    throw new Error(parentError.message)
  }

  const children: Transaction[] = parts.map((part, i) => ({
    ...parent,
    id: `${parent.id}_split_${i}`,
    description: part.description,
    displayDescription: undefined,
    amount: part.amount,
    category: part.category,
    categoryConfidence: part.category ? 1 : undefined,
    isSplitParent: false,
    splitParentId: parent.id,
    balance: undefined,
    rawData: {},
    tags: [],
  }))

  const { error: childError } = await client.from('transactions').upsert(
    children.map((c) => transactionToRow(session.user.id, c)),
    { onConflict: 'user_id,transaction_id' }
  )

  if (childError) {
    await client
      .from('transactions')
      .upsert(transactionToRow(session.user.id, parent), {
        onConflict: 'user_id,transaction_id',
      })
    throw new Error(childError.message)
  }

  return { parent: updatedParent, children }
}

export async function unsplitTransaction(
  session: SupabaseSession,
  parent: Transaction,
  childIds: string[]
): Promise<Transaction> {
  const client = getSupabaseClient()

  if (childIds.length > 0) {
    const { error: deleteError } = await client
      .from('transactions')
      .delete()
      .eq('user_id', session.user.id)
      .in('transaction_id', childIds)

    if (deleteError) {
      throw new Error(deleteError.message)
    }
  }

  const restored: Transaction = {
    ...parent,
    isSplitParent: false,
    splitParentId: undefined,
  }

  const { error: parentError } = await client
    .from('transactions')
    .upsert(transactionToRow(session.user.id, restored), {
      onConflict: 'user_id,transaction_id',
    })

  if (parentError) {
    throw new Error(parentError.message)
  }

  return restored
}

export async function hardDeleteTransactions(
  session: SupabaseSession,
  transactionIds: string[]
): Promise<void> {
  if (transactionIds.length === 0) return

  const client = getSupabaseClient()
  const { error } = await client
    .from('transactions')
    .delete()
    .eq('user_id', session.user.id)
    .in('transaction_id', transactionIds)

  if (error) {
    throw new Error(error.message)
  }
}

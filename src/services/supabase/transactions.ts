import type { Transaction } from '../../models'
import { getSupabaseClient, type SupabaseSession } from './client'

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

export async function loadUserTransactions(
  session: SupabaseSession
): Promise<Transaction[]> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('transactions')
    .select('*')
    .eq('user_id', session.user.id)
    .is('is_deleted', false)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? [])
    .map((row) => rowToTransaction(row as TransactionRow))
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
  const { error } = await client
    .from('transactions')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('user_id', session.user.id)
    .eq('transaction_id', transactionId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function restoreTransaction(
  session: SupabaseSession,
  transactionId: string
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client
    .from('transactions')
    .update({ is_deleted: false, deleted_at: null })
    .eq('user_id', session.user.id)
    .eq('transaction_id', transactionId)

  if (error) {
    throw new Error(error.message)
  }
}

export interface UpdateTransactionInput {
  description?: string
  displayDescription?: string
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
  const { error } = await client
    .from('transactions')
    .update(payload)
    .eq('user_id', session.user.id)
    .eq('transaction_id', transactionId)

  if (error) {
    throw new Error(error.message)
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

  const { error: childError } = await client
    .from('transactions')
    .upsert(
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

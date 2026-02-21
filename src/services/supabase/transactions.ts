import type { Transaction } from '../../models'
import { getSupabaseClient, type SupabaseSession } from './client'

interface TransactionRow {
  user_id: string
  transaction_id: string
  date: string
  description: string
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
}

function transactionToRow(userId: string, tx: Transaction): TransactionRow {
  return {
    user_id: userId,
    transaction_id: tx.id,
    date: tx.date.toISOString(),
    description: tx.description,
    amount: tx.amount,
    currency: tx.currency,
    type: tx.type,
    source: tx.source,
    category: tx.category ?? null,
    tags: tx.tags ?? [],
    category_confidence: tx.categoryConfidence ?? null,
    balance: tx.balance ?? null,
    raw_data: (tx.rawData ?? {}) as Record<string, unknown>,
  }
}

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.transaction_id,
    date: new Date(row.date),
    description: row.description,
    amount: Number(row.amount),
    currency: row.currency as Transaction['currency'],
    type: row.type as Transaction['type'],
    source: row.source as Transaction['source'],
    category: row.category ?? undefined,
    tags: row.tags ?? [],
    categoryConfidence: row.category_confidence ?? undefined,
    balance: row.balance ?? undefined,
    rawData: row.raw_data ?? {},
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
    is_deleted: false,
    deleted_at: null,
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
    .update({ is_deleted: true })
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
    .update({ is_deleted: false })
    .eq('user_id', session.user.id)
    .eq('transaction_id', transactionId)

  if (error) {
    throw new Error(error.message)
  }
}

export interface UpdateTransactionInput {
  description?: string
  category?: string
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

  if (updates.category !== undefined) {
    payload.category = updates.category || null
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

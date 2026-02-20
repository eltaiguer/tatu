import type { Transaction } from '../../models'
import { supabaseFetch, type SupabaseSession } from './client'

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
  category_confidence: number | null
  balance: number | null
  raw_data: Record<string, unknown>
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
    categoryConfidence: row.category_confidence ?? undefined,
    balance: row.balance ?? undefined,
    rawData: row.raw_data ?? {},
  }
}

export async function loadUserTransactions(
  session: SupabaseSession
): Promise<Transaction[]> {
  const userId = encodeURIComponent(session.user.id)
  const rows = await supabaseFetch<TransactionRow[]>(
    `/rest/v1/transactions?user_id=eq.${userId}&select=*`,
    {
      method: 'GET',
    },
    session.access_token
  )

  return rows
    .map(rowToTransaction)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
}

export async function persistTransactions(
  session: SupabaseSession,
  transactions: Transaction[]
): Promise<void> {
  if (transactions.length === 0) {
    return
  }

  const rows = transactions.map((tx) => transactionToRow(session.user.id, tx))
  await supabaseFetch<null>(
    '/rest/v1/transactions?on_conflict=user_id,transaction_id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    },
    session.access_token
  )
}

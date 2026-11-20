import { useState } from 'react'

/**
 * The rows of the view with a write in flight. A count per row, not a flag:
 * two writes on one row (a category "Aplicar" and a household one) must both
 * finish before the row unlocks.
 */
export function usePendingRows() {
  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(
    () => new Map()
  )
  function setPending(transactionId: string, pending: boolean) {
    setCounts((current) => {
      const next = new Map(current)
      const count = Math.max(
        (next.get(transactionId) ?? 0) + (pending ? 1 : -1),
        0
      )
      if (count > 0) next.set(transactionId, count)
      else next.delete(transactionId)
      return next
    })
  }
  const pendingTransactionIds: ReadonlySet<string> = new Set(counts.keys())
  return { pendingTransactionIds, setPending }
}

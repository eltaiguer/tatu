import { useState } from 'react'

/**
 * The rows of the view with a mutation in flight. A set, not a single id, so
 * two overlapping deletes don't re-enable each other's buttons.
 */
export function usePendingRows() {
  const [pendingTransactionIds, setPendingTransactionIds] = useState<
    ReadonlySet<string>
  >(() => new Set())
  function setPending(transactionId: string, pending: boolean) {
    setPendingTransactionIds((current) => {
      const next = new Set(current)
      if (pending) next.add(transactionId)
      else next.delete(transactionId)
      return next
    })
  }
  return { pendingTransactionIds, setPending }
}

import { useEffect, useState } from 'react'
import type { Transaction } from '../../models'

/**
 * The Transacciones view's row selection: ids picked across pages, pruned
 * when rows disappear, plus the page header checkbox's tri-state.
 */
export function useRowSelection({
  transactions,
  paginatedTransactionIds,
  filteredTransactionIds,
}: {
  transactions: Transaction[]
  paginatedTransactionIds: string[]
  filteredTransactionIds: string[]
}) {
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<
    string[]
  >([])

  useEffect(() => {
    const validIds = new Set(transactions.map((transaction) => transaction.id))
    setSelectedTransactionIds((current) =>
      current.filter((transactionId) => validIds.has(transactionId))
    )
  }, [transactions])

  function toggleTransactionSelection(transactionId: string, checked: boolean) {
    setSelectedTransactionIds((current) => {
      if (checked) {
        return current.includes(transactionId)
          ? current
          : [...current, transactionId]
      }
      return current.filter((id) => id !== transactionId)
    })
  }

  function mergeSelectedTransactionIds(transactionIds: string[]) {
    setSelectedTransactionIds((current) => {
      const next = new Set(current)
      transactionIds.forEach((transactionId) => next.add(transactionId))
      return Array.from(next)
    })
  }

  function handleSelectCurrentPage() {
    mergeSelectedTransactionIds(paginatedTransactionIds)
  }

  function handleSelectAllFiltered() {
    mergeSelectedTransactionIds(filteredTransactionIds)
  }

  const selectionCount = selectedTransactionIds.length
  const hasSelection = selectionCount > 0

  const allPageSelected =
    paginatedTransactionIds.length > 0 &&
    paginatedTransactionIds.every((id) => selectedTransactionIds.includes(id))
  const somePageSelected =
    !allPageSelected &&
    paginatedTransactionIds.some((id) => selectedTransactionIds.includes(id))

  function handleHeaderCheckboxChange(checked: boolean) {
    if (checked) {
      handleSelectCurrentPage()
    } else {
      setSelectedTransactionIds((current) =>
        current.filter((id) => !paginatedTransactionIds.includes(id))
      )
    }
  }

  return {
    selectedTransactionIds,
    setSelectedTransactionIds,
    toggleTransactionSelection,
    handleSelectAllFiltered,
    handleHeaderCheckboxChange,
    selectionCount,
    hasSelection,
    allPageSelected,
    somePageSelected,
  }
}

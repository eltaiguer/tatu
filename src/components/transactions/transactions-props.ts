import type { Transaction } from '../../models'
import type { Repository } from '../../services/repository/repository'
import type { UrlFilterState } from '../../services/filters/url-filters'
import type { DeleteResult } from './useMutationFeedback'

// The Transacciones view's public props.
interface BaseTransactionsProps {
  transactions: Transaction[]
  // Filters to start from (parsed from the URL). Read once; the parent
  // remounts the view to apply a new set.
  initialFilters?: UrlFilterState
  // Called with the serialized filter state whenever it changes, so the
  // parent can keep the URL in sync.
  onFiltersChange?: (search: string) => void
  homeCurrency?: string
  fxRate?: number
  // Mutation handlers reject on failure and resolve with what changed; the
  // component only reports success after they resolve.
  onUpdateTransaction?: (
    transactionId: string,
    updates: {
      displayDescription?: string
      // null clears it ("Sin categoría"); absent leaves it alone.
      category?: string | null
      tags?: string[]
      applyScope: 'single' | 'matching_past_and_future' | 'future_matching_only'
    }
  ) => Promise<{ affected: number }>
  onAutoCategorizeTransactions?: (
    transactionIds: string[]
  ) => Promise<{ categorized: number }>
  onBulkCategorize?: (
    transactionIds: string[],
    category: string
  ) => Promise<{ updated: number }>
  onBulkTag?: (
    transactionIds: string[],
    tag: string
  ) => Promise<{ updated: number }>
  onSplitTransaction?: (
    transactionId: string,
    parts: Array<{ description: string; amount: number; category?: string }>
  ) => Promise<{ parts: number }>
  onUnsplitTransaction?: (transactionId: string) => Promise<void>
  // Offered on error toasts so the user can re-sync after a partial write.
  onReload?: () => void
  // The signed-in user's repository: a category created inline saves there.
  repository?: Repository | null
}

// Deleting offers "Deshacer", so whoever wires a delete handler must also
// wire the restore — enforced by the type rather than remembered.
type DeleteProps =
  | {
      onDeleteTransaction?: never
      onBulkDelete?: never
      onRestoreTransactions?: never
    }
  | {
      onDeleteTransaction?: (
        transactionId: string,
        options?: { allowIrreversible?: boolean }
      ) => Promise<DeleteResult>
      onBulkDelete?: (
        transactionIds: string[],
        options?: { allowIrreversible?: boolean }
      ) => Promise<DeleteResult>
      onRestoreTransactions: (
        transactions: Transaction[]
      ) => Promise<{ restored: number }>
    }

export type TransactionsProps = BaseTransactionsProps & DeleteProps

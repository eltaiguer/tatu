import { useRef } from 'react'
import { toast } from 'sonner'
import type { Transaction } from '../../models'
import { normalizeCategoryId } from '../../services/categories/category-aliases'
import { resolveCategory } from '../../services/categories/category-registry'
import { countSimilarEditReach } from '../../services/descriptions/similar-transactions'
import type { CategorySnapshot } from '../../services/mutations/transaction-mutations'
import { PartialWriteError, UserFacingError } from '../../utils/user-error'
import type { TransactionsProps } from './transactions-props'

const STALE_UNDO =
  'Mientras tanto cambió la categoría de esta transacción; no se deshizo.'
const STALE_APPLY =
  'Mientras tanto cambió la categoría de esta transacción; no se aplicó a las similares.'

/**
 * The category a row's badge picks in place (#279), with the toast around it:
 * "Deshacer" (the row's category and confidence put back) and "Aplicar a las N
 * similares" (the merchant rule). Modeled on useHouseholdWrites: one counter
 * per row marks the newest write, so an old toast's action or retry never
 * replays a click that was since superseded.
 */
export function useCategoryWrites({
  transactions,
  onUpdateTransaction,
  onRestoreCategories,
  setPending,
  reportError,
}: {
  transactions: Transaction[]
  onUpdateTransaction: TransactionsProps['onUpdateTransaction']
  onRestoreCategories: TransactionsProps['onRestoreCategories']
  setPending: (transactionId: string, pending: boolean) => void
  reportError: (
    error: unknown,
    fallback: string,
    prefix?: string,
    retry?: () => void
  ) => void
}) {
  // The newest category write started per row.
  const writes = useRef(new Map<string, number>())
  // The toast offering Deshacer / Aplicar, per row, while it shows.
  const offers = useRef(new Map<string, string | number>())
  const transactionsRef = useRef(transactions)
  transactionsRef.current = transactions

  const rowOf = (id: string) =>
    transactionsRef.current.find((tx) => tx.id === id)
  const snapshotOf = (tx: Transaction): CategorySnapshot => ({
    id: tx.id,
    category: tx.category ?? null,
    categoryConfidence: tx.categoryConfidence ?? null,
  })
  const matches = (snapshot: CategorySnapshot, row?: Transaction) =>
    !!row &&
    normalizeCategoryId(row.category) ===
      normalizeCategoryId(snapshot.category) &&
    (row.categoryConfidence ?? null) === snapshot.categoryConfidence

  // Starts a category write of a row: its earlier offer is withdrawn (its
  // actions would replay an old click) and the number marks this write as
  // the newest.
  const start = (id: string) => {
    const seq = (writes.current.get(id) ?? 0) + 1
    writes.current.set(id, seq)
    const offer = offers.current.get(id)
    if (offer !== undefined) {
      toast.dismiss(offer)
      offers.current.delete(id)
    }
    return seq
  }
  // Nothing else wrote the row since `seq`, and it still holds the pick.
  const holds = (id: string, seq: number, category: string) => {
    const row = rowOf(id)
    return (
      writes.current.get(id) === seq &&
      !!row &&
      normalizeCategoryId(row.category) === normalizeCategoryId(category) &&
      row.categoryConfidence === 1
    )
  }
  // A partial write's own "reintentar" gets the same guard: reportError uses
  // it instead of the retry it is given.
  const guarded = (
    error: unknown,
    id: string,
    seq: number,
    category: string,
    stale: string
  ) => {
    if (!(error instanceof PartialWriteError) || !error.retry) return error
    const retry = error.retry
    return new PartialWriteError(
      error.message,
      error.done,
      error.total,
      () =>
        holds(id, seq, category)
          ? retry()
          : Promise.reject(new UserFacingError(stale)),
      error.result,
      error.cause
    )
  }

  async function handlePickCategory(
    transaction: Transaction,
    category: string
  ) {
    if (!onUpdateTransaction) return
    const current = rowOf(transaction.id) ?? transaction
    if (
      normalizeCategoryId(current.category) === normalizeCategoryId(category) &&
      current.categoryConfidence === 1
    ) {
      return
    }
    const previous = snapshotOf(current)
    const id = transaction.id
    const seq = start(id)
    setPending(id, true)
    try {
      await onUpdateTransaction(id, { category, applyScope: 'single' })
    } catch (error) {
      reportError(error, 'No se pudo cambiar la categoría', '', () => {
        if (writes.current.get(id) === seq && matches(previous, rowOf(id))) {
          void handlePickCategory(transaction, category)
        }
      })
      return
    } finally {
      setPending(id, false)
    }

    // N: the rows a merchant rule would write, the same rule the write uses,
    // over all of the user's rows (not the filtered page).
    const others =
      transaction.splitParentId || !onUpdateTransaction
        ? 0
        : countSimilarEditReach(transactionsRef.current, current, false) - 1
    const offer = toast('Cambios guardados', {
      description: `${resolveCategory(category).label} en esta transacción`,
      duration: 8000,
      // Two buttons squeeze the text into a narrow column: let them wrap
      // under it (sonner's own rules are unlayered, hence the `!`).
      ...(others >= 1 &&
        onRestoreCategories && {
          classNames: {
            toast: 'flex-wrap!',
            content: 'basis-full',
            cancelButton: 'ml-0!',
          },
        }),
      ...(others >= 1 && {
        action: {
          label:
            others === 1
              ? 'Aplicar a la otra similar'
              : `Aplicar a las ${others} similares`,
          onClick: () => {
            if (!holds(id, seq, category)) {
              toast(STALE_APPLY)
              return
            }
            void applyToSimilar(id, category, others)
          },
        },
      }),
      ...(onRestoreCategories && {
        cancel: {
          label: 'Deshacer',
          onClick: () => {
            if (!holds(id, seq, category)) {
              toast(STALE_UNDO)
              return
            }
            void undo(previous, category)
          },
        },
      }),
    })
    offers.current.set(id, offer)
  }

  async function applyToSimilar(id: string, category: string, others: number) {
    if (!onUpdateTransaction) return
    const seq = start(id)
    // Locked like a pick: a newer pick of the row must not be overwritten
    // by this write landing after it.
    setPending(id, true)
    try {
      const { affected } = await onUpdateTransaction(id, {
        category,
        applyScope: 'matching_past_and_future',
      })
      // The rows written now, not the ones counted when the toast was shown.
      const reached = affected - 1
      toast.success(
        reached < 1
          ? 'Cambios guardados'
          : reached === 1
            ? 'Se aplicó a la otra similar'
            : `Se aplicó a ${reached} transacciones`
      )
    } catch (error) {
      reportError(
        guarded(error, id, seq, category, STALE_APPLY),
        'No se pudo aplicar a las similares',
        '',
        () => {
          if (holds(id, seq, category))
            void applyToSimilar(id, category, others)
          else toast(STALE_APPLY)
        }
      )
    } finally {
      setPending(id, false)
    }
  }

  async function undo(previous: CategorySnapshot, picked: string) {
    if (!onRestoreCategories) return
    const id = previous.id
    const seq = start(id)
    setPending(id, true)
    try {
      await onRestoreCategories([previous])
      toast.success('Se deshizo el cambio')
    } catch (error) {
      reportError(error, 'No se pudo deshacer', '', () => {
        if (holds(id, seq, picked)) void undo(previous, picked)
        else toast(STALE_UNDO)
      })
    } finally {
      setPending(id, false)
    }
  }

  // What the table's badges call; without a way to write there is none, and
  // the badge stays plain.
  const onCategorize = onUpdateTransaction
    ? (transaction: Transaction, categoryId: string) => {
        void handlePickCategory(transaction, categoryId)
      }
    : undefined

  return { onCategorize }
}

import { useEffect, useMemo, useRef } from 'react'
import { toast, type ExternalToast } from 'sonner'
import { Category, isSplitParentTx } from '../../models'
import type { Transaction } from '../../models'
import { normalizeCategoryId } from '../../services/categories/category-aliases'
import { resolveCategory } from '../../services/categories/category-registry'
import {
  categorySplitLine,
  findCategorySplits,
} from '../../services/descriptions/category-splits'
import {
  countSimilarEditReach,
  findSimilarTransactions,
} from '../../services/descriptions/similar-transactions'
import { transactionLabel } from '../../services/merchants/merchant-key'
import { isTransferCategory } from '../../services/transfers/internal-transfers'
import type { CategorySnapshot } from '../../services/mutations/transaction-mutations'
import { transactionStore } from '../../stores/transaction-store'
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
  // Over every row of the user (not the page): one pass, a Map.get per row.
  const categorySplits = useMemo(
    () => findCategorySplits(transactions),
    [transactions]
  )
  const transactionsRef = useRef(transactions)
  transactionsRef.current = transactions

  // The bulk bar's toasts (one for many rows): withdrawn on leaving too.
  const bulkOffers = useRef(new Set<string | number>())

  // Toasts outlive the view (8 s): leaving it withdraws them, since their
  // actions belong to this instance's counters.
  useEffect(
    () => () => {
      for (const offer of offers.current.values()) toast.dismiss(offer)
      offers.current.clear()
      for (const offer of bulkOffers.current) toast.dismiss(offer)
      bulkOffers.current.clear()
    },
    []
  )

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
    // The store's rows, not this render's props: a toast's click can come
    // after the view was rebuilt.
    const row = transactionStore
      .getState()
      .transactions.find((tx) => tx.id === id)
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
      () => {
        if (!holds(id, seq, category)) {
          return Promise.reject(new UserFacingError(stale))
        }
        // The retry is a write of the row: it locks it like the first one.
        start(id)
        setPending(id, true)
        return retry().finally(() => setPending(id, false))
      },
      error.result,
      error.cause
    )
  }

  // The toast button "Aplicar a las N similares": guarded like every action
  // of an offer, so an old click never overwrites a newer write.
  const applyAction = (
    id: string,
    seq: number,
    category: string,
    others: number
  ) => ({
    label:
      others === 1
        ? 'Aplicar a la otra similar'
        : `Aplicar a las ${others} similares`,
    onClick: () => {
      void applyIfHolds(id, seq, category, others)
    },
  })
  // "Aplicar a las N similares", guarded; settles when the write did.
  const applyIfHolds = async (
    id: string,
    seq: number,
    category: string,
    others: number
  ) => {
    if (!holds(id, seq, category)) {
      toast(STALE_APPLY)
      return
    }
    await applyToSimilar(id, category, others)
  }
  // "Deshacer", guarded the same way; true when the category was put back.
  const undoIfHolds = async (
    previous: CategorySnapshot,
    seq: number,
    picked: string
  ) => {
    if (!holds(previous.id, seq, picked)) {
      toast(STALE_UNDO)
      return false
    }
    return undo(previous, picked)
  }

  // The write of an in-place pick, with its guards (lock, newest-write
  // counter, error report with a retry through `again`). Null: nothing was
  // saved (reported, or nothing to write). Else what the offers need.
  async function saveCategory(
    transaction: Transaction,
    category: string,
    again: () => void
  ) {
    if (!onUpdateTransaction) return null
    const current = rowOf(transaction.id) ?? transaction
    if (
      normalizeCategoryId(current.category) === normalizeCategoryId(category) &&
      current.categoryConfidence === 1
    ) {
      return null
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
          again()
        }
      })
      return null
    } finally {
      setPending(id, false)
    }

    // N: the rows a merchant rule would write, the same rule the write uses,
    // over all of the user's rows (not the filtered page).
    const others = transaction.splitParentId
      ? 0
      : countSimilarEditReach(transactionsRef.current, current, false) - 1
    return { id, seq, previous, others }
  }

  async function handlePickCategory(
    transaction: Transaction,
    category: string
  ) {
    const saved = await saveCategory(transaction, category, () => {
      void handlePickCategory(transaction, category)
    })
    if (!saved) return
    const { id, seq, previous, others } = saved
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
      ...(others >= 1 && { action: applyAction(id, seq, category, others) }),
      ...(onRestoreCategories && {
        cancel: {
          label: 'Deshacer',
          onClick: () => {
            void undoIfHolds(previous, seq, category)
          },
        },
      }),
    })
    offers.current.set(id, offer)
  }

  // The review mode's pick (#280): the badge's write and guards, without the
  // toast. Null: nothing saved (the error was reported) or nothing to write.
  // `apply` (the merchant rule) is there when others ≥ 1; `undo` when the
  // view can restore. Both are the toast's own guarded actions.
  async function pickForReview(transaction: Transaction, category: string) {
    const saved = await saveCategory(transaction, category, () => {
      void pickForReview(transaction, category)
    })
    if (!saved) return null
    const { id, seq, previous, others } = saved
    return {
      others,
      ...(others >= 1 && {
        apply: () => applyIfHolds(id, seq, category, others),
      }),
      ...(onRestoreCategories && {
        undo: () => undoIfHolds(previous, seq, category),
      }),
    } as {
      others: number
      apply?: () => Promise<void>
      undo?: () => Promise<boolean>
    }
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

  async function undo(
    previous: CategorySnapshot,
    picked: string
  ): Promise<boolean> {
    if (!onRestoreCategories) return false
    const id = previous.id
    const seq = start(id)
    setPending(id, true)
    try {
      await onRestoreCategories([previous])
      toast.success('Se deshizo el cambio')
      return true
    } catch (error) {
      reportError(error, 'No se pudo deshacer', '', () => {
        if (holds(id, seq, picked)) void undo(previous, picked)
        else toast(STALE_UNDO)
      })
      return false
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

  // After the edit dialog saved `category` on this row alone: when its similar
  // rows are now in other categories, shows the save's toast with
  // "Aplicar a las N similares". False when there is nothing to offer (the
  // caller shows its own toast). No Deshacer: restoreCategories puts back only
  // category and confidence, not the name or tags the same save may have
  // changed.
  const offerAfterEdit = (
    edited: Transaction,
    category: string | null,
    message: string
  ) => {
    const id = edited.id
    const previousCategory = edited.category
    if (!onUpdateTransaction || category === null) return false
    if (normalizeCategoryId(category) === normalizeCategoryId(previousCategory))
      return false
    // The store's rows: the props have not re-rendered after the await.
    const rows = transactionStore.getState().transactions
    const row = rows.find((tx) => tx.id === id)
    if (!row || row.splitParentId || isSplitParentTx(row)) return false
    // The write stamps every similar row: never a transfer (its pairing would
    // stop re-marking it) or a split parent.
    const similar = findSimilarTransactions(rows, row)
    if (
      similar.some(
        (other) =>
          other.isSplitParent ||
          isTransferCategory(normalizeCategoryId(other.category)) ||
          // A refund in another category would be stamped too.
          (other.type === 'credit' &&
            normalizeCategoryId(other.category) !==
              normalizeCategoryId(category))
      )
    ) {
      return false
    }
    // The ≠'s own rule, plus rows left Sin categoría (fix one, the rest stay
    // wrong).
    const split = findCategorySplits(rows).get(id)
    const uncategorized = similar.some(
      (other) =>
        other.id !== id &&
        other.type === 'debit' &&
        normalizeCategoryId(other.category) === Category.Uncategorized
    )
    if (!split && !uncategorized) return false
    // The dialog's save is the newest write of the row.
    const seq = start(id)
    const others = countSimilarEditReach(rows, row, false) - 1
    const offer = toast.success(message, {
      description: split
        ? categorySplitLine(split, transactionLabel(row))
        : undefined,
      duration: 8000,
      action: applyAction(id, seq, category, others),
    })
    offers.current.set(id, offer)
    return true
  }
  // The toast of a dialog save: the offer when the category changed on this
  // row alone (not when the household "forget" owns the toast's action), else
  // the plain message.
  const toastEdit = (
    edited: Transaction,
    draft: { category: string | null; applyScope: string },
    message: string,
    options?: ExternalToast
  ) => {
    const offered =
      draft.applyScope === 'single' &&
      !options &&
      offerAfterEdit(edited, draft.category, message)
    if (!offered) toast.success(message, options)
  }
  // A dialog save is the newest write of the row: withdraws its old toast.
  const supersede = (id: string) => {
    start(id)
  }

  // For the bulk bar (#282): a bulk write starts as the newest write of every
  // selected row, and its Deshacer asks whether a row was written since.
  const rowWrites = {
    start,
    isLatest: (id: string, seq: number) => writes.current.get(id) === seq,
    track: (toastId: string | number) => {
      bulkOffers.current.add(toastId)
    },
  }

  return {
    onCategorize,
    categorySplits,
    toastEdit,
    supersede,
    rowWrites,
    pickForReview,
  }
}

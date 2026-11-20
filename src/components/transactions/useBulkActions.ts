import { useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import type { Transaction } from '../../models'
import { normalizeCategoryId } from '../../services/categories/category-aliases'
import { resolveCategory } from '../../services/categories/category-registry'
import type { CategorySnapshot } from '../../services/mutations/transaction-mutations'
import { transactionStore } from '../../stores/transaction-store'
import { householdValueLabel } from '../../services/household/household-copy'
import {
  PartialWriteError,
  UserFacingError,
  userErrorMessage,
} from '../../utils/user-error'
import {
  currentHouseholdRules,
  rowHouseholdView,
} from '../../services/household/household'
import { isWorkspaceOwner, workspaceStore } from '../../stores/workspace-state'
import {
  runBulkSteps,
  type BulkStep,
} from '../../services/mutations/bulk-steps'
import { txDone, type useMutationFeedback } from './useMutationFeedback'
import type { DeleteResult } from './useMutationFeedback'
import { HOUSEHOLD_SAVE_FAILED } from './useHouseholdWrites'

type MutationFeedback = ReturnType<typeof useMutationFeedback>

const STALE_RESTORE =
  'Mientras tanto cambiaron estas transacciones; no se deshizo.'

// The rows' category + confidence, read from the store (props lag an await),
// in the shape `restoreCategories` takes: absent = null. Rows no longer in
// the store are skipped.
function snapshot(ids: string[]): CategorySnapshot[] {
  const wanted = new Set(ids)
  return transactionStore
    .getState()
    .transactions.filter((tx) => wanted.has(tx.id))
    .map((tx) => ({
      id: tx.id,
      category: tx.category ?? null,
      categoryConfidence: tx.categoryConfidence ?? null,
    }))
}

const same = (a: CategorySnapshot, b?: CategorySnapshot) =>
  !!b &&
  normalizeCategoryId(a.category) === normalizeCategoryId(b.category) &&
  a.categoryConfidence === b.categoryConfidence

/**
 * What the Transacciones view does with a selection: the bulk bar's
 * actions (categorize, auto-categorize, ignore, delete) and the open state +
 * save of the Etiquetas dialog. Clears the selection after a successful change.
 */
export function useBulkActions({
  transactions,
  selectedTransactionIds,
  setSelectedTransactionIds,
  onAutoCategorizeTransactions,
  onBulkCategorize,
  onBulkTag,
  onBulkDelete,
  onSetHousehold,
  onReload,
  onRestoreCategories,
  supersede,
  reportError,
  reportDeleted,
  deleteWithConfirmation,
}: {
  transactions: Transaction[]
  selectedTransactionIds: string[]
  setSelectedTransactionIds: Dispatch<SetStateAction<string[]>>
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
  onBulkDelete?: (
    transactionIds: string[],
    options?: { allowIrreversible?: boolean }
  ) => Promise<DeleteResult>
  onSetHousehold?: (
    transactionIds: string[],
    household: boolean | null
  ) => Promise<{ updated: number }>
  onReload?: () => void
  onRestoreCategories?: (
    rows: CategorySnapshot[]
  ) => Promise<{ restored: number }>
  // Withdraws a row's older in-place toast (useCategoryWrites).
  supersede?: (transactionId: string) => void
} & Pick<
  MutationFeedback,
  'reportError' | 'reportDeleted' | 'deleteWithConfirmation'
>) {
  const [isAutoCategorizing, setIsAutoCategorizing] = useState(false)
  const [isBulkOperating, setIsBulkOperating] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  // Controlled here: the "Sin coincidencias" toast opens it.
  const [categorizeOpen, setCategorizeOpen] = useState(false)

  const isBusy = isAutoCategorizing || isBulkOperating
  const selectionRef = useRef(selectedTransactionIds)
  selectionRef.current = selectedTransactionIds

  // Every path that ends with the selection cleared also shuts the picker, so
  // a stale `true` never opens it on a later selection.
  function clearSelection() {
    setSelectedTransactionIds([])
    setCategorizeOpen(false)
  }

  // A bulk write of categories with its Deshacer. Rows are compared in the
  // store before and after, so Deshacer touches only rows the write changed,
  // and at the click only rows still holding what it wrote. No Deshacer after
  // a failed or partial write: the one action of that toast is Reintentar.
  async function runCategoryWrite(
    ids: string[],
    write: () => Promise<number>,
    fallback: string,
    show: (
      count: number,
      action: { label: string; onClick: () => void } | undefined
    ) => void
  ) {
    for (const id of ids) supersede?.(id)
    const before = snapshot(ids)
    const owner = workspaceStore.getState().userId
    let count: number
    try {
      count = await write()
    } catch (error) {
      reportError(error, fallback)
      return
    }
    // Another user signed in meanwhile: this selection is not theirs.
    if (owner && !isWorkspaceOwner(owner)) return
    const afterById = new Map(snapshot(ids).map((row) => [row.id, row]))
    const written = before.filter((row) => !same(row, afterById.get(row.id)))
    show(
      count,
      written.length > 0 && onRestoreCategories
        ? {
            label: 'Deshacer',
            onClick: () =>
              void undoCategoryWrite(
                onRestoreCategories,
                owner,
                written,
                afterById
              ),
          }
        : undefined
    )
  }

  async function undoCategoryWrite(
    restore: (rows: CategorySnapshot[]) => Promise<{ restored: number }>,
    owner: string | null | undefined,
    written: CategorySnapshot[],
    afterById: Map<string, CategorySnapshot>
  ) {
    if (owner && !isWorkspaceOwner(owner)) return
    const nowById = new Map(
      snapshot(written.map((r) => r.id)).map((r) => [r.id, r])
    )
    const restorable = written.filter((row) =>
      same(afterById.get(row.id) as CategorySnapshot, nowById.get(row.id))
    )
    if (restorable.length === 0) {
      toast(STALE_RESTORE)
      return
    }
    try {
      await restore(restorable)
    } catch (error) {
      reportError(
        guardedRestore(error, restorable, afterById),
        'No se pudo deshacer'
      )
      return
    }
    const skipped = written.length - restorable.length
    toast.success('Se deshizo el cambio', {
      description:
        skipped === 0
          ? undefined
          : skipped === 1
            ? '1 cambió mientras tanto y quedó como está'
            : `${skipped} cambiaron mientras tanto y quedaron como están`,
    })
  }

  // A partial restore's own "reintentar" must not overwrite a row the user
  // re-categorized meanwhile: every row still holds what it held before the
  // restore (restored) or what the write left (failed, untouched).
  function guardedRestore(
    error: unknown,
    restorable: CategorySnapshot[],
    afterById: Map<string, CategorySnapshot>
  ) {
    if (!(error instanceof PartialWriteError) || !error.retry) return error
    const retry = error.retry
    return new PartialWriteError(
      error.message,
      error.done,
      error.total,
      () => {
        const nowById = new Map(
          snapshot(restorable.map((r) => r.id)).map((r) => [r.id, r])
        )
        const holds = restorable.every((row) => {
          const now = nowById.get(row.id)
          return (
            same(row, now) ||
            same(afterById.get(row.id) as CategorySnapshot, now)
          )
        })
        return holds
          ? retry()
          : Promise.reject(new UserFacingError(STALE_RESTORE))
      },
      error.result,
      error.cause
    )
  }

  // "Volver a sugerir": the categorizer re-run with context on the selection.
  async function handleSuggestSelected() {
    if (
      !onAutoCategorizeTransactions ||
      selectedTransactionIds.length === 0 ||
      isAutoCategorizing
    ) {
      return
    }
    const ids = selectedTransactionIds
    setIsAutoCategorizing(true)
    try {
      await runCategoryWrite(
        ids,
        async () => (await onAutoCategorizeTransactions(ids)).categorized,
        'No se pudieron categorizar las transacciones',
        (categorized, action) => {
          if (categorized === 0) {
            // Nothing changed: the selection stays, and the picker is one
            // click away for doing it by hand.
            toast('Sin coincidencias', {
              description:
                'Tus reglas y los comercios que ya categorizaste no sugieren otra categoría para la selección.',
              duration: 8000,
              action: {
                label: 'Categorizar a mano',
                onClick: () => {
                  if (selectionRef.current.length > 0) setCategorizeOpen(true)
                },
              },
            })
            return
          }
          clearSelection()
          const rest = ids.length - categorized
          toast.success(txDone(categorized, 'categorizad'), {
            description: rest > 0 ? `${rest} sin cambios` : undefined,
            duration: 8000,
            action,
          })
        }
      )
    } finally {
      setIsAutoCategorizing(false)
    }
  }

  async function handleBulkCategorizeSelected(category: string) {
    if (
      !onBulkCategorize ||
      selectedTransactionIds.length === 0 ||
      isBulkOperating
    ) {
      return
    }
    setIsBulkOperating(true)
    try {
      await runCategoryWrite(
        selectedTransactionIds,
        async () =>
          (await onBulkCategorize(selectedTransactionIds, category)).updated,
        'No se pudieron categorizar las transacciones',
        (updated, action) => {
          clearSelection()
          toast.success(txDone(updated, 'categorizad'), {
            description: resolveCategory(category).label,
            duration: 8000,
            action,
          })
        }
      )
    } finally {
      setIsBulkOperating(false)
    }
  }

  // Only the selected rows that count as expenses get a household choice;
  // the others are skipped and said so. Rows already at the value count as
  // done: the toast reports the eligible rows, not how many were written.
  async function handleBulkHousehold(household: boolean | null) {
    if (
      !onSetHousehold ||
      selectedTransactionIds.length === 0 ||
      isBulkOperating
    ) {
      return
    }
    const selected = new Set(selectedTransactionIds)
    const map = currentHouseholdRules()
    const eligible = transactions.filter(
      (tx) => selected.has(tx.id) && rowHouseholdView(tx, map) !== null
    )
    const skipped = selected.size - eligible.length
    if (eligible.length === 0) {
      toast.info('Ninguna de las seleccionadas cuenta como gasto, sin cambios')
      return
    }
    const owner = workspaceStore.getState().userId
    setIsBulkOperating(true)
    try {
      await onSetHousehold(
        eligible.map((tx) => tx.id),
        household
      )
      // Another user signed in meanwhile: this selection is not theirs.
      if (owner && !isWorkspaceOwner(owner)) return
      clearSelection()
      const n = eligible.length
      const done =
        household === null
          ? `Elección quitada en ${n} ${n === 1 ? 'transacción' : 'transacciones'}`
          : `${householdValueLabel(household)} en ${n} ${
              n === 1 ? 'transacción' : 'transacciones'
            }`
      toast.success(
        skipped > 0
          ? `${done}, ${skipped} ${
              skipped === 1 ? 'no cuenta como gasto' : 'no cuentan como gasto'
            }, sin cambios`
          : done
      )
    } catch (error) {
      reportError(error, HOUSEHOLD_SAVE_FAILED)
    } finally {
      setIsBulkOperating(false)
    }
  }

  // "No contar": the `ignored` category, which totals leave out.
  async function handleBulkIgnore() {
    if (
      !onBulkCategorize ||
      selectedTransactionIds.length === 0 ||
      isBulkOperating
    )
      return
    setIsBulkOperating(true)
    try {
      await runCategoryWrite(
        selectedTransactionIds,
        async () =>
          (await onBulkCategorize(selectedTransactionIds, 'ignored')).updated,
        'No se pudieron dejar las transacciones fuera de los totales',
        (updated, action) => {
          clearSelection()
          toast.success(
            updated === 1
              ? '1 transacción no cuenta en los totales'
              : `${updated} transacciones no cuentan en los totales`,
            { duration: 8000, action }
          )
        }
      )
    } finally {
      setIsBulkOperating(false)
    }
  }

  async function handleBulkDelete() {
    if (!onBulkDelete || selectedTransactionIds.length === 0 || isBulkOperating)
      return
    const ids = selectedTransactionIds
    setIsBulkOperating(true)
    try {
      const result = await deleteWithConfirmation(
        (allowIrreversible) => onBulkDelete(ids, { allowIrreversible }),
        {
          title: `¿Eliminar ${ids.length} transacción${ids.length === 1 ? '' : 'es'}?`,
          description:
            'La selección incluye transacciones divididas: sus partes se eliminan definitivamente. Esta acción no se puede deshacer.',
        }
      )
      if (result) {
        clearSelection()
        reportDeleted(result)
      }
    } catch (error) {
      reportError(error, 'No se pudieron eliminar las transacciones')
    } finally {
      setIsBulkOperating(false)
    }
  }

  async function handleBulkTagsSave(tags: string[]) {
    if (selectedTransactionIds.length === 0 || isBulkOperating) return
    setIsBulkOperating(true)
    // Steps run in sequence; on failure the message says which already
    // applied, so a retry isn't a blind guess.
    const applied: string[] = []
    const ids = selectedTransactionIds
    const steps: BulkStep[] = []
    if (onBulkTag) {
      for (const tag of tags) {
        steps.push({
          label: `la etiqueta "${tag}"`,
          run: () => onBulkTag(ids, tag),
        })
      }
    }
    try {
      const updated = await runBulkSteps(steps, (label) => applied.push(label))
      clearSelection()
      setTagsOpen(false)
      if (updated === 0) {
        toast.info('Las transacciones ya tenían esos cambios')
      } else {
        toast.success(txDone(updated, 'actualizad'))
      }
    } catch (error) {
      if (error instanceof PartialWriteError) {
        reportError(
          error,
          'No se pudieron actualizar las transacciones',
          applied.length > 0
            ? `Se aplicó ${applied.join(' y ')}, pero falló el resto: `
            : ''
        )
        return
      }
      const message = userErrorMessage(
        error,
        'No se pudieron actualizar las transacciones'
      )
      toast.error(
        applied.length > 0
          ? `Se aplicó ${applied.join(' y ')}, pero falló el resto: ${message}`
          : message,
        onReload ? { action: { label: 'Recargar', onClick: onReload } } : {}
      )
    } finally {
      setIsBulkOperating(false)
    }
  }

  return {
    isAutoCategorizing,
    isBulkOperating,
    isBusy,
    categorizeOpen,
    setCategorizeOpen,
    handleSuggestSelected,
    handleBulkCategorizeSelected,
    handleBulkIgnore,
    handleBulkHousehold,
    handleBulkDelete,
    tagsOpen,
    setTagsOpen,
    handleBulkTagsSave,
  }
}

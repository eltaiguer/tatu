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

// What a bulk categorize left on a row it wrote: that category at confidence 1.
const wroteCategory = (category: string) => (after: CategorySnapshot) =>
  normalizeCategoryId(after.category) === normalizeCategoryId(category) &&
  after.categoryConfidence === 1

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
  rowWrites,
  setPending,
  pendingTransactionIds,
  reportError,
  reportDeleted,
  deleteWithConfirmation,
}: {
  transactions: Transaction[]
  selectedTransactionIds: string[]
  setSelectedTransactionIds: Dispatch<SetStateAction<string[]>>
  onAutoCategorizeTransactions?: (
    transactionIds: string[]
  ) => Promise<{ categorized: number; savedIds?: string[] }>
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
  // The per-row write counters of useCategoryWrites: a bulk write is the
  // newest write of every selected row, and its Deshacer leaves alone any row
  // written since.
  rowWrites?: {
    start: (transactionId: string) => number
    isLatest: (transactionId: string, seq: number) => boolean
    track: (toastId: string | number) => void
  }
  // Locks a row's pickers while a write of it is in flight (usePendingRows).
  setPending?: (transactionId: string, pending: boolean) => void
  // Rows with a write in flight: a bulk write never starts over one.
  pendingTransactionIds?: ReadonlySet<string>
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
  // Set synchronously: a second click (or the "Categorizar a mano" toast)
  // never starts a write while another category write runs.
  const working = useRef(false)
  // A write already runs (here, or on a selected row): none starts over it.
  const blocked = () =>
    working.current ||
    selectedTransactionIds.some((id) => pendingTransactionIds?.has(id))
  const busyRef = useRef(false)
  busyRef.current = isBusy
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
    ) => string | number | undefined,
    // What the write left on a row it wrote (a hand pick since is not it).
    wrote?: (after: CategorySnapshot) => boolean
  ) {
    // This write is the newest of every selected row: an older toast's
    // Deshacer is withdrawn, and a row written since is not ours to undo.
    const seqs = new Map(ids.map((id) => [id, rowWrites?.start(id) ?? 0]))
    const latest = (id: string) =>
      rowWrites ? rowWrites.isLatest(id, seqs.get(id) ?? 0) : true
    const before = snapshot(ids)
    const owner = workspaceStore.getState().userId
    for (const id of ids) setPending?.(id, true)
    let count: number
    try {
      count = await write()
    } catch (error) {
      reportError(error, fallback)
      return
    } finally {
      for (const id of ids) setPending?.(id, false)
    }
    // Another user signed in meanwhile: this selection is not theirs.
    if (owner && !isWorkspaceOwner(owner)) return
    const afterById = new Map(snapshot(ids).map((row) => [row.id, row]))
    const written = before.filter((row) => {
      const after = afterById.get(row.id)
      return (
        !!after &&
        !same(row, after) &&
        latest(row.id) &&
        (!wrote || wrote(after))
      )
    })
    const toastId = show(
      count,
      written.length > 0 && onRestoreCategories
        ? {
            label: 'Deshacer',
            onClick: () =>
              void undoCategoryWrite(
                onRestoreCategories,
                owner,
                written,
                afterById,
                latest
              ),
          }
        : undefined
    )
    if (toastId !== undefined && written.length > 0) rowWrites?.track(toastId)
  }

  async function undoCategoryWrite(
    restore: (rows: CategorySnapshot[]) => Promise<{ restored: number }>,
    owner: string | null | undefined,
    written: CategorySnapshot[],
    afterById: Map<string, CategorySnapshot>,
    latest: (id: string) => boolean
  ) {
    if (owner && !isWorkspaceOwner(owner)) return
    const nowById = new Map(
      snapshot(written.map((r) => r.id)).map((r) => [r.id, r])
    )
    // A row deleted since is gone, not "changed".
    const present = written.filter((row) => nowById.has(row.id))
    const restorable = present.filter(
      (row) =>
        latest(row.id) &&
        same(afterById.get(row.id) as CategorySnapshot, nowById.get(row.id))
    )
    if (restorable.length === 0) {
      toast(STALE_RESTORE)
      return
    }
    // The restore is a write of these rows: it is their newest, and their
    // pickers are locked until it lands.
    const seqs = new Map(
      restorable.map((row) => [row.id, rowWrites?.start(row.id) ?? 0])
    )
    for (const row of restorable) setPending?.(row.id, true)
    try {
      await restore(restorable)
    } catch (error) {
      reportError(
        guardedRestore(error, restorable, afterById, seqs),
        'No se pudo deshacer'
      )
      return
    } finally {
      for (const row of restorable) setPending?.(row.id, false)
    }
    const skipped = present.length - restorable.length
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
    afterById: Map<string, CategorySnapshot>,
    seqs: Map<string, number>
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
          // A row deleted since has nothing to overwrite; one written since
          // (even back to the same value) is the user's newest word.
          return (
            !now ||
            ((rowWrites?.isLatest(row.id, seqs.get(row.id) ?? 0) ?? true) &&
              (same(row, now) ||
                same(afterById.get(row.id) as CategorySnapshot, now)))
          )
        })
        if (!holds) return Promise.reject(new UserFacingError(STALE_RESTORE))
        // The retry is a write of the rows, locked like the first one.
        for (const row of restorable) {
          seqs.set(row.id, rowWrites?.start(row.id) ?? 0)
          setPending?.(row.id, true)
        }
        return retry().finally(() => {
          for (const row of restorable) setPending?.(row.id, false)
        })
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
      blocked()
    ) {
      return
    }
    const ids = selectedTransactionIds
    // Only the rows the categorizer saved are its to undo.
    let saved: Set<string> | undefined
    working.current = true
    setIsAutoCategorizing(true)
    try {
      await runCategoryWrite(
        ids,
        async () => {
          const result = await onAutoCategorizeTransactions(ids)
          if (result.savedIds) saved = new Set(result.savedIds)
          return result.categorized
        },
        'No se pudieron categorizar las transacciones',
        (categorized, action) => {
          if (categorized === 0) {
            // Nothing changed: the selection stays, and the picker is one
            // click away for doing it by hand.
            return toast('Sin coincidencias', {
              description:
                'Tus reglas y los comercios que ya categorizaste no sugieren otra categoría para la selección.',
              duration: 8000,
              action: {
                label: 'Categorizar a mano',
                onClick: () => {
                  // Never over a write in flight: a pick would race it.
                  if (
                    selectionRef.current.length > 0 &&
                    !working.current &&
                    !busyRef.current
                  ) {
                    setCategorizeOpen(true)
                  }
                },
              },
            })
          }
          clearSelection()
          const rest = ids.length - categorized
          return toast.success(txDone(categorized, 'categorizad'), {
            description: rest > 0 ? `${rest} sin cambios` : undefined,
            duration: 8000,
            action,
          })
        },
        (after) => !saved || saved.has(after.id)
      )
    } finally {
      working.current = false
      setIsAutoCategorizing(false)
    }
  }

  async function handleBulkCategorizeSelected(category: string) {
    if (!onBulkCategorize || selectedTransactionIds.length === 0 || blocked()) {
      return
    }
    working.current = true
    setIsBulkOperating(true)
    try {
      await runCategoryWrite(
        selectedTransactionIds,
        async () =>
          (await onBulkCategorize(selectedTransactionIds, category)).updated,
        'No se pudieron categorizar las transacciones',
        (updated, action) => {
          clearSelection()
          return toast.success(txDone(updated, 'categorizad'), {
            description: resolveCategory(category).label,
            duration: 8000,
            action,
          })
        },
        wroteCategory(category)
      )
    } finally {
      working.current = false
      setIsBulkOperating(false)
    }
  }

  // Only the selected rows that count as expenses get a household choice;
  // the others are skipped and said so. Rows already at the value count as
  // done: the toast reports the eligible rows, not how many were written.
  async function handleBulkHousehold(household: boolean | null) {
    if (!onSetHousehold || selectedTransactionIds.length === 0 || blocked()) {
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
    working.current = true
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
      working.current = false
      setIsBulkOperating(false)
    }
  }

  // "No contar": the `ignored` category, which totals leave out.
  async function handleBulkIgnore() {
    if (!onBulkCategorize || selectedTransactionIds.length === 0 || blocked())
      return
    working.current = true
    setIsBulkOperating(true)
    try {
      await runCategoryWrite(
        selectedTransactionIds,
        async () =>
          (await onBulkCategorize(selectedTransactionIds, 'ignored')).updated,
        'No se pudieron dejar las transacciones fuera de los totales',
        (updated, action) => {
          clearSelection()
          return toast.success(
            updated === 1
              ? '1 transacción no cuenta en los totales'
              : `${updated} transacciones no cuentan en los totales`,
            { duration: 8000, action }
          )
        },
        wroteCategory('ignored')
      )
    } finally {
      working.current = false
      setIsBulkOperating(false)
    }
  }

  async function handleBulkDelete() {
    if (!onBulkDelete || selectedTransactionIds.length === 0 || blocked())
      return
    const ids = selectedTransactionIds
    working.current = true
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
      working.current = false
      setIsBulkOperating(false)
    }
  }

  async function handleBulkTagsSave(tags: string[]) {
    if (selectedTransactionIds.length === 0 || blocked()) return
    working.current = true
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
      working.current = false
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

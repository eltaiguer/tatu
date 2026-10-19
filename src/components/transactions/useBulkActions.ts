import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import { PartialWriteError, userErrorMessage } from '../../utils/user-error'
import {
  runBulkSteps,
  type BulkStep,
} from '../../services/mutations/bulk-steps'
import { txDone, type useMutationFeedback } from './useMutationFeedback'
import type { DeleteResult } from './useMutationFeedback'

type MutationFeedback = ReturnType<typeof useMutationFeedback>

/**
 * What the Transacciones view does with a selection: the bulk bar's
 * actions (categorize, auto-categorize, ignore, delete) and the bulk edit
 * dialog's draft + save. Clears the selection after a successful change.
 */
export function useBulkActions({
  selectedTransactionIds,
  setSelectedTransactionIds,
  onAutoCategorizeTransactions,
  onBulkCategorize,
  onBulkTag,
  onBulkDelete,
  onReload,
  reportError,
  reportDeleted,
  deleteWithConfirmation,
}: {
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
  onReload?: () => void
} & Pick<
  MutationFeedback,
  'reportError' | 'reportDeleted' | 'deleteWithConfirmation'
>) {
  const [isAutoCategorizing, setIsAutoCategorizing] = useState(false)
  const [isBulkOperating, setIsBulkOperating] = useState(false)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkEditCategory, setBulkEditCategory] = useState('')
  const [bulkEditTagList, setBulkEditTagList] = useState<string[]>([])
  const [bulkCategoryPickerOpen, setBulkCategoryPickerOpen] = useState(false)
  const [bulkCategorySearch, setBulkCategorySearch] = useState('')
  const [bulkTagPickerOpen, setBulkTagPickerOpen] = useState(false)
  const [bulkTagSearch, setBulkTagSearch] = useState('')

  const isBusy = isAutoCategorizing || isBulkOperating

  async function handleAutoCategorizeSelected() {
    if (
      !onAutoCategorizeTransactions ||
      selectedTransactionIds.length === 0 ||
      isAutoCategorizing
    ) {
      return
    }
    setIsAutoCategorizing(true)
    try {
      const { categorized } = await onAutoCategorizeTransactions(
        selectedTransactionIds
      )
      if (categorized === 0) {
        toast.info(
          'No se encontraron categorías automáticas para las transacciones seleccionadas'
        )
        return
      }
      setSelectedTransactionIds([])
      toast.success(txDone(categorized, 'categorizad'))
    } catch (error) {
      reportError(error, 'No se pudieron categorizar las transacciones')
    } finally {
      setIsAutoCategorizing(false)
    }
  }

  async function handleBulkCategorizeSelected(category: string) {
    if (!onBulkCategorize || selectedTransactionIds.length === 0) return
    setIsBulkOperating(true)
    try {
      const { updated } = await onBulkCategorize(
        selectedTransactionIds,
        category
      )
      setSelectedTransactionIds([])
      toast.success(txDone(updated, 'categorizad'))
    } catch (error) {
      reportError(error, 'No se pudieron categorizar las transacciones')
    } finally {
      setIsBulkOperating(false)
    }
  }

  async function handleBulkIgnore() {
    if (
      !onBulkCategorize ||
      selectedTransactionIds.length === 0 ||
      isBulkOperating
    )
      return
    setIsBulkOperating(true)
    try {
      const { updated } = await onBulkCategorize(
        selectedTransactionIds,
        'ignored'
      )
      setSelectedTransactionIds([])
      toast.success(txDone(updated, 'ignorad'))
    } catch (error) {
      reportError(error, 'No se pudieron ignorar las transacciones')
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
        setSelectedTransactionIds([])
        reportDeleted(result)
      }
    } catch (error) {
      reportError(error, 'No se pudieron eliminar las transacciones')
    } finally {
      setIsBulkOperating(false)
    }
  }

  function openBulkEdit() {
    setBulkEditCategory('')
    setBulkEditTagList([])
    setBulkCategorySearch('')
    setBulkTagSearch('')
    setBulkEditOpen(true)
  }

  function closeBulkEdit() {
    setBulkEditOpen(false)
    setBulkCategoryPickerOpen(false)
    setBulkTagPickerOpen(false)
    setBulkCategorySearch('')
    setBulkTagSearch('')
  }

  async function handleBulkEditSave() {
    if (selectedTransactionIds.length === 0 || isBulkOperating) return
    setIsBulkOperating(true)
    // Steps run in sequence; on failure the message says which already
    // applied, so a retry isn't a blind guess.
    const applied: string[] = []
    const ids = selectedTransactionIds
    const steps: BulkStep[] = []
    if (bulkEditCategory && onBulkCategorize) {
      const category = bulkEditCategory
      steps.push({
        label: 'la categoría',
        run: () => onBulkCategorize(ids, category),
      })
    }
    if (onBulkTag) {
      for (const tag of bulkEditTagList) {
        steps.push({
          label: `la etiqueta "${tag}"`,
          run: () => onBulkTag(ids, tag),
        })
      }
    }
    try {
      const updated = await runBulkSteps(steps, (label) => applied.push(label))
      setSelectedTransactionIds([])
      closeBulkEdit()
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
    handleAutoCategorizeSelected,
    handleBulkCategorizeSelected,
    handleBulkIgnore,
    handleBulkDelete,
    openBulkEdit,
    closeBulkEdit,
    handleBulkEditSave,
    // The bulk edit dialog's draft, picker and search state.
    bulkEdit: {
      open: bulkEditOpen,
      category: bulkEditCategory,
      setCategory: setBulkEditCategory,
      tagList: bulkEditTagList,
      setTagList: setBulkEditTagList,
      categoryPickerOpen: bulkCategoryPickerOpen,
      setCategoryPickerOpen: setBulkCategoryPickerOpen,
      categorySearch: bulkCategorySearch,
      setCategorySearch: setBulkCategorySearch,
      tagPickerOpen: bulkTagPickerOpen,
      setTagPickerOpen: setBulkTagPickerOpen,
      tagSearch: bulkTagSearch,
      setTagSearch: setBulkTagSearch,
    },
  }
}

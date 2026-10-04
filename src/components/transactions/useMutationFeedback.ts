import { toast } from 'sonner'
import type { Transaction } from '../../models'
import {
  NeedsConfirmationError,
  PartialWriteError,
  userErrorMessage,
} from '../../utils/user-error'
import { useConfirm } from '../ConfirmDialog'

export type DeleteResult = { removed: Transaction[]; reversible: boolean }

function isDeleteResult(value: unknown): value is DeleteResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as DeleteResult).removed)
  )
}

// "1 transacción eliminada" / "3 transacciones eliminadas" from a stem.
export function txDone(count: number, participleStem: string): string {
  return count === 1
    ? `1 transacción ${participleStem}a`
    : `${count} transacciones ${participleStem}as`
}

/**
 * How the Transacciones view reports a mutation's outcome: error toasts
 * (with retry / reload), delete toasts (with undo), and the confirm dialog
 * an irreversible delete asks through. Render `confirmDialog` once.
 */
export function useMutationFeedback({
  onReload,
  onRestoreTransactions,
}: {
  onReload?: () => void
  onRestoreTransactions?: (
    transactions: Transaction[]
  ) => Promise<{ restored: number }>
}) {
  function reportError(error: unknown, fallback: string, prefix = '') {
    // Some rows saved and are already shown (#60): say how many, offer to
    // retry just the rest, and keep the undo for what a delete did remove.
    if (error instanceof PartialWriteError) {
      if (isDeleteResult(error.result) && error.result.removed.length > 0) {
        reportDeleted(error.result)
      }
      const retry = error.retry
      toast.error(
        prefix + (retry ? `${error.message} — reintentar` : error.message),
        retry
          ? {
              action: {
                label: 'Reintentar',
                onClick: () => {
                  retry().then(
                    // Rows a retried delete removed get their own undo.
                    (result) =>
                      isDeleteResult(result)
                        ? reportDeleted(result)
                        : toast.success('Cambios guardados'),
                    (retryError: unknown) => reportError(retryError, fallback)
                  )
                },
              },
            }
          : onReload
            ? { action: { label: 'Recargar', onClick: onReload } }
            : {}
      )
      return
    }
    toast.error(
      userErrorMessage(error, fallback),
      onReload ? { action: { label: 'Recargar', onClick: onReload } } : {}
    )
  }

  // A reversible delete gets an undo action; an irreversible one (already
  // confirmed) just reports what happened.
  function reportDeleted(result: DeleteResult) {
    const message = txDone(result.removed.length, 'eliminad')
    if (!result.reversible || !onRestoreTransactions) {
      toast.success(message)
      return
    }
    const restore = onRestoreTransactions
    toast(message, {
      duration: 8000,
      action: {
        label: 'Deshacer',
        onClick: () => {
          toast.promise(restore(result.removed), {
            loading: 'Restaurando…',
            success: ({ restored }) => txDone(restored, 'restaurad'),
            error: (error) =>
              userErrorMessage(error, 'No se pudo deshacer la eliminación'),
          })
        },
      },
    })
  }

  // Tries a delete without confirmation; only when the handler says it
  // can't be undone does it ask, then retries with permission.
  async function deleteWithConfirmation(
    run: (allowIrreversible: boolean) => Promise<DeleteResult>,
    confirm: { title: string; description: string }
  ): Promise<DeleteResult | null> {
    try {
      return await run(false)
    } catch (error) {
      if (!(error instanceof NeedsConfirmationError)) throw error
    }
    const confirmed = await confirmDeletion({
      ...confirm,
      confirmLabel: 'Eliminar',
    })
    return confirmed ? run(true) : null
  }
  const { confirm: confirmDeletion, dialog: confirmDialog } = useConfirm()

  return {
    reportError,
    reportDeleted,
    deleteWithConfirmation,
    confirmDeletion,
    confirmDialog,
  }
}

import { useCallback, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from './ui/alert-dialog'
import { buttonVariants } from './ui/button'
import { cn } from './ui/utils'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  destructive = true,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              destructive
                ? buttonVariants({ variant: 'destructive' })
                : buttonVariants()
            )}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export function useConfirm(): {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  dialog: React.ReactNode
} {
  const [state, setState] = useState<{
    open: boolean
    opts: ConfirmOptions
  }>({ open: false, opts: { title: '' } })

  const resolveRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setState({ open: true, opts })
    })
  }, [])

  function handleConfirm() {
    setState((s) => ({ ...s, open: false }))
    resolveRef.current?.(true)
    resolveRef.current = null
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setState((s) => ({ ...s, open: false }))
      resolveRef.current?.(false)
      resolveRef.current = null
    }
  }

  const dialog = (
    <ConfirmDialog
      open={state.open}
      onOpenChange={handleOpenChange}
      title={state.opts.title}
      description={state.opts.description}
      confirmLabel={state.opts.confirmLabel}
      cancelLabel={state.opts.cancelLabel}
      destructive={state.opts.destructive}
      onConfirm={handleConfirm}
    />
  )

  return { confirm, dialog }
}

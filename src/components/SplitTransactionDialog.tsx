import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Description as DialogDescriptionPrimitive } from '@radix-ui/react-dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from './ui/utils'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { handleOptionListKeyDown } from './ui/option-list'
import { CategoryBadge } from './CategoryBadge'
import type { Transaction } from '../models'
import { formatCurrency } from '../utils/formatting'
import type { SplitPart } from '../services/mutations/transaction-mutations'
import { getCategoryDefinitions } from '../services/categories/category-registry'

interface SplitPartDraft {
  description: string
  amount: string
  category?: string
}

interface SplitTransactionDialogProps {
  open: boolean
  transaction: Transaction | null
  pending: boolean
  onConfirm: (parts: SplitPart[]) => Promise<void>
  onCancel: () => void
}

function emptyPart(tx: Transaction | null): SplitPartDraft {
  return {
    description: tx?.description ?? '',
    amount: '',
    category: undefined,
  }
}

export function SplitTransactionDialog({
  open,
  transaction,
  pending,
  onConfirm,
  onCancel,
}: SplitTransactionDialogProps) {
  const [parts, setParts] = useState<SplitPartDraft[]>([
    emptyPart(transaction),
    emptyPart(transaction),
  ])
  const [categoryPickerIdx, setCategoryPickerIdx] = useState<number | null>(
    null
  )

  useEffect(() => {
    if (transaction) {
      setParts([emptyPart(transaction), emptyPart(transaction)])
    }
    setCategoryPickerIdx(null)
  }, [transaction?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!transaction) return null

  const categoryOptions = getCategoryDefinitions().filter((c) => !c.isIgnored)

  const parentAmount = transaction.amount
  const currency = transaction.currency

  const parsedAmounts = parts.map((p) => {
    const v = parseFloat(p.amount.replace(',', '.'))
    return isNaN(v) ? 0 : v
  })
  const sumCents = Math.round(parsedAmounts.reduce((a, b) => a + b, 0) * 100)
  const parentCents = Math.round(parentAmount * 100)
  const remainingCents = parentCents - sumCents
  const remainingAmount = remainingCents / 100
  const isBalanced = remainingCents === 0
  const hasAllAmounts = parts.every((p) => p.amount.trim() !== '')
  const canConfirm = isBalanced && hasAllAmounts && !pending

  function updatePart(idx: number, patch: Partial<SplitPartDraft>) {
    setParts((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  function addPart() {
    setParts((prev) => [...prev, emptyPart(transaction)])
  }

  function removePart(idx: number) {
    if (parts.length <= 2) return
    setParts((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleConfirm() {
    if (!canConfirm || !transaction) return
    const parsed: SplitPart[] = parts.map((p) => ({
      description: p.description.trim() || transaction.description,
      amount: Math.round(parseFloat(p.amount.replace(',', '.')) * 100) / 100,
      category: p.category,
    }))
    await onConfirm(parsed)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-[560px]!">
        <DialogHeader>
          <DialogTitle>Dividir transacción</DialogTitle>
          {/* The subtitle names the transaction being split, so it is the
              dialog's accessible description. asChild keeps the element and
              its classes exactly as they were (no default description
              styles merged in). */}
          <DialogDescriptionPrimitive asChild>
            <div className="mt-[2px] text-[13px] text-[var(--text-muted)]">
              {transaction.description} &mdash;{' '}
              <span className="font-mono">
                {formatCurrency(parentAmount, currency)}
              </span>
            </div>
          </DialogDescriptionPrimitive>
        </DialogHeader>

        <div className="mx-0 my-[8px] flex flex-col gap-[8px]">
          {parts.map((part, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_110px_32px] items-start gap-[6px]"
            >
              <div className="flex flex-col gap-[4px]">
                <Input
                  aria-label={`Descripción parte ${idx + 1}`}
                  placeholder="Descripción"
                  value={part.description}
                  onChange={(e) =>
                    updatePart(idx, { description: e.target.value })
                  }
                  disabled={pending}
                  className="text-[13px]!"
                />
                {/* A Radix Popover, so Escape and outside clicks close only
                    the picker, never the dialog with the typed parts. */}
                <Popover
                  open={categoryPickerIdx === idx}
                  onOpenChange={(isOpen) =>
                    setCategoryPickerIdx(isOpen ? idx : null)
                  }
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={pending}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-[6px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-[8px] py-[4px] text-left text-[12px]',
                        part.category
                          ? 'text-[var(--text)]'
                          : 'text-[var(--text-muted)]'
                      )}
                    >
                      {part.category ? (
                        <CategoryBadge categoryId={part.category} />
                      ) : (
                        'Categoría (opcional)'
                      )}
                    </button>
                  </PopoverTrigger>

                  <PopoverContent
                    align="start"
                    sideOffset={2}
                    className="w-auto max-h-[200px] min-w-[200px] overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text)] shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
                    onKeyDown={handleOptionListKeyDown}
                    onWheel={(event) => event.stopPropagation()}
                    onTouchMove={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        updatePart(idx, { category: undefined })
                        setCategoryPickerIdx(null)
                      }}
                      className="block w-full cursor-pointer border-none bg-transparent px-[10px] py-[6px] text-left text-[12px] text-[var(--text-muted)]"
                    >
                      Sin categoría
                    </button>
                    {categoryOptions.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          updatePart(idx, { category: cat.id })
                          setCategoryPickerIdx(null)
                        }}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-[6px] border-none px-[10px] py-[5px] text-left text-[12px] text-[var(--text)]',
                          part.category === cat.id
                            ? 'bg-[var(--surface-hover)]'
                            : 'bg-transparent'
                        )}
                      >
                        <CategoryBadge categoryId={cat.id} />
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>

              <Input
                type="number"
                aria-label={`Monto parte ${idx + 1}`}
                min="0"
                step="0.01"
                placeholder="0.00"
                value={part.amount}
                onChange={(e) => updatePart(idx, { amount: e.target.value })}
                disabled={pending}
                className="text-right font-mono text-[13px]!"
              />

              <button
                type="button"
                onClick={() => removePart(idx)}
                disabled={parts.length <= 2 || pending}
                className={cn(
                  'mt-[2px] flex h-[32px] w-[32px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-transparent text-[var(--text-muted)]',
                  parts.length <= 2
                    ? 'cursor-not-allowed opacity-30'
                    : 'cursor-pointer opacity-100'
                )}
                title="Eliminar parte"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addPart}
            disabled={pending}
            className="flex w-fit cursor-pointer items-center gap-[6px] rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-transparent px-[10px] py-[6px] text-[12px] text-[var(--text-muted)]"
          >
            <Plus size={14} />
            Agregar parte
          </button>
        </div>

        <div
          className={cn(
            'flex items-center justify-between rounded-[var(--radius)] border bg-[var(--surface)] px-[12px] py-[10px] text-[13px]',
            isBalanced ? 'border-[var(--border)]' : 'border-[var(--neg)]'
          )}
        >
          <span className="text-[var(--text-muted)]">Restante</span>
          <span
            className={cn(
              'font-mono font-semibold',
              isBalanced
                ? 'text-[var(--text-muted)]'
                : remainingCents < 0
                  ? 'text-[var(--neg)]'
                  : 'text-[var(--text)]'
            )}
          >
            {remainingCents < 0 ? '−' : ''}
            {formatCurrency(Math.abs(remainingAmount), currency)}
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {pending ? 'Guardando…' : 'Dividir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

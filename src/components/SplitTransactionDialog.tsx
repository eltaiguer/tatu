import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { CategoryBadge } from './CategoryBadge'
import type { Transaction } from '../models'
import { formatCurrency } from '../utils/formatting'
import type { SplitPart } from '../services/supabase/transactions'
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
    setParts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, ...patch } : p))
    )
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
      <DialogContent
        style={{ maxWidth: 560 }}
        onClick={() => setCategoryPickerIdx(null)}
      >
        <DialogHeader>
          <DialogTitle>Dividir transacción</DialogTitle>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              marginTop: 2,
            }}
          >
            {transaction.description} &mdash;{' '}
            <span className="font-mono">
              {formatCurrency(parentAmount, currency)}
            </span>
          </div>
        </DialogHeader>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            margin: '8px 0',
          }}
        >
          {parts.map((part, idx) => (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 110px 32px',
                gap: 6,
                alignItems: 'start',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Input
                  placeholder="Descripción"
                  value={part.description}
                  onChange={(e) =>
                    updatePart(idx, { description: e.target.value })
                  }
                  disabled={pending}
                  style={{ fontSize: 13 }}
                />
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setCategoryPickerIdx((prev) =>
                        prev === idx ? null : idx
                      )
                    }}
                    disabled={pending}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '4px 8px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      background: 'var(--surface)',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: part.category
                        ? 'var(--text)'
                        : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {part.category ? (
                      <CategoryBadge categoryId={part.category} />
                    ) : (
                      'Categoría (opcional)'
                    )}
                  </button>

                  {categoryPickerIdx === idx && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        zIndex: 50,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        maxHeight: 200,
                        overflowY: 'auto',
                        minWidth: 200,
                        marginTop: 2,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          updatePart(idx, { category: undefined })
                          setCategoryPickerIdx(null)
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '6px 10px',
                          fontSize: 12,
                          color: 'var(--text-muted)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                        }}
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
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            width: '100%',
                            textAlign: 'left',
                            padding: '5px 10px',
                            fontSize: 12,
                            background:
                              part.category === cat.id
                                ? 'var(--surface-hover)'
                                : 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text)',
                          }}
                        >
                          <CategoryBadge categoryId={cat.id} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={part.amount}
                onChange={(e) => updatePart(idx, { amount: e.target.value })}
                disabled={pending}
                className="font-mono"
                style={{ fontSize: 13, textAlign: 'right' }}
              />

              <button
                type="button"
                onClick={() => removePart(idx)}
                disabled={parts.length <= 2 || pending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'none',
                  cursor: parts.length <= 2 ? 'not-allowed' : 'pointer',
                  opacity: parts.length <= 2 ? 0.3 : 1,
                  color: 'var(--text-muted)',
                  marginTop: 2,
                }}
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
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius)',
              padding: '6px 10px',
              fontSize: 12,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              width: 'fit-content',
            }}
          >
            <Plus size={14} />
            Agregar parte
          </button>
        </div>

        <div
          style={{
            padding: '10px 12px',
            background: 'var(--surface)',
            border: `1px solid ${isBalanced ? 'var(--border)' : 'var(--neg)'}`,
            borderRadius: 'var(--radius)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 13,
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>Restante</span>
          <span
            className="font-mono"
            style={{
              fontWeight: 600,
              color: isBalanced
                ? 'var(--text-muted)'
                : remainingCents < 0
                  ? 'var(--neg)'
                  : 'var(--text)',
            }}
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

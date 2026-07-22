import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SplitTransactionDialog } from './SplitTransactionDialog'
import type { Transaction } from '../models'
import type { SplitPart } from '../services/supabase/transactions'
import {
  addCustomCategory,
  replaceCustomCategories,
  upsertBuiltinOverride,
} from '../services/categories/category-store'

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2025-01-01'),
    description: 'SUPERMERCADO ABC',
    amount: 100,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
    ...overrides,
  }
}

function renderDialog(props: {
  open?: boolean
  transaction?: Transaction | null
  pending?: boolean
  onConfirm?: (parts: SplitPart[]) => Promise<void>
  onCancel?: ReturnType<typeof vi.fn>
}) {
  const onConfirm = props.onConfirm ?? vi.fn(async () => {})
  const onCancel = props.onCancel ?? vi.fn()

  render(
    <SplitTransactionDialog
      open={props.open ?? true}
      transaction={props.transaction ?? makeTransaction()}
      pending={props.pending ?? false}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )

  return { onConfirm, onCancel }
}

describe('SplitTransactionDialog', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('offers a custom category in the split part category picker', async () => {
    const custom = addCustomCategory({ label: 'Mascotas', color: '#00ff00' })
    renderDialog({})

    await waitFor(() => screen.getAllByPlaceholderText('0.00'))

    fireEvent.click(screen.getAllByText('Categoría (opcional)')[0])
    expect(screen.getByText(custom.label)).toBeInTheDocument()
  })

  it('shows the overridden label for a renamed built-in category', async () => {
    upsertBuiltinOverride('groceries', { label: 'Super y almacén' })
    renderDialog({})

    await waitFor(() => screen.getAllByPlaceholderText('0.00'))

    fireEvent.click(screen.getAllByText('Categoría (opcional)')[0])
    expect(screen.getByText('Super y almacén')).toBeInTheDocument()
  })

  it('renders title when open with a transaction', async () => {
    renderDialog({})
    await waitFor(() => {
      expect(screen.getByText('Dividir transacción')).toBeInTheDocument()
    })
  })

  it('disables confirm button when amounts do not sum to parent total', async () => {
    renderDialog({})

    await waitFor(() => screen.getAllByPlaceholderText('0.00'))

    const amountInputs = screen.getAllByPlaceholderText('0.00')
    fireEvent.change(amountInputs[0], { target: { value: '60' } })
    fireEvent.change(amountInputs[1], { target: { value: '30' } })

    const confirmBtn = screen.getByRole('button', { name: 'Dividir' })
    expect(confirmBtn).toHaveProperty('disabled', true)
  })

  it('enables confirm button when amounts sum exactly to parent total', async () => {
    renderDialog({})

    await waitFor(() => screen.getAllByPlaceholderText('0.00'))

    const amountInputs = screen.getAllByPlaceholderText('0.00')
    fireEvent.change(amountInputs[0], { target: { value: '60' } })
    fireEvent.change(amountInputs[1], { target: { value: '40' } })

    const confirmBtn = screen.getByRole('button', { name: 'Dividir' })
    expect(confirmBtn).toHaveProperty('disabled', false)
  })

  it('calls onConfirm with parsed numeric amounts', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onConfirm })

    await waitFor(() => screen.getAllByPlaceholderText('0.00'))

    const amountInputs = screen.getAllByPlaceholderText('0.00')
    fireEvent.change(amountInputs[0], { target: { value: '60' } })
    fireEvent.change(amountInputs[1], { target: { value: '40' } })

    fireEvent.click(screen.getByRole('button', { name: 'Dividir' }))

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith([
        expect.objectContaining({ amount: 60 }),
        expect.objectContaining({ amount: 40 }),
      ])
    })
  })

  it('adds a new part when Agregar parte is clicked', async () => {
    renderDialog({})

    await waitFor(() => screen.getAllByPlaceholderText('0.00'))
    const before = screen.getAllByPlaceholderText('0.00').length

    fireEvent.click(screen.getByText('Agregar parte'))
    const after = screen.getAllByPlaceholderText('0.00').length
    expect(after).toBe(before + 1)
  })

  it('calls onCancel when Cancelar is clicked', async () => {
    const onCancel = vi.fn()
    renderDialog({ onCancel })

    await waitFor(() => screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalled()
  })
})

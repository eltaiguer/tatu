import { beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Toaster } from 'sonner'
import { Categories } from './Categories'
import type { Transaction } from '../models'
import {
  addCustomCategory,
  listCustomCategories,
  replaceCustomCategories,
} from '../services/categories/category-store'

// Category and rule changes are saved to Supabase before they count; give
// these view tests a signed-in session and a server that accepts writes.
vi.mock('../services/supabase/runtime', () => ({
  getActiveSupabaseSession: () => ({ user: { id: 'user-1' } }),
}))
vi.mock('../services/supabase/custom-categories', () => ({
  upsertCustomCategory: vi.fn().mockResolvedValue(undefined),
  archiveCustomCategory: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../services/supabase/custom-patterns', () => ({
  upsertCustomPattern: vi.fn().mockResolvedValue(undefined),
  deleteCustomPattern: vi.fn().mockResolvedValue(undefined),
}))

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2026-01-10T00:00:00.000Z'),
    description: 'sample',
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    category: 'groceries',
    rawData: {},
    ...overrides,
  }
}

describe('Categories', () => {
  beforeEach(() => {
    replaceCustomCategories([])
    vi.restoreAllMocks()
  })

  it('renders the page heading and all default categories', () => {
    render(<Categories transactions={[]} />)

    expect(
      screen.getByRole('heading', { name: 'Categorías y reglas' })
    ).toBeInTheDocument()
    expect(screen.getByText('Tus categorías')).toBeInTheDocument()
    expect(screen.getByText('Alimentación')).toBeInTheDocument()
    expect(screen.getByText('Restaurantes')).toBeInTheDocument()
    expect(screen.getByText('Transporte')).toBeInTheDocument()
  })

  it('shows transaction count per category', () => {
    const txs = [
      makeTx({ id: '1', category: 'groceries' }),
      makeTx({ id: '2', category: 'groceries' }),
      makeTx({ id: '3', category: 'restaurants' }),
    ]
    render(<Categories transactions={txs} />)

    expect(screen.getByText('2 movimientos')).toBeInTheDocument()
    expect(screen.getByText('1 movimiento')).toBeInTheDocument()
  })

  it('excludes the inert split-parent row from the transaction count', () => {
    const txs = [
      makeTx({ id: '1', category: 'groceries', isSplitParent: true }),
      makeTx({ id: '1_split_0', category: 'groceries', splitParentId: '1' }),
      makeTx({ id: '1_split_1', category: 'restaurants', splitParentId: '1' }),
    ]
    render(<Categories transactions={txs} />)

    expect(screen.getAllByText('1 movimiento')).toHaveLength(2)
  })

  it('opens new category form when clicking Nueva categoría', () => {
    render(<Categories transactions={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }))

    expect(screen.getByLabelText('Nombre de categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Color de categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Icono de categoría')).toBeInTheDocument()
  })

  it('creates a new custom category', () => {
    render(<Categories transactions={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }))

    fireEvent.change(screen.getByLabelText('Nombre de categoría'), {
      target: { value: 'Mascotas' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar categoría' }))

    expect(listCustomCategories()[0].label).toBe('Mascotas')
  })

  it('edits custom category color and icon', async () => {
    const custom = addCustomCategory({
      label: 'Coffee',
      color: '#ff0000',
      icon: '☕',
    })

    render(<Categories transactions={[makeTx({ category: custom.id })]} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Editar categoría ${custom.label}` })
    )

    fireEvent.change(screen.getByLabelText('Color de categoría'), {
      target: { value: '#00ff00' },
    })
    fireEvent.change(screen.getByLabelText('Icono de categoría'), {
      target: { value: '🫖' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(listCustomCategories()[0].color).toBe('#00ff00')
    expect(listCustomCategories()[0].icon).toBe('🫖')
  })

  it('deletes a custom category', async () => {
    const custom = addCustomCategory({
      label: 'Yoga',
      color: '#aabbcc',
      icon: '🧘',
    })
    expect(listCustomCategories()).toHaveLength(1)

    render(<Categories transactions={[]} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Eliminar categoría ${custom.label}` })
    )

    expect(listCustomCategories()).toHaveLength(0)
  })

  it('adds and removes a pattern rule', async () => {
    render(<Categories transactions={[]} />)

    fireEvent.change(screen.getByPlaceholderText(/Ej\. "farmacia"/), {
      target: { value: 'farmashop' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar regla' }))

    await screen.findByText(/"farmashop"/)

    const removeBtn = screen.getByRole('button', {
      name: 'Eliminar regla farmashop',
    })
    fireEvent.click(removeBtn)

    // Removed once the server confirms the delete.
    await waitFor(() =>
      expect(screen.queryByText(/"farmashop"/)).not.toBeInTheDocument()
    )
  })

  it('reports how many past transactions a new rule was applied to', async () => {
    const onApplyPatternToPast = vi
      .fn()
      .mockResolvedValue({ updated: 3, failed: 0 })
    render(
      <>
        <Categories
          transactions={[]}
          onApplyPatternToPast={onApplyPatternToPast}
        />
        <Toaster />
      </>
    )

    fireEvent.change(screen.getByPlaceholderText(/Ej\. "farmacia"/), {
      target: { value: 'farmashop' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pasadas y futuras' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar regla' }))

    expect(
      await screen.findByText('Regla creada · aplicada a 3 transacciones')
    ).toBeInTheDocument()
  })

  it('says how many past transactions failed instead of claiming success', async () => {
    const onApplyPatternToPast = vi
      .fn()
      .mockResolvedValue({ updated: 2, failed: 1 })
    render(
      <>
        <Categories
          transactions={[]}
          onApplyPatternToPast={onApplyPatternToPast}
        />
        <Toaster />
      </>
    )

    fireEvent.change(screen.getByPlaceholderText(/Ej\. "farmacia"/), {
      target: { value: 'farmashop' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pasadas y futuras' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar regla' }))

    expect(
      await screen.findByText(/Se aplicó a 2 de 3 transacciones/)
    ).toBeInTheDocument()
  })

  it('confirms a new category only after it is saved', async () => {
    render(
      <>
        <Categories transactions={[]} />
        <Toaster />
      </>
    )
    fireEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }))
    fireEvent.change(screen.getByLabelText('Nombre de categoría'), {
      target: { value: 'Viajes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar categoría' }))

    expect(
      await screen.findByText('Categoría "Viajes" creada')
    ).toBeInTheDocument()
  })

  it('opens the uncategorized transactions from "Sin categoría"', () => {
    const onNavigateToTransactions = vi.fn()
    render(
      <Categories
        transactions={[
          makeTx({ id: 'a', category: undefined }),
          makeTx({ id: 'b', category: '' }),
        ]}
        onNavigateToTransactions={onNavigateToTransactions}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: /2 movimientos · Revisar/ })
    )
    expect(onNavigateToTransactions).toHaveBeenCalledWith({
      categories: ['uncategorized'],
    })
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { Toaster } from 'sonner'
import { Categories } from './Categories'
import type { Transaction } from '../models'
import {
  addCustomCategory,
  listCustomCategories,
  replaceCustomCategories,
} from '../services/categories/category-store'
import {
  addCustomPattern,
  clearAllCustomPatterns,
  listCustomPatterns,
} from '../services/categorizer/custom-patterns'

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
    clearAllCustomPatterns()
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

  it("shows each category's spend and how many expenses make it up", () => {
    const txs = [
      makeTx({ id: '1', category: 'groceries', amount: 100, currency: 'USD' }),
      makeTx({ id: '2', category: 'groceries', amount: 400, currency: 'UYU' }),
      makeTx({ id: '3', category: 'restaurants', amount: 7, currency: 'USD' }),
      // A refund in the same category is not an expense.
      makeTx({
        id: '4',
        category: 'groceries',
        amount: 50,
        currency: 'USD',
        type: 'credit',
      }),
    ]
    render(<Categories transactions={txs} homeCurrency="USD" fxRate={40} />)

    expect(screen.getByText(/US\$ 110,00 · 2 gastos/)).toBeInTheDocument()
    expect(screen.getByText(/US\$ 7,00 · 1 gasto$/)).toBeInTheDocument()
  })

  it('lists categories by spend, largest first, ignored ones last', () => {
    const txs = [
      makeTx({ id: '1', category: 'restaurants', amount: 5, currency: 'USD' }),
      makeTx({ id: '2', category: 'groceries', amount: 50, currency: 'USD' }),
    ]
    render(<Categories transactions={txs} homeCurrency="USD" fxRate={40} />)

    const names = screen
      .getAllByRole('button', { name: /^Editar categoría/ })
      .map((b) => b.getAttribute('aria-label'))
    expect(names.indexOf('Editar categoría Alimentación')).toBeLessThan(
      names.indexOf('Editar categoría Restaurantes')
    )
    expect(names.indexOf('Editar categoría Restaurantes')).toBeLessThan(
      names.indexOf('Editar categoría Salud')
    )
  })

  it("shows a category's spend as soon as it stops being ignored", async () => {
    render(
      <Categories
        transactions={[
          makeTx({
            id: '1',
            category: 'external_transfer',
            amount: 9,
            currency: 'USD',
          }),
        ]}
        homeCurrency="USD"
        fxRate={40}
      />
    )
    // Ignored by default: counted, but no spend.
    expect(screen.queryByText(/US\$ 9,00/)).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Editar categoría Transferencias externas',
      })
    )
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText(/US\$ 9,00 · 1 gasto/)).toBeInTheDocument()
  })

  it('gives a deleted category that still has expenses its own card', () => {
    render(
      <Categories
        transactions={[
          makeTx({
            id: '1',
            category: 'cafe-viejo',
            amount: 3,
            currency: 'USD',
          }),
        ]}
        homeCurrency="USD"
        fxRate={40}
      />
    )

    expect(screen.getByText('sin definir')).toBeInTheDocument()
    expect(screen.getByText(/US\$ 3,00 · 1 gasto/)).toBeInTheDocument()
  })

  it('excludes the inert split-parent row from the transaction count', () => {
    const txs = [
      makeTx({ id: '1', category: 'groceries', isSplitParent: true }),
      makeTx({ id: '1_split_0', category: 'groceries', splitParentId: '1' }),
      makeTx({ id: '1_split_1', category: 'restaurants', splitParentId: '1' }),
    ]
    render(<Categories transactions={txs} homeCurrency="UYU" fxRate={40} />)

    // Each part is one expense; the parent counts nowhere.
    expect(screen.getAllByText(/· 1 gasto$/)).toHaveLength(2)
  })

  it('opens new category form when clicking Nueva categoría', () => {
    render(<Categories transactions={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }))

    expect(screen.getByLabelText('Nombre de categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Color de categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Icono de categoría')).toBeInTheDocument()
  })

  it('creates a new custom category', async () => {
    render(<Categories transactions={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }))

    fireEvent.change(screen.getByLabelText('Nombre de categoría'), {
      target: { value: 'Mascotas' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar categoría' }))

    expect(listCustomCategories()[0].label).toBe('Mascotas')
    // The form closes once the save is confirmed by the server.
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Nombre de categoría')
      ).not.toBeInTheDocument()
    )
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
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Nombre de categoría')
      ).not.toBeInTheDocument()
    )
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
    await waitFor(() =>
      expect(
        screen.queryByRole('button', {
          name: `Eliminar categoría ${custom.label}`,
        })
      ).not.toBeInTheDocument()
    )
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

  it("shows how many transactions each rule's pattern matches", () => {
    addCustomPattern({
      pattern: 'uber',
      matchType: 'contains',
      category: 'transport',
    })
    render(
      <Categories
        transactions={[
          makeTx({ id: '1', description: 'UBER TRIP' }),
          makeTx({ id: '2', description: 'UBER EATS' }),
          makeTx({ id: '3', description: 'DEVOTO' }),
        ]}
      />
    )

    expect(screen.getByText(/2 transacciones coinciden/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Agregar regla/ })
    ).toHaveTextContent('Agregar regla')
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
    fireEvent.click(screen.getByRole('radio', { name: 'Pasadas y futuras' }))
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
    fireEvent.click(screen.getByRole('radio', { name: 'Pasadas y futuras' }))
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

    fireEvent.click(screen.getByRole('button', { name: 'Revisar 2' }))
    expect(onNavigateToTransactions).toHaveBeenCalledWith({
      categories: ['uncategorized'],
    })
  })

  it('saves the type and category chosen in the rule form', async () => {
    render(<Categories transactions={[]} />)

    fireEvent.change(screen.getByPlaceholderText(/Ej\. "farmacia"/), {
      target: { value: 'uber' },
    })
    fireEvent.change(screen.getByLabelText('Tipo'), {
      target: { value: 'starts_with' },
    })
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'transport' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Agregar regla/ }))

    await waitFor(() =>
      expect(listCustomPatterns()).toEqual([
        expect.objectContaining({
          matchType: 'starts_with',
          category: 'transport',
        }),
      ])
    )
  })

  it('exposes which scope is selected to assistive tech', () => {
    render(<Categories transactions={[]} />)

    const group = screen.getByRole('group', { name: 'Aplicar a' })
    expect(
      within(group).getByRole('radio', { name: 'Solo futuras' })
    ).toBeChecked()
    fireEvent.click(
      within(group).getByRole('radio', { name: 'Pasadas y futuras' })
    )
    expect(
      within(group).getByRole('radio', { name: 'Pasadas y futuras' })
    ).toBeChecked()
  })
})

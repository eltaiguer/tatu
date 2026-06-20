import { beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Categories } from './Categories'
import type { Transaction } from '../models'
import {
  addCustomCategory,
  listCustomCategories,
  replaceCustomCategories,
} from '../services/categories/category-store'

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

  it('opens new category form when clicking Nueva categoría', () => {
    render(<Categories transactions={[]} />)
    fireEvent.click(
      screen.getByRole('button', { name: /Nueva categoría/ })
    )

    expect(screen.getByLabelText('Nombre de categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Color de categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Icono de categoría')).toBeInTheDocument()
  })

  it('creates a new custom category', () => {
    render(<Categories transactions={[]} />)
    fireEvent.click(
      screen.getByRole('button', { name: /Nueva categoría/ })
    )

    fireEvent.change(screen.getByLabelText('Nombre de categoría'), {
      target: { value: 'Mascotas' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar categoría' }))

    expect(listCustomCategories()[0].label).toBe('Mascotas')
  })

  it('edits custom category color and icon', async () => {
    const custom = addCustomCategory({ label: 'Coffee', color: '#ff0000', icon: '☕' })

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
    const custom = addCustomCategory({ label: 'Yoga', color: '#aabbcc', icon: '🧘' })
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

    expect(screen.queryByText(/"farmashop"/)).not.toBeInTheDocument()
  })
})

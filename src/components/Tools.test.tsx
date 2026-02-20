import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Tools } from './Tools'
import type { Transaction } from '../models'

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2026-01-10T00:00:00.000Z'),
    description: 'sample',
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    category: 'food',
    rawData: {},
    ...overrides,
  }
}

describe('Tools', () => {
  it('shows active filters count and clears filters', () => {
    render(<Tools transactions={[]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Pesos (UYU)' }))
    fireEvent.change(screen.getByLabelText('Desde'), {
      target: { value: '2026-01-01' },
    })

    expect(screen.getByText('Activos:')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar todos' }))
    expect(screen.queryByText('Activos:')).not.toBeInTheDocument()
  })

  it('calculates category totals from debit transactions', () => {
    const transactions = [
      makeTransaction({
        id: 'food-debit',
        category: 'food',
        type: 'debit',
        amount: 150,
      }),
      makeTransaction({
        id: 'food-credit',
        category: 'food',
        type: 'credit',
        amount: 50,
      }),
    ]

    render(<Tools transactions={transactions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Categorías' }))

    const cards = screen.getAllByText('Alimentación')
    expect(cards.length).toBeGreaterThan(0)
    const categoryCard = cards[0].closest('[data-slot="card"]')
    expect(categoryCard).toBeTruthy()
    expect(within(categoryCard as HTMLElement).getByText(/150,00/)).toBeInTheDocument()
  })

  it('renders export and settings tabs with expected controls', () => {
    render(<Tools transactions={[makeTransaction({ id: 'tx-a' })]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }))
    expect(screen.getByRole('heading', { name: 'Exportar Datos' })).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha inicial')).toBeInTheDocument()
    expect(screen.getByText(/La exportación incluirá 1 transacciones/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Configuración' }))
    expect(screen.getByRole('heading', { name: 'Configuración' })).toBeInTheDocument()
    expect(screen.getByLabelText('Formato de fecha')).toBeInTheDocument()
    expect(screen.getByLabelText('Separador decimal')).toBeInTheDocument()
  })
})

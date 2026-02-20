import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Transactions } from './Transactions'
import type { Transaction } from '../models'

function makeTransaction(index: number, description?: string): Transaction {
  return {
    id: `tx-${index}`,
    date: new Date(2026, 0, index + 1),
    description: description ?? `transaction ${index}`,
    amount: 100 + index,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
  }
}

describe('Transactions', () => {
  it('clamps pagination when filtering reduces total pages', () => {
    const transactions = Array.from({ length: 25 }, (_, i) =>
      makeTransaction(i, i === 3 ? 'target merchant' : `transaction ${i}`)
    )

    render(<Transactions transactions={transactions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.change(
      screen.getByPlaceholderText('Buscar por comercio o descripción...'),
      {
        target: { value: 'target merchant' },
      }
    )

    expect(screen.getAllByText('target merchant').length).toBeGreaterThan(0)
    expect(screen.getByText('Mostrando 1-1 de 1')).toBeInTheDocument()
  })

  it('shows empty state when there are no transactions', () => {
    render(<Transactions transactions={[]} />)

    expect(
      screen.getAllByText('No hay transacciones para mostrar').length
    ).toBeGreaterThan(0)
    expect(screen.getByText('Mostrando 0 de 0')).toBeInTheDocument()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
  beforeEach(() => {
    vi.restoreAllMocks()
  })

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

  it('allows searching by tags', () => {
    const transactions = [
      makeTransaction(1, 'supermarket'),
      {
        ...makeTransaction(2, 'invoice'),
        tags: ['services', 'monthly'],
      },
    ]

    render(<Transactions transactions={transactions} />)

    fireEvent.change(
      screen.getByPlaceholderText('Buscar por comercio o descripción...'),
      {
        target: { value: 'monthly' },
      }
    )

    expect(screen.getAllByText('invoice').length).toBeGreaterThan(0)
    expect(screen.queryByText('supermarket')).not.toBeInTheDocument()
  })

  it('opens modal editor when clicking edit', () => {
    render(<Transactions transactions={[makeTransaction(1, 'merchant')]} />)

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar merchant' })[0]
    )

    expect(screen.getByText('Editar transacción')).toBeInTheDocument()
    expect(screen.getByLabelText('Descripción edición')).toBeInTheDocument()
  })

  it('triggers transaction update from modal edit', async () => {
    const onUpdateTransaction = vi.fn().mockResolvedValue(undefined)

    const transactions = [
      {
        ...makeTransaction(1, 'original merchant'),
        tags: ['old'],
      },
      {
        ...makeTransaction(2, 'other merchant'),
        tags: ['monthly'],
      },
    ]

    render(
      <Transactions
        transactions={transactions}
        onUpdateTransaction={onUpdateTransaction}
      />
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar original merchant' })[0]
    )

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Edited merchant' },
    })
    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.change(screen.getByLabelText('Nueva categoría'), {
      target: { value: 'services' },
    })
    fireEvent.click(screen.getByLabelText('Crear categoría'))
    fireEvent.click(screen.getByLabelText('Tags dropdown'))
    fireEvent.click(screen.getAllByText('monthly')[0])
    fireEvent.click(screen.getByLabelText('Tags dropdown'))
    fireEvent.change(screen.getByLabelText('Nuevo tag'), {
      target: { value: 'recurring' },
    })
    fireEvent.click(screen.getByLabelText('Crear tag'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(onUpdateTransaction).toHaveBeenCalledWith('tx-1', {
        description: 'Edited merchant',
        category: 'services',
        tags: ['old', 'monthly', 'recurring'],
      })
    )
  })

  it('validates empty description before saving edit', async () => {
    const onUpdateTransaction = vi.fn().mockResolvedValue(undefined)

    render(
      <Transactions
        transactions={[makeTransaction(1, 'merchant')]}
        onUpdateTransaction={onUpdateTransaction}
      />
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar merchant' })[0]
    )
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      screen.getByText('La descripción no puede quedar vacía')
    ).toBeInTheDocument()
    expect(onUpdateTransaction).not.toHaveBeenCalled()
  })

  it('shows category and tag suggestions in modal editor', () => {
    const transactions = [
      {
        ...makeTransaction(1, 'merchant one'),
        category: 'utilities',
        tags: ['monthly'],
      },
      {
        ...makeTransaction(2, 'merchant two'),
        category: 'custom-category',
        tags: ['fixed-cost'],
      },
    ]

    render(<Transactions transactions={transactions} />)

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar merchant one' })[0]
    )

    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    expect(screen.getAllByText('Servicios').length).toBeGreaterThan(0)
    expect(screen.getByText('custom-category')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Tags dropdown'))
    expect(screen.getAllByText('monthly').length).toBeGreaterThan(0)
    expect(screen.getByText('fixed-cost')).toBeInTheDocument()
  })

  it('triggers delete callback only after confirmation', async () => {
    const onDeleteTransaction = vi.fn().mockResolvedValue(undefined)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <Transactions
        transactions={[makeTransaction(1, 'to-delete')]}
        onDeleteTransaction={onDeleteTransaction}
      />
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Eliminar to-delete' })[0]
    )

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(onDeleteTransaction).toHaveBeenCalledWith('tx-1')
    )
  })

  it('does not delete when confirmation is rejected', () => {
    const onDeleteTransaction = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(
      <Transactions
        transactions={[makeTransaction(1, 'to-keep')]}
        onDeleteTransaction={onDeleteTransaction}
      />
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Eliminar to-keep' })[0]
    )

    expect(onDeleteTransaction).not.toHaveBeenCalled()
  })
})

import { beforeEach, vi, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useStore } from 'zustand'
import { Toaster } from 'sonner'
import { Transactions } from '../Transactions'
import type { Transaction } from '../../models'
import { setHousehold } from '../../services/mutations/transaction-mutations'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../../services/repository/in-memory-repository'
import { transactionStore } from '../../stores/transaction-store'
import { workspaceStore } from '../../stores/workspace-state'
import { replaceCustomCategories } from '../../services/categories/category-store'

function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: new Date('2026-03-10T00:00:00.000Z'),
    description: id,
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    category: 'groceries',
    rawData: {},
    ...overrides,
  } as Transaction
}

let repo: InMemoryRepository

// The view reads the store like App does, so a write shows once it is saved.
function Harness() {
  const transactions = useStore(transactionStore, (s) => s.transactions)
  return (
    <>
      <Transactions
        transactions={transactions}
        onSetHousehold={(ids, household) => setHousehold(repo, ids, household)}
      />
      <Toaster />
    </>
  )
}

function seed(rows: Transaction[]) {
  repo = createInMemoryRepository({ transactions: rows })
  transactionStore.getState().setTransactions(rows)
  workspaceStore.setState({ userId: repo.userId, status: 'ready' })
  render(<Harness />)
}

// Both the desktop row and the mobile card render; [0] is the row.
function house(description: string, which = 0) {
  return screen.getAllByRole('button', {
    name: `Gasto del hogar: ${description}`,
  })[which]
}

describe('house toggle on rows and cards (#251)', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('shows a house on counted expenses only, with what it says', () => {
    seed([
      tx('Devoto'),
      tx('Cena', { category: 'restaurants' }),
      tx('Sueldo', { type: 'credit', category: 'income' }),
      tx('Pago tarjeta', { category: 'internal_transfer' }),
      tx('Madre', { isSplitParent: true }),
      tx('Misterio', { category: 'uncategorized' }),
    ])

    expect(house('Devoto')).toHaveAttribute('aria-pressed', 'true')
    expect(house('Devoto')).toHaveAttribute(
      'title',
      'Hogar · según Alimentación'
    )
    expect(house('Cena')).toHaveAttribute('aria-pressed', 'false')
    expect(house('Cena')).toHaveAttribute(
      'title',
      'No es del hogar · según Restaurantes'
    )
    expect(house('Misterio')).toHaveAttribute(
      'title',
      'Sin definir: categorizala o marcala'
    )
    for (const none of ['Sueldo', 'Pago tarjeta', 'Madre']) {
      expect(
        screen.queryByRole('button', { name: `Gasto del hogar: ${none}` })
      ).toBeNull()
    }
  })

  it('marks a row by hand, then goes back to the category on the next click', async () => {
    seed([tx('Cena', { category: 'restaurants' })])

    await act(async () => {
      fireEvent.click(house('Cena'))
    })
    expect(house('Cena')).toHaveAttribute('aria-pressed', 'true')
    expect(house('Cena')).toHaveAttribute('title', 'Hogar · elegido a mano')
    expect(repo.row('Cena')?.household).toBe(true)

    await act(async () => {
      fireEvent.click(house('Cena'))
    })
    expect(house('Cena')).toHaveAttribute('aria-pressed', 'false')
    expect(house('Cena')).toHaveAttribute(
      'title',
      'No es del hogar · según Restaurantes'
    )
    expect(repo.row('Cena')).not.toHaveProperty('household', true)
    expect(repo.row('Cena')?.household ?? null).toBeNull()
  })

  it('unmarks a row that follows a household category by hand', async () => {
    seed([tx('Devoto')])

    await act(async () => {
      fireEvent.click(house('Devoto'))
    })

    expect(house('Devoto')).toHaveAttribute('aria-pressed', 'false')
    expect(house('Devoto')).toHaveAttribute(
      'title',
      'No es del hogar · elegido a mano'
    )
    expect(repo.row('Devoto')?.household).toBe(false)
  })

  it('makes an uncategorized expense household on its first click', async () => {
    seed([tx('Misterio', { category: 'uncategorized' })])

    await act(async () => {
      fireEvent.click(house('Misterio'))
    })

    expect(house('Misterio')).toHaveAttribute('aria-pressed', 'true')
    expect(repo.row('Misterio')?.household).toBe(true)
  })

  it('does not celebrate a save, and keeps the house when it fails', async () => {
    seed([tx('Cena', { category: 'restaurants' })])
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    repo.failOn('update', { error: new Error('boom'), times: 1 })

    await act(async () => {
      fireEvent.click(house('Cena'))
    })

    expect(house('Cena')).toHaveAttribute('aria-pressed', 'false')
    expect(repo.row('Cena')?.household ?? null).toBeNull()
    expect(
      await screen.findByRole('button', { name: 'Reintentar' })
    ).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    })
    await waitFor(() => expect(repo.row('Cena')?.household).toBe(true))
    expect(house('Cena')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Cambios guardados')).toBeNull()
    expect(logged).toHaveBeenCalled()
  })

  it('is disabled while its row is saving', async () => {
    seed([tx('Cena', { category: 'restaurants' })])
    const gate = repo.hold('update')

    await act(async () => {
      fireEvent.click(house('Cena'))
    })
    expect(house('Cena')).toBeDisabled()
    expect(house('Cena', 1)).toBeDisabled()
    expect(house('Cena')).toHaveAttribute('aria-pressed', 'false')

    await act(async () => {
      gate.release()
    })
    expect(house('Cena')).toBeEnabled()
    expect(house('Cena')).toHaveAttribute('aria-pressed', 'true')
  })

  it('works the same on the mobile card', async () => {
    seed([tx('Cena', { category: 'restaurants' })])
    expect(house('Cena', 1)).toHaveAttribute('aria-pressed', 'false')

    await act(async () => {
      fireEvent.click(house('Cena', 1))
    })

    expect(house('Cena', 1)).toHaveAttribute('aria-pressed', 'true')
    expect(house('Cena', 0)).toHaveAttribute('aria-pressed', 'true')
    expect(repo.row('Cena')?.household).toBe(true)
  })
})

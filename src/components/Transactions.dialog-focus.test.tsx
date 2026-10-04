import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Transactions } from './Transactions'
import type { Transaction } from '../models'

// #197: closing a dialog returns keyboard focus to the button that opened it,
// instead of dropping it to <body> (and the user back to the top of the page).

function makeTransaction(index: number): Transaction {
  return {
    id: `tx-${index}`,
    date: new Date(Date.UTC(2026, 0, index + 1)),
    description: `comercio ${index}`,
    amount: 100 + index,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
  }
}

const TRANSACTIONS = [makeTransaction(0), makeTransaction(1)]

async function openWithKeyboardAndEscape(opener: HTMLElement) {
  const user = userEvent.setup()
  opener.focus()
  await user.keyboard('{Enter}')
  await screen.findByRole('dialog')
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

describe('Transactions dialogs return focus on close', () => {
  it('returns focus to the row Editar button', async () => {
    render(<Transactions transactions={TRANSACTIONS} />)
    const opener = screen.getAllByRole('button', {
      name: 'Editar comercio 1',
    })[0]

    await openWithKeyboardAndEscape(opener)

    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('returns focus to the row Dividir button', async () => {
    render(
      <Transactions transactions={TRANSACTIONS} onSplitTransaction={vi.fn()} />
    )
    const opener = screen.getAllByRole('button', {
      name: 'Dividir comercio 1',
    })[0]

    await openWithKeyboardAndEscape(opener)

    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('returns focus to Editar seleccionadas', async () => {
    const user = userEvent.setup()
    render(<Transactions transactions={TRANSACTIONS} />)
    await user.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar comercio 0' })[0]
    )
    await user.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar comercio 1' })[0]
    )
    const opener = screen.getByRole('button', { name: 'Editar seleccionadas' })

    await openWithKeyboardAndEscape(opener)

    await waitFor(() => expect(opener).toHaveFocus())
  })
})

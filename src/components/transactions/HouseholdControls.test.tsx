import { beforeEach, vi, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useStore } from 'zustand'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { Transactions } from '../Transactions'
import { PartialWriteError, UserFacingError } from '../../utils/user-error'
import type { Transaction } from '../../models'
import {
  editTransaction,
  setHousehold,
} from '../../services/mutations/transaction-mutations'
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
        onUpdateTransaction={(id, edit) => editTransaction(repo, id, edit)}
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

function select(...descriptions: string[]) {
  for (const description of descriptions) {
    fireEvent.click(
      screen.getAllByRole('checkbox', {
        name: `Seleccionar ${description}`,
      })[0]
    )
  }
}
async function choose(option: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Hogar' }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: option }))
  })
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
      tx('Parte', { splitParentId: 'Madre', category: 'restaurants' }),
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
    // The split parent is on screen (above its part), and the part has one.
    expect(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Madre' })
    ).not.toHaveLength(0)
    expect(house('Parte')).toHaveAttribute('aria-pressed', 'false')
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

describe('household choice in the edit dialog (#251)', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  async function openEdit(description: string) {
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('button', { name: `Editar ${description}` })[0]
      )
    })
  }
  async function save() {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }

  it('saves a hand choice with the rest of the edit', async () => {
    seed([tx('Devoto')])
    await openEdit('Devoto')
    expect(screen.getByLabelText('Según categoría (sí)')).toBeChecked()

    fireEvent.click(screen.getByLabelText('No'))
    await save()

    await waitFor(() => expect(repo.row('Devoto')?.household).toBe(false))
    expect(house('Devoto')).toHaveAttribute(
      'title',
      'No es del hogar · elegido a mano'
    )
  })

  it('goes back to following the category', async () => {
    seed([tx('Cena', { category: 'restaurants', household: true })])
    await openEdit('Cena')
    expect(screen.getByLabelText('Sí')).toBeChecked()

    fireEvent.click(screen.getByLabelText('Según categoría (no)'))
    await save()

    await waitFor(() => expect(repo.row('Cena')?.household ?? null).toBeNull())
    expect(house('Cena')).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not write the household choice when it was not touched', async () => {
    // The saved row has a choice the screen does not know about yet: an
    // untouched Guardar must not overwrite it.
    seed([tx('Devoto')])
    await repo.updateTransactions(new Map([['Devoto', { household: true }]]))
    await openEdit('Devoto')

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Devoto Centro' },
    })
    await save()

    expect(repo.row('Devoto')?.household).toBe(true)
  })

  it('says so when the choice fails to save after the edit did', async () => {
    seed([tx('Devoto')])
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    await openEdit('Devoto')
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Devoto Centro' },
    })
    fireEvent.click(screen.getByLabelText('No'))
    // The edit's own write goes first; the choice's write is the next one.
    let seen = 0
    repo.failOn('update', {
      error: new Error('boom'),
      when: () => ++seen > 1,
    })
    await save()

    expect(
      await screen.findByRole('button', { name: 'Reintentar' })
    ).toBeInTheDocument()
    expect(repo.row('Devoto')?.displayDescription).toBe('Devoto Centro')
    expect(repo.row('Devoto')?.household ?? null).toBeNull()
    expect(logged).toHaveBeenCalled()
  })
})

describe('bulk Hogar menu (#251)', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('marks the selected expenses and says what it skipped', async () => {
    seed([
      tx('Cena', { category: 'restaurants' }),
      tx('Taxi', { category: 'transport' }),
      tx('Cine', { category: 'entertainment' }),
      tx('Sueldo', { type: 'credit', category: 'income' }),
    ])
    select('Cena', 'Taxi', 'Cine', 'Sueldo')

    await choose('Marcar como hogar')

    for (const id of ['Cena', 'Taxi', 'Cine']) {
      expect(repo.row(id)?.household).toBe(true)
    }
    expect(repo.row('Sueldo')?.household ?? null).toBeNull()
    expect(
      await screen.findByText(
        '3 marcadas como hogar, 1 no cuenta como gasto, sin cambios'
      )
    ).toBeInTheDocument()
    // The selection is cleared like after the other bulk actions.
    expect(
      screen.queryByRole('region', { name: 'Acciones de selección' })
    ).toBeNull()
  })

  it('marks as not household', async () => {
    seed([tx('Devoto'), tx('Luz', { category: 'utilities' })])
    select('Devoto', 'Luz')

    await choose('Marcar como no hogar')

    expect(repo.row('Devoto')?.household).toBe(false)
    expect(repo.row('Luz')?.household).toBe(false)
    expect(
      await screen.findByText('2 marcadas como no hogar')
    ).toBeInTheDocument()
  })

  it('sends rows back to following their category', async () => {
    seed([
      tx('Cena', { category: 'restaurants', household: true }),
      tx('Devoto', { household: false }),
    ])
    select('Cena', 'Devoto')

    await choose('Según categoría')

    expect(repo.row('Cena')?.household ?? null).toBeNull()
    expect(repo.row('Devoto')?.household ?? null).toBeNull()
    expect(
      await screen.findByText('2 vuelven a seguir su categoría')
    ).toBeInTheDocument()
  })

  it('counts rows already at the value as done, not skipped', async () => {
    seed([
      tx('Devoto', { household: true }),
      tx('Luz', { category: 'utilities', household: true }),
    ])
    select('Devoto', 'Luz')

    await choose('Marcar como hogar')

    expect(await screen.findByText('2 marcadas como hogar')).toBeInTheDocument()
  })

  it('uses singular forms', async () => {
    seed([
      tx('Cena', { category: 'restaurants' }),
      tx('Sueldo', { type: 'credit', category: 'income' }),
    ])
    select('Cena', 'Sueldo')

    await choose('Según categoría')

    expect(
      await screen.findByText(
        '1 vuelve a seguir su categoría, 1 no cuenta como gasto, sin cambios'
      )
    ).toBeInTheDocument()
  })

  it('has nothing to do when no selected row is an expense', async () => {
    seed([tx('Sueldo', { type: 'credit', category: 'income' })])
    select('Sueldo')

    await choose('Marcar como hogar')

    expect(
      await screen.findByText(
        'Ninguna de las seleccionadas cuenta como gasto, sin cambios'
      )
    ).toBeInTheDocument()
    expect(repo.row('Sueldo')).not.toHaveProperty('household')
  })

  it('reports a partial write and offers to retry the rest', async () => {
    // Which rows fail is the mutation's business (its own suite); here the
    // view must report it like the other bulk actions and keep the selection.
    const retry = vi.fn().mockResolvedValue({ updated: 1 })
    const rows = [
      tx('Cena', { category: 'restaurants' }),
      tx('Taxi', { category: 'transport' }),
    ]
    render(
      <>
        <Transactions
          transactions={rows}
          onSetHousehold={() =>
            Promise.reject(
              new PartialWriteError('Se actualizaron 1 de 2', 1, 2, retry)
            )
          }
        />
        <Toaster />
      </>
    )
    select('Cena', 'Taxi')

    await choose('Marcar como hogar')

    expect(
      await screen.findByText('Se actualizaron 1 de 2 — reintentar')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Acciones de selección' })
    ).toBeVisible()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    })
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('opens and picks by keyboard', async () => {
    const user = userEvent.setup()
    seed([tx('Cena', { category: 'restaurants' })])
    select('Cena')

    screen.getByRole('button', { name: 'Hogar' }).focus()
    await user.keyboard('{Enter}')
    await user.tab()
    expect(
      screen.getByRole('button', { name: 'Marcar como hogar' })
    ).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText('1 marcada como hogar')).toBeInTheDocument()
    expect(repo.row('Cena')?.household).toBe(true)
  })

  it('closes on Escape and gives focus back to its button', async () => {
    const user = userEvent.setup()
    seed([tx('Cena', { category: 'restaurants' })])
    select('Cena')
    const trigger = screen.getByRole('button', { name: 'Hogar' })
    await user.click(trigger)
    expect(
      screen.getByRole('button', { name: 'Marcar como no hogar' })
    ).toBeVisible()

    await user.keyboard('{Escape}')

    expect(
      screen.queryByRole('button', { name: 'Marcar como no hogar' })
    ).toBeNull()
    expect(trigger).toHaveFocus()
  })
})

describe('review round 1 of step 4 (#251)', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  async function openEdit(description: string) {
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('button', { name: `Editar ${description}` })[0]
      )
    })
  }
  async function saveDialog() {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    })
  }

  it('a household-only edit leaves the category as the categorizer left it', async () => {
    seed([tx('Devoto', { categoryConfidence: 0.6 })])
    await openEdit('Devoto')

    fireEvent.click(screen.getByLabelText('No'))
    await saveDialog()

    await waitFor(() => expect(repo.row('Devoto')?.household).toBe(false))
    expect(repo.row('Devoto')?.categoryConfidence).toBe(0.6)
    expect(repo.row('Devoto')?.category).toBe('groceries')
    expect(screen.queryByText('Cambios guardados')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reports one outcome when the edit and the choice both save', async () => {
    seed([tx('Devoto')])
    await openEdit('Devoto')
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Devoto Centro' },
    })
    fireEvent.click(screen.getByLabelText('No'))
    await saveDialog()

    expect(await screen.findAllByText('Cambios guardados')).toHaveLength(1)
    expect(repo.row('Devoto')?.household).toBe(false)
  })

  it('says the edit saved when only the choice failed', async () => {
    seed([tx('Devoto')])
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    await openEdit('Devoto')
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Devoto Centro' },
    })
    fireEvent.click(screen.getByLabelText('No'))
    let seen = 0
    repo.failOn('update', { error: new Error('boom'), when: () => ++seen > 1 })
    await saveDialog()

    expect(
      await screen.findByText(
        'Se guardaron los cambios, pero no el gasto del hogar'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('Cambios guardados')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(
      1
    )
    expect(logged).toHaveBeenCalled()
  })

  it('an old Reintentar does not overwrite a newer choice', async () => {
    seed([tx('Cena', { category: 'restaurants' })])
    vi.spyOn(console, 'error').mockImplementation(() => {})
    repo.failOn('update', { error: new Error('boom'), times: 1 })
    await act(async () => {
      fireEvent.click(house('Cena'))
    })
    const stale = await screen.findByRole('button', { name: 'Reintentar' })
    // The user clicks again and this time it saves: household = true.
    await act(async () => {
      fireEvent.click(house('Cena'))
    })
    expect(repo.row('Cena')?.household).toBe(true)
    // Another click puts it back to following the category.
    await act(async () => {
      fireEvent.click(house('Cena'))
    })
    expect(repo.row('Cena')?.household ?? null).toBeNull()

    await act(async () => {
      fireEvent.click(stale)
    })

    expect(repo.row('Cena')?.household ?? null).toBeNull()
    expect(house('Cena')).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps "Recargar" for an error a retry cannot fix', async () => {
    const onReload = vi.fn()
    render(
      <>
        <Transactions
          transactions={[tx('Cena', { category: 'restaurants' })]}
          onReload={onReload}
          onSetHousehold={() =>
            Promise.reject(new UserFacingError('La transacción ya no existe.'))
          }
        />
        <Toaster />
      </>
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      fireEvent.click(house('Cena'))
    })

    expect(
      await screen.findByRole('button', { name: 'Recargar' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  it('opening the Hogar menu closes the Categorizar one', async () => {
    seed([tx('Cena', { category: 'restaurants' })])
    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Cena' })[0]
    )
    fireEvent.click(screen.getByRole('button', { name: 'Categorizar' }))
    expect(screen.getByRole('button', { name: 'Alimentación' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Hogar' }))

    expect(screen.queryByRole('button', { name: 'Alimentación' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Marcar como hogar' })
    ).toBeVisible()
    // ...and the other way round.
    fireEvent.click(screen.getByRole('button', { name: 'Categorizar' }))
    expect(
      screen.queryByRole('button', { name: 'Marcar como hogar' })
    ).toBeNull()
  })

  it('does not start a second bulk write while one is saving', async () => {
    seed([tx('Cena', { category: 'restaurants' })])
    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Cena' })[0]
    )
    const gate = repo.hold('update')
    await choose('Marcar como hogar')

    expect(screen.getByRole('button', { name: 'Hogar' })).toBeDisabled()

    await act(async () => {
      gate.release()
    })
    expect(repo.row('Cena')?.household).toBe(true)
  })

  it('says a split parent does not count as an expense', async () => {
    seed([
      tx('Cena', { category: 'restaurants' }),
      tx('Madre', { isSplitParent: true }),
      tx('Parte', { splitParentId: 'Madre', category: 'restaurants' }),
    ])
    select('Cena', 'Madre')

    await choose('Marcar como hogar')

    expect(
      await screen.findByText(
        '1 marcada como hogar, 1 no cuenta como gasto, sin cambios'
      )
    ).toBeInTheDocument()
  })

  it('says several skipped rows do not count as expenses', async () => {
    seed([
      tx('Cena', { category: 'restaurants' }),
      tx('Sueldo', { type: 'credit', category: 'income' }),
      tx('Madre', { isSplitParent: true }),
      tx('Parte', { splitParentId: 'Madre', category: 'restaurants' }),
    ])
    select('Cena', 'Sueldo', 'Madre')

    await choose('Marcar como hogar')

    expect(
      await screen.findByText(
        '1 marcada como hogar, 2 no cuentan como gasto, sin cambios'
      )
    ).toBeInTheDocument()
  })

  it('an old Reintentar does not overwrite what a bulk write saved', async () => {
    seed([tx('Cena', { category: 'restaurants' })])
    vi.spyOn(console, 'error').mockImplementation(() => {})
    repo.failOn('update', { error: new Error('boom'), times: 1 })
    await act(async () => {
      fireEvent.click(house('Cena'))
    })
    const stale = await screen.findByRole('button', { name: 'Reintentar' })

    select('Cena')
    await choose('Marcar como no hogar')
    expect(repo.row('Cena')?.household).toBe(false)

    await act(async () => {
      fireEvent.click(stale)
    })

    expect(repo.row('Cena')?.household).toBe(false)
  })

  it('says the edit saved even when the choice fails with an explained error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <>
        <Transactions
          transactions={[tx('Devoto')]}
          onUpdateTransaction={() => Promise.resolve({ affected: 1 })}
          onSetHousehold={() =>
            Promise.reject(new UserFacingError('La transacción ya no existe.'))
          }
        />
        <Toaster />
      </>
    )
    await openEdit('Devoto')
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Devoto Centro' },
    })
    fireEvent.click(screen.getByLabelText('No'))
    await saveDialog()

    expect(
      await screen.findByText(
        /Se guardaron los cambios, pero no el gasto del hogar\..*La transacción ya no existe/
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('Cambios guardados')).toBeNull()
  })

  it('tells a hand-set house from one following its category by more than colour', () => {
    seed([
      tx('Devoto'),
      tx('Cena', { category: 'restaurants' }),
      tx('Luz', { category: 'utilities', household: true }),
      tx('Taxi', { category: 'transport', household: false }),
    ])

    expect(house('Devoto')).toHaveAttribute('data-origin', 'category')
    expect(house('Cena')).toHaveAttribute('data-origin', 'category')
    expect(house('Luz')).toHaveAttribute('data-origin', 'hand')
    expect(house('Taxi')).toHaveAttribute('data-origin', 'hand')
    // The cue is a mark in the button itself, not just a colour.
    expect(house('Luz').querySelector('[data-hand-mark]')).not.toBeNull()
    expect(house('Devoto').querySelector('[data-hand-mark]')).toBeNull()
  })
})

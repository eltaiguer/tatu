import { beforeEach, vi, describe, expect, it } from 'vitest'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useStore } from 'zustand'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { Transactions } from '../Transactions'
import { PartialWriteError, UserFacingError } from '../../utils/user-error'
import type { Transaction } from '../../models'
import {
  applyHouseholdToSimilar,
  editTransaction,
  forgetHouseholdRule,
  setHousehold,
} from '../../services/mutations/transaction-mutations'
import { replaceDescriptionOverrides } from '../../services/descriptions/description-overrides'
import { replaceMerchantCategoryOverrides } from '../../services/categorizer/category-overrides'
import {
  clearHouseholdRules,
  listMerchantHouseholdRules,
  putMerchantHouseholdRule,
} from '../../services/household/household-rules-store'
import { merchantOverrideKey } from '../../services/categorizer/category-overrides'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../../services/repository/in-memory-repository'
import { DEFAULT_URL_FILTERS } from '../../services/filters/url-filters'
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

// Remembering a merchant writes module-level rule stores: start clean.
beforeEach(() => {
  clearHouseholdRules()
  replaceDescriptionOverrides({})
  replaceMerchantCategoryOverrides({})
})

// The view reads the store like App does, so a write shows once it is saved.
function Harness({
  onFiltersChange,
  withRules = true,
}: {
  onFiltersChange?: (search: string) => void
  withRules?: boolean
}) {
  const transactions = useStore(transactionStore, (s) => s.transactions)
  return (
    <>
      <Transactions
        transactions={transactions}
        onFiltersChange={onFiltersChange}
        initialFilters={{ ...DEFAULT_URL_FILTERS, period: { mode: 'all' } }}
        onUpdateTransaction={(id, edit) => editTransaction(repo, id, edit)}
        onSetHousehold={(ids, household) => setHousehold(repo, ids, household)}
        onApplyHouseholdToSimilar={
          withRules
            ? (id, household) => applyHouseholdToSimilar(repo, id, household)
            : undefined
        }
        onForgetHouseholdRule={
          withRules
            ? (id, shown) => forgetHouseholdRule(repo, id, shown)
            : undefined
        }
      />
      <Toaster />
    </>
  )
}

function seed(
  rows: Transaction[],
  onFiltersChange?: (s: string) => void,
  withRules = true
) {
  repo = createInMemoryRepository({ transactions: rows })
  transactionStore.getState().setTransactions(rows)
  workspaceStore.setState({ userId: repo.userId, status: 'ready' })
  render(<Harness onFiltersChange={onFiltersChange} withRules={withRules} />)
}

// Both the desktop row and the mobile card render; [0] is the row.
function house(description: string, which = 0) {
  return screen.getAllByRole('button', {
    name: (name) => name.startsWith(`${description}: `),
  })[which]
}
// The house's name says its value (#265):
// "{description}: Hogar · …" or "{description}: No es del hogar · …".
const HOGAR = /: Hogar · /
const NO_ES_DEL_HOGAR = /: No es del hogar · /
const isHogar = (el: HTMLElement) =>
  HOGAR.test(el.getAttribute('aria-label') ?? '')

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

    expect(house('Devoto')).toHaveAccessibleName(HOGAR)
    expect(house('Devoto')).toHaveAttribute(
      'title',
      'Hogar · según Alimentación'
    )
    expect(house('Cena')).toHaveAccessibleName(NO_ES_DEL_HOGAR)
    expect(house('Cena')).toHaveAttribute(
      'title',
      'No es del hogar · según Restaurantes'
    )
    expect(house('Misterio')).toHaveAccessibleName(NO_ES_DEL_HOGAR)
    expect(house('Misterio')).toHaveAttribute(
      'title',
      'No es del hogar · según Sin categoría'
    )
    for (const none of ['Sueldo', 'Pago tarjeta', 'Madre']) {
      expect(
        screen.queryByRole('button', {
          name: (name) => name.startsWith(`${none}: `),
        })
      ).toBeNull()
    }
    // The split parent is on screen (above its part), and the part has one.
    expect(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Madre' })
    ).not.toHaveLength(0)
    expect(house('Parte')).toHaveAccessibleName(NO_ES_DEL_HOGAR)
  })

  it('marks a row by hand, then goes back to the category on the next click', async () => {
    seed([tx('Cena', { category: 'restaurants' })])

    await act(async () => {
      fireEvent.click(house('Cena'))
    })
    expect(house('Cena')).toHaveAccessibleName(HOGAR)
    expect(house('Cena')).toHaveAttribute('title', 'Hogar · elegido a mano')
    expect(repo.row('Cena')?.household).toBe(true)

    await act(async () => {
      fireEvent.click(house('Cena'))
    })
    expect(house('Cena')).toHaveAccessibleName(NO_ES_DEL_HOGAR)
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

    expect(house('Devoto')).toHaveAccessibleName(NO_ES_DEL_HOGAR)
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

    expect(house('Misterio')).toHaveAccessibleName(HOGAR)
    expect(repo.row('Misterio')?.household).toBe(true)
  })

  it("clicking an uncategorized row's house again makes it follow its category", async () => {
    seed([tx('Misterio', { category: 'uncategorized' })])

    await act(async () => {
      fireEvent.click(house('Misterio'))
    })
    expect(repo.row('Misterio')?.household).toBe(true)
    await act(async () => {
      fireEvent.click(house('Misterio'))
    })

    expect(house('Misterio')).toHaveAccessibleName(NO_ES_DEL_HOGAR)
    expect(repo.row('Misterio')?.household ?? null).toBeNull()
  })

  it('does not celebrate a save, and keeps the house when it fails', async () => {
    seed([tx('Cena', { category: 'restaurants' })])
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    repo.failOn('update', { error: new Error('boom'), times: 1 })

    await act(async () => {
      fireEvent.click(house('Cena'))
    })

    expect(house('Cena')).toHaveAccessibleName(NO_ES_DEL_HOGAR)
    expect(repo.row('Cena')?.household ?? null).toBeNull()
    expect(
      await screen.findByRole('button', { name: 'Reintentar' })
    ).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    })
    await waitFor(() => expect(repo.row('Cena')?.household).toBe(true))
    expect(house('Cena')).toHaveAccessibleName(HOGAR)
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
    expect(house('Cena')).toHaveAccessibleName(NO_ES_DEL_HOGAR)

    await act(async () => {
      gate.release()
    })
    expect(house('Cena')).toBeEnabled()
    expect(house('Cena')).toHaveAccessibleName(HOGAR)
  })

  it('works the same on the mobile card', async () => {
    seed([tx('Cena', { category: 'restaurants' })])
    expect(house('Cena', 1)).toHaveAccessibleName(NO_ES_DEL_HOGAR)

    await act(async () => {
      fireEvent.click(house('Cena', 1))
    })

    expect(house('Cena', 1)).toHaveAccessibleName(HOGAR)
    expect(house('Cena', 0)).toHaveAccessibleName(HOGAR)
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
    expect(screen.getByLabelText('Según categoría (Sí)')).toBeChecked()

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

    fireEvent.click(screen.getByLabelText('Según categoría (No)'))
    await save()

    await waitFor(() => expect(repo.row('Cena')?.household ?? null).toBeNull())
    expect(house('Cena')).toHaveAccessibleName(NO_ES_DEL_HOGAR)
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

  it('offers "Hogar: Sí", "Hogar: No" and "Según categoría" (#265)', () => {
    seed([tx('Cena', { category: 'restaurants' })])
    select('Cena')

    fireEvent.click(screen.getByRole('button', { name: 'Hogar' }))

    const options = screen
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) =>
        ['Hogar: Sí', 'Hogar: No', 'Según categoría'].includes(t ?? '')
      )
    expect(options).toEqual(['Hogar: Sí', 'Hogar: No', 'Según categoría'])
  })

  it('marks the selected expenses and says what it skipped', async () => {
    seed([
      tx('Cena', { category: 'restaurants' }),
      tx('Taxi', { category: 'transport' }),
      tx('Cine', { category: 'entertainment' }),
      tx('Sueldo', { type: 'credit', category: 'income' }),
    ])
    select('Cena', 'Taxi', 'Cine', 'Sueldo')

    await choose('Hogar: Sí')

    for (const id of ['Cena', 'Taxi', 'Cine']) {
      expect(repo.row(id)?.household).toBe(true)
    }
    expect(repo.row('Sueldo')?.household ?? null).toBeNull()
    expect(
      await screen.findByText(
        'Hogar: Sí en 3 transacciones, 1 no cuenta como gasto, sin cambios'
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

    await choose('Hogar: No')

    expect(repo.row('Devoto')?.household).toBe(false)
    expect(repo.row('Luz')?.household).toBe(false)
    expect(
      await screen.findByText('Hogar: No en 2 transacciones')
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
      await screen.findByText('Elección quitada en 2 transacciones')
    ).toBeInTheDocument()
  })

  it('says the choice was removed, true for rows a merchant rule covers too', async () => {
    putMerchantHouseholdRule(
      merchantOverrideKey('COMPRA DEVOTO 4521') as string,
      true,
      'COMPRA DEVOTO 4521'
    )
    seed([
      tx('COMPRA DEVOTO 4521', { category: 'restaurants', household: false }),
    ])
    select('COMPRA DEVOTO 4521')

    await choose('Según categoría')

    expect(
      await screen.findByText('Elección quitada en 1 transacción')
    ).toBeInTheDocument()
    expect(screen.queryByText(/vuelve/)).toBeNull()
  })

  it('counts rows already at the value as done, not skipped', async () => {
    seed([
      tx('Devoto', { household: true }),
      tx('Luz', { category: 'utilities', household: true }),
    ])
    select('Devoto', 'Luz')

    await choose('Hogar: Sí')

    expect(
      await screen.findByText('Hogar: Sí en 2 transacciones')
    ).toBeInTheDocument()
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
        'Elección quitada en 1 transacción, 1 no cuenta como gasto, sin cambios'
      )
    ).toBeInTheDocument()
  })

  it('has nothing to do when no selected row is an expense', async () => {
    seed([tx('Sueldo', { type: 'credit', category: 'income' })])
    select('Sueldo')

    await choose('Hogar: Sí')

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

    await choose('Hogar: Sí')

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
    expect(screen.getByRole('button', { name: 'Hogar: Sí' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(
      await screen.findByText('Hogar: Sí en 1 transacción')
    ).toBeInTheDocument()
    expect(repo.row('Cena')?.household).toBe(true)
  })

  it('closes on Escape and gives focus back to its button', async () => {
    const user = userEvent.setup()
    seed([tx('Cena', { category: 'restaurants' })])
    select('Cena')
    const trigger = screen.getByRole('button', { name: 'Hogar' })
    await user.click(trigger)
    expect(screen.getByRole('button', { name: 'Hogar: No' })).toBeVisible()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: 'Hogar: No' })).toBeNull()
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
      await screen.findByText('Se guardaron los cambios, pero no el de Hogar')
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
    expect(house('Cena')).toHaveAccessibleName(NO_ES_DEL_HOGAR)
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
    expect(screen.getByRole('button', { name: 'Hogar: Sí' })).toBeVisible()
    // ...and the other way round.
    fireEvent.click(screen.getByRole('button', { name: 'Categorizar' }))
    expect(screen.queryByRole('button', { name: 'Hogar: Sí' })).toBeNull()
  })

  it('does not start a second bulk write while one is saving', async () => {
    seed([tx('Cena', { category: 'restaurants' })])
    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Cena' })[0]
    )
    const gate = repo.hold('update')
    await choose('Hogar: Sí')

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

    await choose('Hogar: Sí')

    expect(
      await screen.findByText(
        'Hogar: Sí en 1 transacción, 1 no cuenta como gasto, sin cambios'
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

    await choose('Hogar: Sí')

    expect(
      await screen.findByText(
        'Hogar: Sí en 1 transacción, 2 no cuentan como gasto, sin cambios'
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
    await choose('Hogar: No')
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
        /Se guardaron los cambios, pero no el de Hogar\..*La transacción ya no existe/
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('Cambios guardados')).toBeNull()
  })
})

describe('the house shows Hogar or No (#265)', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('fills the house in the brand colour for Hogar and outlines it in the muted colour for No, whatever the source', () => {
    putMerchantHouseholdRule(
      merchantOverrideKey('COMPRA DEVOTO 4521') as string,
      true,
      'COMPRA DEVOTO 4521'
    )
    putMerchantHouseholdRule(
      merchantOverrideKey('CINE 99') as string,
      false,
      'CINE 99'
    )
    seed([
      tx('COMPRA DEVOTO 4521', { category: 'restaurants' }),
      tx('CINE 99'),
      tx('Devoto'),
      tx('Cena', { category: 'restaurants' }),
      tx('Luz', { category: 'utilities', household: true }),
      tx('Taxi', { category: 'transport', household: false }),
    ])

    const fill = (d: string) =>
      house(d).querySelector('svg')?.getAttribute('fill')
    expect(fill('Devoto')).toBe('currentColor')
    expect(fill('Luz')).toBe('currentColor')
    expect(fill('Cena')).toBe('none')
    expect(fill('Taxi')).toBe('none')
    // Colour encodes the value only, never the source.
    const look = (d: string) => [
      house(d).className,
      house(d).querySelector('svg')?.getAttribute('fill'),
    ]
    // Category, hand and merchant rule: the same look for the same value.
    expect(look('Devoto')).toEqual(look('Luz'))
    expect(look('Devoto')).toEqual(look('COMPRA DEVOTO 4521'))
    expect(look('Cena')).toEqual(look('Taxi'))
    expect(look('Cena')).toEqual(look('CINE 99'))
    expect(house('Devoto').className).toContain('--brand-text')
    expect(house('Cena').className).toContain('--text-muted')
    expect(document.querySelector('[data-hand-mark]')).toBeNull()
    expect(document.querySelector('[data-origin]')).toBeNull()
  })

  it('names the house after the row, its value and where it comes from', () => {
    putMerchantHouseholdRule(
      merchantOverrideKey('COMPRA DEVOTO 4521') as string,
      true,
      'COMPRA DEVOTO 4521'
    )
    seed([
      tx('Devoto'),
      tx('Cena', { category: 'restaurants' }),
      tx('Luz', { category: 'utilities', household: true }),
      tx('Taxi', { category: 'transport', household: false }),
      tx('Misterio', { category: 'uncategorized' }),
      tx('Madre', { isSplitParent: true }),
      tx('Parte', { splitParentId: 'Madre', category: 'restaurants' }),
      tx('COMPRA DEVOTO 4521', { category: 'restaurants' }),
    ])

    const names = (d: string) => house(d).getAttribute('aria-label')
    expect(names('Devoto')).toBe('Devoto: Hogar · según Alimentación')
    expect(names('Cena')).toBe('Cena: No es del hogar · según Restaurantes')
    expect(names('Luz')).toBe('Luz: Hogar · elegido a mano')
    expect(names('Taxi')).toBe('Taxi: No es del hogar · elegido a mano')
    expect(names('Misterio')).toBe(
      'Misterio: No es del hogar · según Sin categoría'
    )
    expect(names('Parte')).toBe('Parte: No es del hogar · según Restaurantes')
    expect(names('COMPRA DEVOTO 4521')).toBe(
      'COMPRA DEVOTO 4521: Hogar · según comercio'
    )
    expect(house('Cena')).toHaveAttribute(
      'title',
      'No es del hogar · según Restaurantes'
    )
  })

  it('the house is a toggle button: pressed for Hogar, with a name that holds value and source', async () => {
    seed([tx('Cena', { category: 'restaurants' }), tx('Devoto')])

    expect(house('Cena')).toHaveAttribute('aria-pressed', 'false')
    expect(house('Devoto')).toHaveAttribute('aria-pressed', 'true')
    expect(house('Cena')).toHaveAccessibleName(
      'Cena: No es del hogar · según Restaurantes'
    )
    await act(async () => {
      fireEvent.click(house('Cena'))
    })
    await waitFor(() =>
      expect(house('Cena')).toHaveAccessibleName('Cena: Hogar · elegido a mano')
    )
    expect(house('Cena')).toHaveAttribute('aria-pressed', 'true')
  })

  const rows = () => [
    tx('Devoto'),
    tx('Cena', { category: 'restaurants' }),
    tx('Sueldo', { type: 'credit', category: 'income' }),
    tx('Misterio', { category: 'uncategorized' }),
  ]
  const pick = (option: string) =>
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Hogar' })).getByRole(
        'radio',
        { name: option }
      )
    )
  const listed = (description: string) =>
    screen.queryAllByText(description, { selector: 'td *, td' }).length > 0

  it('Hogar shows only household expenses and writes ?hogar=si', () => {
    const urls: string[] = []
    seed(rows(), (search) => urls.push(search))
    pick('Hogar')

    expect(listed('Devoto')).toBe(true)
    expect(listed('Cena')).toBe(false)
    expect(listed('Sueldo')).toBe(false)
    expect(listed('Misterio')).toBe(false)
    expect(urls[urls.length - 1]).toBe('hogar=si&periodo=todo')
  })

  it('the filter offers Todo · Hogar only', () => {
    seed(rows())
    const group = screen.getByRole('radiogroup', { name: 'Hogar' })
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.getAttribute('aria-label') ?? r.textContent)
    ).toEqual(['Todo', 'Hogar'])
  })

  it('picking Hogar while Ingresos is chosen goes back to Ambos', () => {
    seed(rows())
    fireEvent.click(
      within(
        screen.getByRole('radiogroup', { name: 'Tipo de transacción' })
      ).getByRole('radio', { name: 'Ingresos' })
    )
    expect(listed('Sueldo')).toBe(true)
    pick('Hogar')

    expect(
      within(
        screen.getByRole('radiogroup', { name: 'Tipo de transacción' })
      ).getByRole('radio', { name: 'Ambos' })
    ).toBeChecked()
    expect(listed('Devoto')).toBe(true)
  })

  it('picking Ingresos while Hogar is on goes back to Todo in Hogar', () => {
    seed(rows())
    pick('Hogar')
    fireEvent.click(
      within(
        screen.getByRole('radiogroup', { name: 'Tipo de transacción' })
      ).getByRole('radio', { name: 'Ingresos' })
    )

    expect(
      within(screen.getByRole('radiogroup', { name: 'Hogar' })).getByRole(
        'radio',
        { name: 'Todo' }
      )
    ).toBeChecked()
    expect(listed('Sueldo')).toBe(true)
  })

  it('Limpiar todo brings Hogar back to Todo', () => {
    seed(rows())
    pick('Hogar')
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }))

    expect(
      within(screen.getByRole('radiogroup', { name: 'Hogar' })).getByRole(
        'radio',
        { name: 'Todo' }
      )
    ).toBeChecked()
    expect(listed('Cena')).toBe(true)
  })

  it("flipping a row's house off removes it from the list", async () => {
    seed(rows())
    pick('Hogar')
    expect(listed('Devoto')).toBe(true)

    await act(async () => {
      fireEvent.click(house('Devoto'))
    })
    await waitFor(() => expect(listed('Devoto')).toBe(false))
  })
})

describe('household rule from the edit dialog (#251, #263)', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  // Three look-alikes (the date is per-transaction noise) and one stranger.
  const D1 = 'DEVOTO 11/03/2026'
  const D2 = 'DEVOTO 12/03/2026'
  const D3 = 'DEVOTO 13/03/2026'
  const devotos = () => [
    tx(D1, { category: 'restaurants' }),
    tx(D2, { category: 'restaurants' }),
    tx(D3, { category: 'restaurants' }),
    tx('Tienda Inglesa', { category: 'restaurants' }),
  ]

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
  // The dialog's "Recordar para todas las de …" box.
  const REMEMBER = /^Recordar para todas las de/
  const remember = () =>
    fireEvent.click(screen.getByRole('checkbox', { name: REMEMBER }))
  const rememberBox = () => screen.queryByRole('checkbox', { name: REMEMBER })
  const categoryScope = (name: RegExp | string) =>
    fireEvent.click(
      within(
        screen.getByRole('group', { name: 'Aplicar nombre y categoría a' })
      ).getByLabelText(name)
    )
  async function pickCategory(label: RegExp) {
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Categoría dropdown' })
      )
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: label }))
    })
  }
  const on = (d: string) => isHogar(house(d))
  // The merchant remembered as Sí through the dialog, as the user does it.
  async function rememberAsYes(from = D1) {
    await openEdit(from)
    remember()
    fireEvent.click(screen.getByLabelText('Sí'))
    await save()
    await waitFor(() => expect(repo.householdRules.size).toBe(1))
  }

  it('Recordar + Sí turns every look-alike household and says how many', async () => {
    seed(devotos())
    await openEdit(D1)

    remember()
    fireEvent.click(screen.getByLabelText('Sí'))
    await save()

    await waitFor(() => expect(on(D2)).toBe(true))
    expect(on(D1) && on(D2) && on(D3)).toBe(true)
    expect(on('Tienda Inglesa')).toBe(false)
    expect(repo.householdRules.size).toBe(1)
    expect(await screen.findByText('Se aplicó a 3 transacciones')).toBeVisible()
  })

  it('a covered row opens checked on the rule; switching to No turns the whole merchant off', async () => {
    seed(devotos())
    await rememberAsYes()
    await waitFor(() => expect(on(D3)).toBe(true))

    await openEdit(D2)
    expect(rememberBox()).toBeChecked()
    expect(screen.getByLabelText('Sí')).toBeChecked()
    expect(screen.queryByLabelText(/^Según/)).toBeNull()
    fireEvent.click(screen.getByLabelText('No'))
    await save()

    await waitFor(() => expect(on(D3)).toBe(false))
    expect(on(D1) || on(D2)).toBe(false)
    expect(repo.householdRules.size).toBe(1)
  })

  it('unchecking deletes the rule: the others go back to their category, this row keeps what it showed', async () => {
    seed(devotos())
    await rememberAsYes()
    await waitFor(() => expect(on(D3)).toBe(true))

    await openEdit(D1)
    remember()
    await save()

    await waitFor(() => expect(repo.householdRules.size).toBe(0))
    expect(on(D1)).toBe(true)
    expect(repo.row(D1)?.household).toBe(true)
    expect(on(D2) || on(D3)).toBe(false)
  })

  it('unchecking on a row whose category gives the same value leaves it following its category', async () => {
    seed([tx(D1), tx(D2), tx(D3)])
    await rememberAsYes()

    await openEdit(D1)
    remember()
    await save()

    await waitFor(() => expect(repo.householdRules.size).toBe(0))
    expect(repo.row(D1)?.household ?? null).toBeNull()
    expect(on(D1)).toBe(true)
  })

  it('unchecking compares with the category picked in the same save', async () => {
    seed(devotos())
    await rememberAsYes()

    await openEdit(D1)
    remember()
    await pickCategory(/Alimentación/)
    categoryScope('Solo esta transacción')
    await save()

    await waitFor(() => expect(repo.householdRules.size).toBe(0))
    expect(repo.row(D1)?.category).toBe('groceries')
    expect(repo.row(D1)?.household ?? null).toBeNull()
    expect(on(D1)).toBe(true)
  })

  it("unchecking keeps other rows' own choices", async () => {
    seed(devotos())
    await rememberAsYes()
    await waitFor(() => expect(on(D2)).toBe(true))
    await act(async () => {
      fireEvent.click(house(D2))
    })
    await waitFor(() => expect(on(D2)).toBe(false))

    await openEdit(D1)
    remember()
    await save()

    await waitFor(() => expect(repo.householdRules.size).toBe(0))
    expect(repo.row(D2)?.household).toBe(false)
    expect(on(D2)).toBe(false)
  })

  it('a house-click exception opens unchecked on its own choice with "Según comercio"', async () => {
    seed(devotos())
    await rememberAsYes()
    await waitFor(() => expect(on(D2)).toBe(true))
    await act(async () => {
      fireEvent.click(house(D2))
    })
    await waitFor(() => expect(on(D2)).toBe(false))

    await openEdit(D2)

    expect(rememberBox()).not.toBeChecked()
    expect(screen.getByLabelText('No')).toBeChecked()
    expect(screen.getByLabelText('Según comercio (Sí)')).toBeInTheDocument()
    await save()
    expect(repo.householdRules.size).toBe(1)
  })

  it('a failed rule delete after the row saved says so and offers Reintentar; the retry removes the rule', async () => {
    seed(devotos())
    await rememberAsYes()
    await waitFor(() => expect(on(D3)).toBe(true))
    repo.failOn('deleteHouseholdRule', { error: new Error('boom'), times: 1 })

    await openEdit(D1)
    remember()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    })

    expect(
      await screen.findByText(/pero no se pudo quitar la regla — reintentar/)
    ).toBeVisible()
    // The row saved and the rule stayed: the dialog closes, one retry route.
    expect(repo.householdRules.size).toBe(1)
    expect(repo.row(D1)?.household).toBe(true)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    })
    await waitFor(() => expect(repo.householdRules.size).toBe(0))
    expect(repo.row(D1)?.household).toBe(true)
  })

  it('rename + uncheck with a failed delete: the edit saved, the dialog closes, and the message says what stayed, with Reintentar', async () => {
    seed(devotos())
    await rememberAsYes()
    await waitFor(() => expect(on(D3)).toBe(true))
    repo.failOn('deleteHouseholdRule', { error: new Error('boom'), times: 1 })

    await openEdit(D1)
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Devoto centro' },
    })
    remember()
    await save()

    expect(
      await screen.findByText(
        'Se guardaron los cambios. Se guardó Hogar en esta transacción, pero no se pudo quitar la regla — reintentar'
      )
    ).toBeVisible()
    expect(repo.householdRules.size).toBe(1)
    expect(on('Devoto centro')).toBe(true)
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    })
    await waitFor(() => expect(repo.householdRules.size).toBe(0))
  })

  it('unchecking says the rule is gone and how many rows go back, and Deshacer puts it back', async () => {
    seed(devotos())
    await rememberAsYes()
    await waitFor(() => expect(on(D3)).toBe(true))

    await openEdit(D1)
    remember()
    await save()

    expect(await screen.findByText(`Ya no se recuerda ${D1}`)).toBeVisible()
    expect(
      screen.getByText('2 transacciones vuelven a su categoría')
    ).toBeVisible()
    await waitFor(() => expect(repo.householdRules.size).toBe(0))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    })

    await waitFor(() => expect(repo.householdRules.size).toBe(1))
    expect(on(D2) && on(D3)).toBe(true)
    // The row keeps the choice the forget wrote.
    expect(repo.row(D1)?.household).toBe(true)
  })

  it('Deshacer does not overwrite a rule saved for the merchant meanwhile', async () => {
    seed(devotos())
    await rememberAsYes()
    await waitFor(() => expect(on(D3)).toBe(true))

    await openEdit(D1)
    remember()
    await save()
    const undo = await screen.findByRole('button', { name: 'Deshacer' })
    await waitFor(() => expect(repo.householdRules.size).toBe(0))
    // A newer rule for the same merchant lands before the click.
    act(() =>
      putMerchantHouseholdRule(merchantOverrideKey(D1) as string, false)
    )
    await act(async () => {
      fireEvent.click(undo)
    })

    expect(
      await screen.findByText(`Ya hay otra regla para ${D1}; no se restauró.`)
    ).toBeVisible()
    expect(listMerchantHouseholdRules().get(merchantOverrideKey(D1)!)).toBe(
      false
    )
  })

  it('unchecking together with an edit makes one toast', async () => {
    seed(devotos())
    await rememberAsYes()
    await waitFor(() => expect(on(D3)).toBe(true))

    await openEdit(D1)
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Devoto centro' },
    })
    remember()
    await save()

    expect(
      await screen.findByText(`Cambios guardados · ya no se recuerda ${D1}`)
    ).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Deshacer' })).toHaveLength(1)
  })

  it('re-clicking the value shown on a covered row writes nothing: the exceptions keep their No', async () => {
    seed(devotos())
    await rememberAsYes()
    await waitFor(() => expect(on(D2)).toBe(true))
    await act(async () => {
      fireEvent.click(house(D3))
    })
    await waitFor(() => expect(on(D3)).toBe(false))
    expect(repo.row(D3)?.household).toBe(false)

    await openEdit(D1)
    fireEvent.click(screen.getByLabelText('Sí'))
    await save()

    expect(repo.row(D3)?.household).toBe(false)
    expect(on(D3)).toBe(false)
    expect(
      repo.householdRules.get(repo.householdRules.keys().next().value!)
        ?.isHousehold
    ).toBe(true)
  })

  it('a category change with the box untouched makes no rule', async () => {
    seed(devotos())
    await openEdit(D1)

    categoryScope(/^Todas las similares/)
    await pickCategory(/Alimentación/)
    await save()

    await waitFor(() => expect(repo.row(D2)?.category).toBe('groceries'))
    expect(repo.householdRules.size).toBe(0)
  })

  it('a household-only save leaves categories and confidence alone', async () => {
    seed(devotos().map((t) => ({ ...t, categoryConfidence: 0.6 })))
    await openEdit(D1)

    remember()
    fireEvent.click(screen.getByLabelText('Sí'))
    await save()

    await waitFor(() => expect(repo.householdRules.size).toBe(1))
    for (const d of [D1, D2, D3]) {
      expect(repo.row(d)?.category).toBe('restaurants')
      expect(repo.row(d)?.categoryConfidence).toBe(0.6)
    }
    expect(repo.categoryOverrides.size).toBe(0)
  })

  it('checking the box offers the reach as a hint and no "Aplicar “gasto del hogar” a" group', async () => {
    seed(devotos())
    await openEdit(D1)

    expect(
      screen.getByText('Se aplica a 3 transacciones y a las que importes')
    ).toBeVisible()
    expect(
      screen.queryByRole('group', { name: 'Aplicar “gasto del hogar” a' })
    ).toBeNull()
    remember()
    expect(screen.getByLabelText('No')).toBeChecked()
  })

  it('without the rule handlers, the Hogar choice is the row’s only and a category rule leaves it alone', async () => {
    seed(
      devotos().map((t) => (t.id === D1 ? { ...t, household: true } : t)),
      undefined,
      false
    )
    await openEdit(D1)

    expect(rememberBox()).toBeNull()
    expect(screen.getByRole('group', { name: /^Hogar/ })).toHaveAccessibleName(
      /solo esta transacción/
    )
    categoryScope(/^Todas las similares/)
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Devoto centro' },
    })
    await save()

    expect(repo.row(D1)?.household).toBe(true)
    expect(repo.householdRules.size).toBe(0)
  })

  it('a rename for this row only with a Hogar rule for all: the rule spreads, the name and category stay put', async () => {
    seed(devotos().map((t) => ({ ...t, categoryConfidence: 0.6 })))
    await openEdit(D1)

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Devoto centro' },
    })
    remember()
    fireEvent.click(screen.getByLabelText('Sí'))
    await save()

    await waitFor(() => expect(on(D3)).toBe(true))
    // D1 now shows its new name; D2 and D3 keep theirs.
    expect(on('Devoto centro') && on(D2)).toBe(true)
    expect(repo.householdRules.size).toBe(1)
    expect(repo.categoryOverrides.size).toBe(0)
    expect(repo.row(D2)?.category).toBe('restaurants')
    expect(repo.row(D2)?.categoryConfidence).toBe(0.6)
    expect(
      await screen.findByText('Cambios guardados · Hogar: Sí en 3')
    ).toBeVisible()
  })

  it('a category for all with a Hogar choice for this row only: the category spreads, the choice does not', async () => {
    seed(devotos())
    await openEdit(D1)

    categoryScope(/^Todas las similares/)
    await pickCategory(/Alimentación/)
    fireEvent.click(screen.getByLabelText('Sí'))
    await save()

    await waitFor(() => expect(repo.row(D2)?.category).toBe('groceries'))
    expect(repo.row(D1)?.household).toBe(true)
    expect(repo.row(D2)?.household ?? null).toBeNull()
    expect(repo.householdRules.size).toBe(0)
  })

  it('a category for all + remember in one save says how many each reached', async () => {
    seed(devotos())
    await openEdit(D1)

    categoryScope(/^Todas las similares/)
    await pickCategory(/Alimentación/)
    remember()
    fireEvent.click(screen.getByLabelText('Sí'))
    await save()

    await waitFor(() => expect(repo.householdRules.size).toBe(1))
    expect(repo.row(D2)?.category).toBe('groceries')
    expect(
      await screen.findByText(
        'Cambios aplicados a 3 transacciones · Hogar: Sí en 3'
      )
    ).toBeVisible()
  })

  it('category Solo esta + remember in one save: the category stays on this row, the rule spreads', async () => {
    seed(devotos())
    await openEdit(D1)

    await pickCategory(/Alimentación/)
    categoryScope('Solo esta transacción')
    remember()
    fireEvent.click(screen.getByLabelText('Sí'))
    await save()

    await waitFor(() => expect(repo.householdRules.size).toBe(1))
    expect(repo.row(D1)?.category).toBe('groceries')
    expect(repo.row(D2)?.category).toBe('restaurants')
    await waitFor(() => expect(on(D2)).toBe(true))
  })

  it('the category scope still saves its rule when only the Hogar choice changed', async () => {
    seed(devotos())
    await openEdit(D1)

    categoryScope(/^Todas las similares/)
    fireEvent.click(screen.getByLabelText('Sí'))
    await save()

    await waitFor(() => expect(repo.row(D1)?.household).toBe(true))
    expect(repo.categoryOverrides.size).toBe(1)
    expect(repo.householdRules.size).toBe(0)
  })
})

describe('applying a house click to similar rows (#251, step 7)', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  const D1 = 'DEVOTO 11/03/2026'
  const D2 = 'DEVOTO 12/03/2026'
  const D3 = 'DEVOTO 13/03/2026'
  const devotos = () =>
    [D1, D2, D3].map((d) => tx(d, { category: 'restaurants' }))
  const on = (d: string) => isHogar(house(d))
  const offer = (n: number) =>
    screen.queryByRole('button', { name: `Aplicar a las ${n} similares` })

  async function click(description: string) {
    await act(async () => {
      fireEvent.click(house(description))
    })
  }

  it('a click that can reach similar rows says "Hogar: Sí en esta transacción" (#265)', async () => {
    seed(devotos())

    await click(D1)

    expect(
      await screen.findByText('Hogar: Sí en esta transacción')
    ).toBeVisible()
  })

  it('and "Hogar: No en esta transacción" when the click turns it off', async () => {
    seed(devotos().map((t) => ({ ...t, category: 'groceries' })))

    await click(D1)

    expect(
      await screen.findByText('Hogar: No en esta transacción')
    ).toBeVisible()
  })

  it('offers to apply the click to the look-alikes, and the action makes them household by rule', async () => {
    seed(devotos())

    await click(D1)

    expect(on(D1)).toBe(true)
    expect(on(D2)).toBe(false)
    const action = await screen.findByRole(
      'button',
      { name: 'Aplicar a las 2 similares' },
      { timeout: 5000 }
    )
    await act(async () => {
      fireEvent.click(action)
    })

    await waitFor(() => expect(on(D2)).toBe(true), { timeout: 5000 })
    expect(on(D3)).toBe(true)
    expect(house(D2)).toHaveAttribute('title', 'Hogar · según comercio')
    expect(repo.householdRules.size).toBe(1)
    expect(
      await screen.findByText(
        'Se aplicó a 2 transacciones',
        {},
        { timeout: 5000 }
      )
    ).toBeVisible()
  })

  it('offers nothing when the click only returns to following an existing rule', async () => {
    seed(devotos())
    await act(async () => {
      await applyHouseholdToSimilar(repo, D1, true)
      await setHousehold(repo, [D1], false)
    })
    expect(on(D1)).toBe(false)

    await click(D1)

    expect(on(D1)).toBe(true)
    expect(offer(2)).toBeNull()
    expect(screen.queryByRole('button', { name: /Aplicar a las/ })).toBeNull()
  })

  it('offers nothing when no other row would change', async () => {
    seed([tx(D1, { category: 'restaurants' }), tx('Tienda Inglesa')])

    await click(D1)

    expect(on(D1)).toBe(true)
    expect(screen.queryByRole('button', { name: /Aplicar a las/ })).toBeNull()
  })

  it('offers nothing on a split part', async () => {
    seed([
      ...devotos(),
      tx('DEVOTO 15/03/2026', {
        category: 'restaurants',
        splitParentId: 'madre',
      }),
    ])

    await click('DEVOTO 15/03/2026')

    expect(screen.queryByRole('button', { name: /Aplicar a las/ })).toBeNull()
  })

  it('a rule saved without patching any row still moves the other rows’ houses', async () => {
    // d1 has its own "no" on a household category; d2 is the same merchant
    // under a category that is not household. Clicking d1 returns it to
    // following its category, and applying that as a rule patches no row.
    seed([
      tx('SUPERMERCADO 11/03/2026', { household: false }),
      tx('SUPERMERCADO 12/03/2026', { category: 'shopping' }),
    ])
    const D1S = 'SUPERMERCADO 11/03/2026'
    const D2S = 'SUPERMERCADO 12/03/2026'
    expect(on(D2S)).toBe(false)

    await click(D1S)
    const action = await screen.findByRole(
      'button',
      { name: 'Aplicar a la otra similar' },
      { timeout: 5000 }
    )
    await act(async () => {
      fireEvent.click(action)
    })

    await waitFor(() => expect(repo.householdRules.size).toBe(1), {
      timeout: 5000,
    })
    expect(on(D2S)).toBe(true)
  })

  it('an old toast action does not apply a click that was since changed', async () => {
    seed(devotos())
    await click(D1)
    const stale = await screen.findByRole(
      'button',
      { name: 'Aplicar a las 2 similares' },
      { timeout: 5000 }
    )

    // The user changes their mind before the toast goes away.
    await click(D1)
    expect(on(D1)).toBe(false)
    await act(async () => {
      fireEvent.click(stale)
    })

    expect(repo.householdRules.size).toBe(0)
    expect(on(D1)).toBe(false)
  })

  it('an offer does not apply once the row was changed by a bulk write', async () => {
    seed(devotos())
    await click(D1)
    const stale = await screen.findByRole(
      'button',
      { name: 'Aplicar a las 2 similares' },
      { timeout: 5000 }
    )

    // The bulk bar does not start a single-row write, so only the row's
    // current choice tells the offer is out of date.
    select(D1)
    await choose('Hogar: No')
    await waitFor(() => expect(repo.row(D1)?.household).toBe(false), {
      timeout: 5000,
    })
    await act(async () => {
      fireEvent.click(stale)
    })

    expect(repo.householdRules.size).toBe(0)
    expect(repo.row(D1)?.household).toBe(false)
  })

  it('an old Reintentar of the apply does not run after a newer click', async () => {
    seed(devotos())
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    await click(D1)
    repo.failOn('upsertHouseholdRule', { error: new Error('boom'), times: 1 })
    const apply = await screen.findByRole(
      'button',
      { name: 'Aplicar a las 2 similares' },
      { timeout: 5000 }
    )
    await act(async () => {
      fireEvent.click(apply)
    })
    const staleRetry = await screen.findByRole(
      'button',
      { name: 'Reintentar' },
      { timeout: 5000 }
    )

    await click(D1)
    await act(async () => {
      fireEvent.click(staleRetry)
    })

    expect(repo.householdRules.size).toBe(0)
    expect(on(D2)).toBe(false)
    expect(logged).toHaveBeenCalled()
  })

  it('a failure while applying offers Reintentar', async () => {
    seed(devotos())
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    await click(D1)
    repo.failOn('upsertHouseholdRule', { error: new Error('boom'), times: 1 })

    const apply = await screen.findByRole(
      'button',
      { name: 'Aplicar a las 2 similares' },
      { timeout: 5000 }
    )
    await act(async () => {
      fireEvent.click(apply)
    })
    const retry = await screen.findByRole(
      'button',
      { name: 'Reintentar' },
      { timeout: 5000 }
    )
    expect(on(D2)).toBe(false)
    await act(async () => {
      fireEvent.click(retry)
    })

    await waitFor(() => expect(on(D2)).toBe(true), { timeout: 5000 })
    expect(logged).toHaveBeenCalled()
  })
})

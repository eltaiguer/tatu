import { beforeEach, describe, expect, it, vi } from 'vitest'
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
import { Category, type Transaction } from '../../models'
import {
  editTransaction,
  restoreCategories,
} from '../../services/mutations/transaction-mutations'
import {
  getDescriptionOverride,
  replaceDescriptionOverrides,
} from '../../services/descriptions/description-overrides'
import { replaceMerchantCategoryOverrides } from '../../services/categorizer/category-overrides'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../../services/repository/in-memory-repository'
import {
  DEFAULT_URL_FILTERS,
  type UrlFilterState,
} from '../../services/filters/url-filters'
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
    categoryConfidence: 1,
    rawData: {},
    ...overrides,
  } as Transaction
}

let repo: InMemoryRepository

beforeEach(() => {
  replaceDescriptionOverrides({})
  replaceMerchantCategoryOverrides({})
  replaceCustomCategories([])
})

function Harness({
  initialFilters,
  writable = true,
}: {
  initialFilters: UrlFilterState
  writable?: boolean
}) {
  const transactions = useStore(transactionStore, (s) => s.transactions)
  return (
    <>
      <Transactions
        transactions={transactions}
        initialFilters={initialFilters}
        onUpdateTransaction={
          writable ? (id, edit) => editTransaction(repo, id, edit) : undefined
        }
        onRestoreCategories={(rows) => restoreCategories(repo, rows)}
      />
      <Toaster />
    </>
  )
}

function seed(
  rows: Transaction[],
  options: { filters?: Partial<UrlFilterState>; writable?: boolean } = {}
) {
  repo = createInMemoryRepository({ transactions: rows })
  transactionStore.getState().setTransactions(rows)
  workspaceStore.setState({ userId: repo.userId, status: 'ready' })
  render(
    <Harness
      initialFilters={{
        ...DEFAULT_URL_FILTERS,
        period: { mode: 'all' },
        ...options.filters,
      }}
      writable={options.writable}
    />
  )
}

// Both the desktop row and the mobile card render; [0] is the row.
const badges = (description: string) =>
  screen.queryAllByRole('button', {
    name: (name) => name.startsWith(`Categoría de ${description}:`),
  })
const badge = (description: string, which = 0) => badges(description)[which]
const stored = (id: string) =>
  transactionStore.getState().transactions.find((t) => t.id === id)

async function pick(description: string, label: string, which = 0) {
  await userEvent.click(badge(description, which))
  await userEvent.click(
    within(
      await screen.findByRole('dialog', { name: 'Elegir categoría' })
    ).getByRole('button', { name: label })
  )
}

const DEVOTO = (day: number) => `DEVOTO ${day}/03/2026`
const devotos = () => [
  tx('d1', { description: DEVOTO(11) }),
  tx('d2', { description: DEVOTO(12) }),
  tx('d3', { description: DEVOTO(13) }),
]

describe('categorize in place (#279)', () => {
  it('opens a picker from the row’s badge with the search focused', async () => {
    seed([tx('Tienda', { category: 'groceries', categoryConfidence: 0.4 })])

    await userEvent.click(badge('Tienda'))

    const dialog = await screen.findByRole('dialog', {
      name: 'Elegir categoría',
    })
    expect(within(dialog).getByLabelText('Buscar categoría')).toHaveFocus()
  })

  it('saves the pick on that row only, clears Revisar and keeps focus on the badge', async () => {
    seed([
      tx('Tienda', {
        description: 'Tienda',
        categoryConfidence: 0.4,
      }),
      tx('Otra', { description: 'Tienda' }),
    ])
    expect(screen.getAllByText('Revisar').length).toBeGreaterThan(0)

    await pick('Tienda', 'Restaurantes')

    await waitFor(() => expect(stored('Tienda')?.category).toBe('restaurants'))
    for (const read of [stored, repo.row]) {
      expect(read('Tienda')).toMatchObject({
        category: 'restaurants',
        categoryConfidence: 1,
      })
      expect(read('Otra')?.category).toBe('groceries')
    }
    expect(repo.categoryOverrides.size).toBe(0)
    expect(screen.queryAllByText('Revisar')).toHaveLength(0)
    await waitFor(() => expect(badge('Tienda')).toHaveFocus())
  })

  it('offers Deshacer and Aplicar a las N similares after a pick', async () => {
    seed(devotos())

    await pick(DEVOTO(11), 'Restaurantes')

    expect(await screen.findByText('Cambios guardados')).toBeVisible()
    expect(screen.getByText('Restaurantes en esta transacción')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Aplicar a las 2 similares' })
    ).toBeVisible()
  })

  it('Deshacer puts back the category and its confidence', async () => {
    seed([
      tx('a', { description: 'Tienda', categoryConfidence: 0.4 }),
      tx('b', {
        description: 'Sin cat',
        category: undefined,
        categoryConfidence: undefined,
      }),
    ])

    await pick('Tienda', 'Restaurantes')
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }))

    await waitFor(() => expect(stored('a')?.category).toBe('groceries'))
    for (const read of [stored, repo.row]) {
      expect(read('a')).toMatchObject({
        category: 'groceries',
        categoryConfidence: 0.4,
      })
    }
    expect(await screen.findByText('Se deshizo el cambio')).toBeVisible()
    expect(screen.getAllByText('Revisar').length).toBeGreaterThan(0)

    await pick('Sin cat', 'Transporte')
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(stored('b')?.category).toBeUndefined())
    expect(repo.row('b')?.category).toBeUndefined()
    expect(repo.row('b')?.categoryConfidence).toBeUndefined()
  })

  it('Aplicar a las N similares writes the merchant rule and all of them', async () => {
    seed(devotos())

    await pick(DEVOTO(11), 'Restaurantes')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Aplicar a las 2 similares' })
    )

    expect(await screen.findByText('Se aplicó a 2 transacciones')).toBeVisible()
    for (const id of ['d1', 'd2', 'd3']) {
      expect(repo.row(id)).toMatchObject({
        category: 'restaurants',
        categoryConfidence: 1,
      })
      expect(stored(id)?.category).toBe('restaurants')
    }
    expect(repo.categoryOverrides.size).toBe(1)
  })

  describe('how many similar rows it offers', () => {
    it('says "la otra similar" for one other', async () => {
      seed([
        tx('a', { description: 'Tienda' }),
        tx('b', { description: 'Tienda' }),
      ])
      await pick('Tienda', 'Restaurantes')
      expect(
        await screen.findByRole('button', { name: 'Aplicar a la otra similar' })
      ).toBeVisible()
    })

    it('offers nothing when there is no other', async () => {
      seed([tx('a', { description: 'Tienda' })])
      await pick('Tienda', 'Restaurantes')
      await screen.findByText('Cambios guardados')
      expect(
        screen.queryByRole('button', { name: /Aplicar a/ })
      ).not.toBeInTheDocument()
    })

    it('does not count split parts', async () => {
      seed([
        tx('a', { description: 'Tienda' }),
        tx('part', { description: 'Tienda', splitParentId: 'gone' }),
      ])
      await pick('Tienda', 'Restaurantes')
      await screen.findByText('Cambios guardados')
      expect(
        screen.queryByRole('button', { name: /Aplicar a/ })
      ).not.toBeInTheDocument()
    })

    it('counts similar rows outside the current period', async () => {
      seed(
        [
          tx('a', { description: 'Tienda' }),
          tx('old', {
            description: 'Tienda',
            date: new Date('2025-01-10T00:00:00.000Z'),
          }),
        ],
        { filters: { period: { mode: 'month', y: 2026, m: 2 } } }
      )
      await pick('Tienda', 'Restaurantes')
      expect(
        await screen.findByRole('button', { name: 'Aplicar a la otra similar' })
      ).toBeVisible()
    })
  })

  it('keeps names: the row’s own and the merchant’s', async () => {
    seed([
      tx('a', { description: 'Tienda', displayDescription: 'Mi tienda' }),
      tx('b', { description: 'Tienda' }),
    ])
    await repo.upsertDescriptionOverride({
      descriptionNormalized: 'tienda',
      descriptionOriginal: 'Tienda',
      friendlyDescription: 'Tienda amiga',
    })
    replaceDescriptionOverrides({
      tienda: {
        descriptionOriginal: 'Tienda',
        friendlyDescription: 'Tienda amiga',
        updatedAt: '',
      },
    })

    await pick('Mi tienda', 'Restaurantes')
    await waitFor(() => expect(stored('a')?.category).toBe('restaurants'))
    expect(stored('a')?.displayDescription).toBe('Mi tienda')
    expect(repo.row('a')?.displayDescription).toBe('Mi tienda')

    fireEvent.click(
      await screen.findByRole('button', { name: 'Aplicar a la otra similar' })
    )
    await screen.findByText('Se aplicó a la otra similar')
    expect(getDescriptionOverride('Tienda')?.friendlyDescription).toBe(
      'Tienda amiga'
    )
    expect(repo.descriptionOverrides.get('tienda')?.friendlyDescription).toBe(
      'Tienda amiga'
    )
    expect(stored('a')?.displayDescription).toBe('Mi tienda')
  })

  describe('stale toasts', () => {
    it('a new pick withdraws the earlier Deshacer', async () => {
      seed([tx('a', { description: 'Tienda' })])

      await pick('Tienda', 'Restaurantes')
      await screen.findByRole('button', { name: 'Deshacer' })
      await pick('Tienda', 'Transporte')

      await waitFor(() => expect(stored('a')?.category).toBe('transport'))
      await waitFor(() =>
        expect(
          screen.getAllByRole('button', { name: 'Deshacer' })
        ).toHaveLength(1)
      )
    })

    it('Deshacer does not overwrite a change made since', async () => {
      seed([tx('a', { description: 'Tienda', categoryConfidence: 0.4 })])

      await pick('Tienda', 'Restaurantes')
      const undo = await screen.findByRole('button', { name: 'Deshacer' })
      await act(async () => {
        await editTransaction(repo, 'a', {
          category: 'transport',
          applyScope: 'single',
        })
      })
      fireEvent.click(undo)

      expect(
        await screen.findByText(
          'Mientras tanto cambió la categoría de esta transacción; no se deshizo.'
        )
      ).toBeVisible()
      expect(stored('a')?.category).toBe('transport')
      expect(repo.row('a')?.category).toBe('transport')
    })
  })

  describe('keyboard', () => {
    it('c opens the picker, typing filters, Enter applies; Escape closes and returns focus', async () => {
      seed([tx('a', { description: 'Tienda' })])
      screen.getAllByRole('checkbox', { name: 'Seleccionar Tienda' })[0].focus()

      await userEvent.keyboard('c')
      const dialog = await screen.findByRole('dialog', {
        name: 'Elegir categoría',
      })
      expect(within(dialog).getByLabelText('Buscar categoría')).toHaveFocus()

      await userEvent.keyboard('c')
      expect(within(dialog).getByLabelText('Buscar categoría')).toHaveValue('c')
      expect(
        screen.getByRole('dialog', { name: 'Elegir categoría' })
      ).toBeVisible()

      await userEvent.clear(within(dialog).getByLabelText('Buscar categoría'))
      await userEvent.keyboard('rest{Enter}')
      await waitFor(() => expect(stored('a')?.category).toBe('restaurants'))

      fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }))
      await waitFor(() => expect(stored('a')?.category).toBe('groceries'))
      screen.getAllByRole('checkbox', { name: 'Seleccionar Tienda' })[0].focus()
      await userEvent.keyboard('c')
      await screen.findByRole('dialog', { name: 'Elegir categoría' })
      await userEvent.keyboard('{Escape}')
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Elegir categoría' })
        ).not.toBeInTheDocument()
      )
      expect(badge('Tienda')).toHaveFocus()
    })

    it('ignores c with ctrl or meta', async () => {
      seed([tx('a', { description: 'Tienda' })])
      screen.getAllByRole('checkbox', { name: 'Seleccionar Tienda' })[0].focus()

      await userEvent.keyboard('{Control>}c{/Control}')
      await userEvent.keyboard('{Meta>}c{/Meta}')

      expect(
        screen.queryByRole('dialog', { name: 'Elegir categoría' })
      ).not.toBeInTheDocument()
    })
  })

  it('split parents have no picker; split parts do, without Aplicar', async () => {
    seed([
      tx('p', { description: 'Cuenta', isSplitParent: true }),
      tx('p1', { description: 'Cuenta', splitParentId: 'p' }),
      tx('p2', { description: 'Cuenta', splitParentId: 'p' }),
    ])
    expect(badges('Cuenta')).toHaveLength(4)

    await userEvent.click(badges('Cuenta')[0])
    const dialog = await screen.findByRole('dialog', {
      name: 'Elegir categoría',
    })
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Restaurantes' })
    )

    await screen.findByText('Cambios guardados')
    expect(
      screen.queryByRole('button', { name: /Aplicar a/ })
    ).not.toBeInTheDocument()
  })

  describe('the mobile card', () => {
    it('opens a sheet focused on the current option, closes in Spanish, and returns focus', async () => {
      seed([tx('a', { description: 'Tienda' })])

      await userEvent.click(badge('Tienda', 1))
      const sheet = await screen.findByRole('dialog', {
        name: 'Elegir categoría',
      })
      expect(
        within(sheet).getByRole('button', { name: 'Alimentación' })
      ).toHaveFocus()
      expect(
        within(sheet).getByRole('button', { name: 'Cerrar' })
      ).toBeVisible()

      await userEvent.click(
        within(sheet).getByRole('button', { name: 'Restaurantes' })
      )

      await waitFor(() => expect(stored('a')?.category).toBe('restaurants'))
      await waitFor(() => expect(badge('Tienda', 1)).toHaveFocus())
    })
  })

  it('reports a failed pick with Reintentar and leaves the category', async () => {
    seed([tx('a', { description: 'Tienda' })])
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    repo.failOn('update', { error: new Error('timeout'), times: 1 })

    await pick('Tienda', 'Restaurantes')

    expect(
      await screen.findByText('No se pudo cambiar la categoría')
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible()
    expect(stored('a')?.category).toBe('groceries')
    expect(logged).toHaveBeenCalled()
  })

  it('does nothing when the row already has that category', async () => {
    seed([tx('a', { description: 'Tienda', category: 'restaurants' })])

    await pick('Tienda', 'Restaurantes')
    // Let a (wrongly) started write and its toast land before looking.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(screen.queryByText('Cambios guardados')).not.toBeInTheDocument()
    expect(repo.requests.update ?? 0).toBe(0)
  })

  it('writes the same category when the row is below confidence 1 (a confirmation)', async () => {
    seed([tx('a', { description: 'Tienda', categoryConfidence: 0.4 })])

    await pick('Tienda', 'Alimentación')

    await waitFor(() => expect(stored('a')?.categoryConfidence).toBe(1))
    expect(repo.row('a')).toMatchObject({
      category: 'groceries',
      categoryConfidence: 1,
    })
    expect(screen.queryAllByText('Revisar')).toHaveLength(0)
  })

  describe('while a write of the row is in flight', () => {
    const noPicker = async (description: string) => {
      screen
        .getAllByRole('checkbox', { name: `Seleccionar ${description}` })[0]
        .focus()
      await userEvent.keyboard('c')
      await userEvent.click(badge(description))
      expect(
        screen.queryByRole('dialog', { name: 'Elegir categoría' })
      ).not.toBeInTheDocument()
    }

    it('a pick locks the badge and c', async () => {
      seed([tx('a', { description: 'Tienda' })])
      const gate = repo.hold('update')

      await pick('Tienda', 'Restaurantes')
      await waitFor(() =>
        expect(badge('Tienda')).toHaveAttribute('aria-disabled', 'true')
      )
      await noPicker('Tienda')

      await act(async () => gate.release())
      await waitFor(() =>
        expect(badge('Tienda')).not.toHaveAttribute('aria-disabled')
      )
    })

    it('"Aplicar" locks it too, so a newer pick cannot be overwritten', async () => {
      seed(devotos())
      await pick(DEVOTO(11), 'Restaurantes')
      const apply = await screen.findByRole('button', {
        name: 'Aplicar a las 2 similares',
      })
      const gate = repo.hold('update')

      fireEvent.click(apply)
      await waitFor(() =>
        expect(badge(DEVOTO(11))).toHaveAttribute('aria-disabled', 'true')
      )
      await noPicker(DEVOTO(11))

      await act(async () => gate.release())
      expect(
        await screen.findByText('Se aplicó a 2 transacciones')
      ).toBeVisible()
      await waitFor(() =>
        expect(badge(DEVOTO(11))).not.toHaveAttribute('aria-disabled')
      )
    })
  })

  it('counts the rows that exist when "Aplicar" is clicked', async () => {
    seed(devotos())
    await pick(DEVOTO(11), 'Restaurantes')
    const apply = await screen.findByRole('button', {
      name: 'Aplicar a las 2 similares',
    })
    const extra = tx('d4', { description: DEVOTO(14) })
    await act(async () => {
      await repo.insertTransactions([extra])
      transactionStore
        .getState()
        .setTransactions([...transactionStore.getState().transactions, extra])
    })

    fireEvent.click(apply)

    expect(await screen.findByText('Se aplicó a 3 transacciones')).toBeVisible()
  })

  describe('an old "Aplicar"', () => {
    it('does nothing once the row changed, and says so', async () => {
      seed(devotos())
      await pick(DEVOTO(11), 'Restaurantes')
      const apply = await screen.findByRole('button', {
        name: 'Aplicar a las 2 similares',
      })
      await act(async () => {
        await editTransaction(repo, 'd1', {
          category: 'transport',
          applyScope: 'single',
        })
      })

      fireEvent.click(apply)

      expect(
        await screen.findByText(
          'Mientras tanto cambió la categoría de esta transacción; no se aplicó a las similares.'
        )
      ).toBeVisible()
      expect(stored('d2')?.category).toBe('groceries')
      expect(repo.categoryOverrides.size).toBe(0)
    })

    it('refuses a Reintentar after the row changed', async () => {
      seed(devotos())
      await pick(DEVOTO(11), 'Restaurantes')
      const apply = await screen.findByRole('button', {
        name: 'Aplicar a las 2 similares',
      })
      repo.failOn('update', { error: new Error('timeout'), times: 1 })
      fireEvent.click(apply)
      const retry = await screen.findByRole('button', { name: 'Reintentar' })
      await act(async () => {
        await editTransaction(repo, 'd1', {
          category: 'transport',
          applyScope: 'single',
        })
      })

      fireEvent.click(retry)

      expect(
        await screen.findByText(
          'Mientras tanto cambió la categoría de esta transacción; no se aplicó a las similares.'
        )
      ).toBeVisible()
      expect(stored('d1')?.category).toBe('transport')
    })
  })

  describe('ignored and transfer rows', () => {
    it('get a working button: a pick sticks', async () => {
      seed(
        [
          tx('out', {
            description: 'Giro',
            category: Category.InternalTransfer,
            categoryConfidence: 0.9,
          }),
          tx('in', {
            description: 'Giro in',
            type: 'credit',
            category: Category.InternalTransfer,
            categoryConfidence: 0.9,
          }),
        ],
        { filters: { showIgnored: true } }
      )

      await pick('Giro', 'Restaurantes')

      await waitFor(() => expect(stored('out')?.category).toBe('restaurants'))
      expect(repo.row('out')).toMatchObject({
        category: 'restaurants',
        categoryConfidence: 1,
      })
    })
  })

  it('Escape after opening with the mouse returns focus to the badge', async () => {
    seed([tx('a', { description: 'Tienda' })])

    await userEvent.click(badge('Tienda'))
    await screen.findByRole('dialog', { name: 'Elegir categoría' })
    await userEvent.keyboard('{Escape}')

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Elegir categoría' })
      ).not.toBeInTheDocument()
    )
    expect(badge('Tienda')).toHaveFocus()
  })

  it('has no picker without a way to write', () => {
    seed([tx('a', { description: 'Tienda' })], { writable: false })

    expect(badges('Tienda')).toHaveLength(0)
  })
})

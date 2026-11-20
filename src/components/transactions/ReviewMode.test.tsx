import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useStore } from 'zustand'
import userEvent from '@testing-library/user-event'
import { Toaster, toast } from 'sonner'
import { Transactions } from '../Transactions'
import { Category, type Transaction } from '../../models'
import {
  editTransaction,
  restoreCategories,
} from '../../services/mutations/transaction-mutations'
import { replaceDescriptionOverrides } from '../../services/descriptions/description-overrides'
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
    category: Category.Uncategorized,
    categoryConfidence: 0,
    rawData: {},
    ...overrides,
  } as Transaction
}

// US$100 at 40,5, US$50, US$10 and a row that needs no review.
const uyuBig = () =>
  tx('uyu', { description: 'ALFA SERVICIOS', amount: 4050, currency: 'UYU' })
const usd50 = () =>
  tx('usd50', { description: 'BETA TIENDA', amount: 50, currency: 'USD' })
const usd10 = () =>
  tx('usd10', { description: 'GAMMA KIOSCO', amount: 10, currency: 'USD' })
const done = () =>
  tx('done', {
    description: 'DELTA MERCADO',
    category: 'groceries',
    categoryConfidence: 1,
  })
const basicRows = () => [usd10(), done(), uyuBig(), usd50()]

let repo: InMemoryRepository
const onFiltersChange = vi.fn()
const onGoToOverview = vi.fn()

afterEach(() => {
  act(() => {
    toast.dismiss()
  })
})

beforeEach(() => {
  replaceDescriptionOverrides({})
  replaceMerchantCategoryOverrides({})
  replaceCustomCategories([])
  onFiltersChange.mockClear()
  onGoToOverview.mockClear()
})

function Harness({
  initialFilters,
  homeCurrency,
}: {
  initialFilters: UrlFilterState
  homeCurrency: string
}) {
  const transactions = useStore(transactionStore, (s) => s.transactions)
  return (
    <>
      <button type="button">Fuera</button>
      <Transactions
        transactions={transactions}
        initialFilters={initialFilters}
        onFiltersChange={onFiltersChange}
        homeCurrency={homeCurrency}
        fxRate={40.5}
        onGoToOverview={onGoToOverview}
        onUpdateTransaction={(id, edit) => editTransaction(repo, id, edit)}
        onRestoreCategories={(rows) => restoreCategories(repo, rows)}
      />
    </>
  )
}

function seed(
  rows: Transaction[],
  options: { filters?: Partial<UrlFilterState>; homeCurrency?: string } = {}
) {
  repo = createInMemoryRepository({ transactions: rows })
  transactionStore.getState().setTransactions(rows)
  workspaceStore.setState({ userId: repo.userId, status: 'ready' })
  render(<Toaster />)
  return render(
    <Harness
      homeCurrency={options.homeCurrency ?? 'USD'}
      initialFilters={{
        ...DEFAULT_URL_FILTERS,
        review: true,
        reviewMode: true,
        period: { mode: 'all' },
        ...options.filters,
      }}
    />
  )
}

const stored = (id: string) =>
  transactionStore.getState().transactions.find((t) => t.id === id)
const option = (name: RegExp | string) =>
  screen.getByRole('button', { name: name })
const search = () => screen.getByRole('textbox', { name: 'Buscar categoría' })
const lastSearch = () => onFiltersChange.mock.lastCall?.[0]
const heading = (name: string) => screen.getByRole('heading', { name })

describe('ReviewMode', () => {
  it('shows the biggest row first with progress, and no table', () => {
    seed(basicRows())

    expect(heading('Revisar movimientos')).toBeInTheDocument()
    expect(screen.getByText('1 de 3')).toBeInTheDocument()
    expect(heading('ALFA SERVICIOS')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(search()).toHaveFocus()
    expect(screen.getByText('≈ US$ 100,00')).toBeInTheDocument()
  })

  it('shows the statement text when the label is a rename', () => {
    seed([{ ...uyuBig(), displayDescription: 'Mi nombre' }, usd50()])

    expect(heading('Mi nombre')).toBeInTheDocument()
    expect(screen.getByText('Original: ALFA SERVICIOS')).toBeInTheDocument()
  })

  it('picks with a click, advances and shows no toast', async () => {
    seed(basicRows())
    await userEvent.click(option(/Alimentación/))

    await waitFor(() => expect(screen.getByText('2 de 3')).toBeInTheDocument())
    expect(stored('uyu')).toMatchObject({
      category: 'groceries',
      categoryConfidence: 1,
    })
    expect(heading('BETA TIENDA')).toBeInTheDocument()
    expect(screen.queryByText('Cambios guardados')).not.toBeInTheDocument()
  })

  it('skips with s from an option, but types s in the search', async () => {
    seed(basicRows())
    const before = repo.requests.update ?? 0
    await userEvent.type(search(), 's')
    expect(search()).toHaveValue('s')
    expect(screen.getByText('1 de 3')).toBeInTheDocument()

    option(/Alimentación/).focus()
    await userEvent.keyboard('s')

    expect(screen.getByText('2 de 3')).toBeInTheDocument()
    expect(repo.requests.update ?? 0).toBe(before)
  })

  it('ignores s with focus outside the review', async () => {
    seed(basicRows())
    screen.getByRole('button', { name: 'Fuera' }).focus()
    await userEvent.keyboard('s')

    expect(screen.getByText('1 de 3')).toBeInTheDocument()
  })

  it('ignores Escape with focus outside the review', async () => {
    seed(basicRows())
    screen.getByRole('button', { name: 'Fuera' }).focus()
    await userEvent.keyboard('{Escape}')

    expect(heading('Revisar movimientos')).toBeInTheDocument()
    expect(lastSearch()).toContain('modo=revisar')
  })

  it('keeps the search focused on a suggested row, and Enter picks the suggestion', async () => {
    seed([
      tx('low', {
        description: 'BETA TIENDA',
        category: 'restaurants',
        categoryConfidence: 0.4,
        amount: 50,
        currency: 'USD',
      }),
      usd10(),
    ])

    expect(option(/Sugerida/)).toBeVisible()
    expect(search()).toHaveFocus()
    await userEvent.keyboard('{Enter}')

    await waitFor(() =>
      expect(stored('low')).toMatchObject({
        category: 'restaurants',
        categoryConfidence: 1,
      })
    )
  })

  it('types s into the search of a suggested row instead of skipping', async () => {
    seed([
      tx('low', {
        description: 'BETA TIENDA',
        category: 'restaurants',
        categoryConfidence: 0.4,
        amount: 50,
        currency: 'USD',
      }),
      usd10(),
    ])
    await userEvent.keyboard('super')

    expect(search()).toHaveValue('super')
    expect(screen.getByText('1 de 2')).toBeInTheDocument()
  })

  it('suggests what confident similar rows say', () => {
    seed([
      tx('u', {
        description: 'DEVOTO 11/03/2026',
        amount: 50,
        currency: 'USD',
      }),
      tx('s', {
        description: 'DEVOTO 12/03/2026',
        amount: 5,
        currency: 'USD',
        category: 'restaurants',
        categoryConfidence: 1,
      }),
    ])

    expect(option(/Restaurantes.*Sugerida/)).toBeVisible()
    expect(search()).toHaveFocus()
  })

  it('does not chain-pick on a held Enter', async () => {
    seed([
      tx('low', {
        description: 'BETA TIENDA',
        category: 'restaurants',
        categoryConfidence: 0.4,
        amount: 50,
        currency: 'USD',
      }),
    ])
    const before = repo.requests.update ?? 0
    const suggested = option(/Sugerida/)
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      repeat: true,
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      suggested.dispatchEvent(event)
    })

    expect(event.defaultPrevented).toBe(true)
    expect(repo.requests.update ?? 0).toBe(before)
  })

  describe('with two rows of one merchant', () => {
    const rows = () => [
      tx('m1', {
        description: 'DEVOTO 11/03/2026',
        amount: 80,
        currency: 'USD',
      }),
      tx('m2', {
        description: 'DEVOTO 12/03/2026',
        amount: 70,
        currency: 'USD',
      }),
      usd10(),
    ]

    it('offers Aplicar in a strip, which jumps over the rows it wrote', async () => {
      seed(rows())
      await userEvent.click(option(/Alimentación/))
      await userEvent.click(
        await screen.findByRole('button', { name: 'Aplicar a la otra similar' })
      )

      await waitFor(() => expect(stored('m2')?.categoryConfidence).toBe(1))
      expect(stored('m2')?.category).toBe('groceries')
      await waitFor(() =>
        expect(screen.getByText('3 de 3')).toBeInTheDocument()
      )
      expect(
        screen.queryByRole('button', { name: 'Aplicar a la otra similar' })
      ).not.toBeInTheDocument()
    })

    it('is busy while Aplicar is in flight', async () => {
      seed(rows())
      await userEvent.click(option(/Alimentación/))
      const apply = await screen.findByRole('button', {
        name: 'Aplicar a la otra similar',
      })
      const release = repo.hold('update')
      await userEvent.click(apply)

      await waitFor(() =>
        expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
      )
      const before = repo.requests.update ?? 0
      await userEvent.click(option(/Transporte/))
      expect(repo.requests.update ?? 0).toBe(before)

      act(() => release.release())
      await waitFor(() =>
        expect(document.querySelector('[aria-busy="true"]')).toBeNull()
      )
    })

    it('undoes once on a double click, with no stale toast', async () => {
      seed(rows())
      await userEvent.click(option(/Alimentación/))
      const undo = await screen.findByRole('button', { name: 'Deshacer' })
      const release = repo.hold('update')
      await userEvent.dblClick(undo)
      act(() => release.release())

      await waitFor(() =>
        expect(stored('m1')?.category).toBe(Category.Uncategorized)
      )
      expect(screen.queryByText(/Mientras tanto/)).not.toBeInTheDocument()
    })

    it('puts the row back with Deshacer', async () => {
      seed(rows())
      await userEvent.click(option(/Alimentación/))
      await userEvent.click(
        await screen.findByRole('button', { name: 'Deshacer' })
      )

      await waitFor(() =>
        expect(stored('m1')).toMatchObject({
          category: Category.Uncategorized,
          categoryConfidence: 0,
        })
      )
      await waitFor(() =>
        expect(screen.getByText('1 de 3')).toBeInTheDocument()
      )
    })
  })

  it('stays on the row when the write fails, and Reintentar advances', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    seed(basicRows())
    repo.failOn('update', { error: new Error('timeout'), times: 1 })
    await userEvent.click(option(/Alimentación/))

    expect(
      await screen.findByText('No se pudo cambiar la categoría')
    ).toBeInTheDocument()
    expect(error).toHaveBeenCalled()
    expect(screen.getByText('1 de 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(stored('uyu')?.categoryConfidence).toBe(1))
    await waitFor(() => expect(screen.getByText('2 de 3')).toBeInTheDocument())
    expect(screen.queryByText('Cambios guardados')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Alimentación en ALFA SERVICIOS'
    )
  })

  it('keeps the newer pick’s strip when an older Reintentar lands late', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    seed(basicRows())
    repo.failOn('update', { error: new Error('timeout'), times: 1 })
    await userEvent.click(option(/Alimentación/))
    const retry = await screen.findByRole('button', { name: 'Reintentar' })
    expect(error).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    await userEvent.click(option(/Alimentación/))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('en BETA TIENDA')
    )

    fireEvent.click(retry)
    await waitFor(() => expect(stored('uyu')?.categoryConfidence).toBe(1))

    expect(screen.getByRole('status')).toHaveTextContent('en BETA TIENDA')
  })

  it('keeps the total while the filtered rows shrink', async () => {
    seed(basicRows())
    await userEvent.click(option(/Alimentación/))

    await waitFor(() => expect(screen.getByText('2 de 3')).toBeInTheDocument())
  })

  describe('done states', () => {
    async function pickAll() {
      for (let i = 0; i < 3; i += 1) {
        await userEvent.click(option(/Alimentación/))
        await waitFor(() =>
          expect(
            screen.queryByText(`${i + 2} de 3`) ??
              screen.queryByRole('heading', { name: 'Todo categorizado' })
          ).toBeInTheDocument()
        )
      }
    }

    it('closes with the money that now has a category', async () => {
      seed(basicRows())
      await pickAll()

      const title = await screen.findByRole('heading', {
        name: 'Todo categorizado',
      })
      expect(title).toHaveFocus()
      expect(
        screen.getByText('US$ 160,00 ahora tiene categoría')
      ).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Ver Resumen' }))
      expect(onGoToOverview).toHaveBeenCalledTimes(1)
    })

    it('adds up in the home currency', async () => {
      seed(basicRows(), { homeCurrency: 'UYU' })
      await pickAll()

      expect(
        await screen.findByText('$U 6.480,00 ahora tiene categoría')
      ).toBeInTheDocument()
    })

    it('offers the skipped rows again', async () => {
      seed(basicRows())
      option(/Alimentación/).focus()
      await userEvent.keyboard('s')
      await userEvent.click(option(/Alimentación/))
      await userEvent.click(option(/Alimentación/))

      expect(
        await screen.findByRole('heading', { name: 'Revisión terminada' })
      ).toBeInTheDocument()
      expect(
        screen.getByText('Saltaste 1 · sigue en la lista')
      ).toBeInTheDocument()
      await userEvent.click(
        screen.getByRole('button', { name: 'Revisar las salteadas' })
      )
      expect(heading('ALFA SERVICIOS')).toBeInTheDocument()
      expect(screen.getByText('3 de 3')).toBeInTheDocument()
    })

    it('says so when there is nothing to review', () => {
      seed([done()])

      expect(heading('Nada para revisar')).toBeInTheDocument()
      expect(
        screen.getByText(
          'No quedan movimientos sin categoría ni con poca seguridad en esta lista.'
        )
      ).toBeInTheDocument()
    })
  })

  it('leaves with Escape for the table of what is left', async () => {
    seed(basicRows())
    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(lastSearch()).toBe('revisar=si&periodo=todo'))
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Revisar uno por uno' })
    ).toHaveFocus()
  })

  it('grabs focus on leaving once, not on every later re-mount', async () => {
    seed(basicRows())
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Revisar uno por uno' })
      ).toHaveFocus()
    )

    const box = screen.getByPlaceholderText(/Buscar por comercio/)
    await userEvent.type(box, 'zzzz')
    await userEvent.clear(box)

    expect(box).toHaveFocus()
  })

  it('leaves with Salir', async () => {
    seed(basicRows())
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }))

    await waitFor(() => expect(lastSearch()).toBe('revisar=si&periodo=todo'))
  })

  it('is entered from the A revisar table, only with the filter', async () => {
    seed(basicRows(), { filters: { reviewMode: false } })
    await userEvent.click(
      screen.getByRole('button', { name: 'Revisar uno por uno' })
    )

    expect(heading('Revisar movimientos')).toBeInTheDocument()
    expect(lastSearch()).toBe('revisar=si&modo=revisar&periodo=todo')
  })

  it('has no entry button without the filter', () => {
    seed(basicRows(), { filters: { review: false, reviewMode: false } })

    expect(
      screen.queryByRole('button', { name: 'Revisar uno por uno' })
    ).not.toBeInTheDocument()
  })
})

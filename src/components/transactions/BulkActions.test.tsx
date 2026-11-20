import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { Toaster, toast } from 'sonner'
import { Transactions } from '../Transactions'
import type { Transaction } from '../../models'
import {
  autoCategorize,
  bulkCategorize,
  bulkTag,
  deleteTransactions,
  editTransaction,
  restoreCategories,
  setHousehold,
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
    category: 'groceries',
    categoryConfidence: 1,
    rawData: {},
    ...overrides,
  } as Transaction
}

let repo: InMemoryRepository

// Sonner's toasts are global: one test's must not outlive it into the next.
afterEach(() => {
  act(() => {
    toast.dismiss()
  })
})

beforeEach(() => {
  replaceDescriptionOverrides({})
  replaceMerchantCategoryOverrides({})
  replaceCustomCategories([])
})

function Harness({ initialFilters }: { initialFilters: UrlFilterState }) {
  const transactions = useStore(transactionStore, (s) => s.transactions)
  return (
    <Transactions
      transactions={transactions}
      initialFilters={initialFilters}
      onBulkCategorize={(ids, category) => bulkCategorize(repo, ids, category)}
      onBulkTag={(ids, tag) => bulkTag(repo, ids, tag)}
      onAutoCategorizeTransactions={(ids) => autoCategorize(repo, ids)}
      onSetHousehold={(ids, household) => setHousehold(repo, ids, household)}
      onRestoreCategories={(rows) => restoreCategories(repo, rows)}
      onUpdateTransaction={(id, edit) => editTransaction(repo, id, edit)}
    />
  )
}

function seed(rows: Transaction[], filters: Partial<UrlFilterState> = {}) {
  repo = createInMemoryRepository({ transactions: rows })
  transactionStore.getState().setTransactions(rows)
  workspaceStore.setState({ userId: repo.userId, status: 'ready' })
  // Slow, multi-step specs under load must not outlive sonner's 4 s default.
  render(<Toaster duration={30000} />)
  return render(
    <Harness
      initialFilters={{
        ...DEFAULT_URL_FILTERS,
        period: { mode: 'all' },
        ...filters,
      }}
    />
  )
}

const stored = (id: string) =>
  transactionStore.getState().transactions.find((t) => t.id === id)

// Both the desktop row and the mobile card render; [0] is the row.
async function select(...ids: string[]) {
  for (const id of ids) {
    await userEvent.click(
      screen.getAllByRole('checkbox', { name: `Seleccionar ${id}` })[0]
    )
  }
}

const group = () => screen.getByRole('group', { name: 'Acciones' })
const barButton = (name: string) =>
  within(group()).getByRole('button', { name })

// Sonner mounts a toast invisible and flips it a tick later: wait for it to be
// visible, don't assert on arrival.
async function visible(element: HTMLElement | Promise<HTMLElement>) {
  const el = await element
  await waitFor(() => expect(el).toBeVisible())
  return el
}

// Sonner's toast buttons capture the pointer, which jsdom lacks.
const deshacer = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))

async function openPicker() {
  await userEvent.click(barButton('Categorizar'))
  return screen.findByRole('dialog', { name: 'Elegir categoría' })
}

describe('selection bar (#282)', () => {
  it('has five buttons, in order', async () => {
    seed([tx('a'), tx('b')])
    await select('a')

    expect(
      within(group())
        .getAllByRole('button')
        .map((b) => b.textContent?.trim())
    ).toEqual(['Categorizar', 'Hogar', 'No contar', 'Etiquetas', 'Eliminar'])
  })

  describe('Categorizar', () => {
    it('opens the shared picker and categorizes the selection with the keyboard', async () => {
      seed([tx('a'), tx('b')])
      await select('a', 'b')

      const dialog = await openPicker()
      await userEvent.type(
        within(dialog).getByLabelText('Buscar categoría'),
        'entret{Enter}'
      )

      await waitFor(() => expect(stored('a')?.category).toBe('entertainment'))
      for (const read of [stored, repo.row]) {
        for (const id of ['a', 'b']) {
          expect(read(id)).toMatchObject({
            category: 'entertainment',
            categoryConfidence: 1,
          })
        }
      }
      await visible(screen.findByText('2 transacciones categorizadas'))
      expect(
        document.querySelector('[data-sonner-toast] [data-description]')
      ).toHaveTextContent('Entretenimiento')
      expect(
        screen.queryByRole('region', { name: 'Acciones de selección' })
      ).toBeNull()
    })

    it('Deshacer puts back each row’s exact category and confidence', async () => {
      seed([
        tx('a', { category: 'groceries', categoryConfidence: 0.8 }),
        tx('b', { category: undefined, categoryConfidence: undefined }),
      ])
      await select('a', 'b')
      const dialog = await openPicker()
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Entretenimiento' })
      )
      await visible(screen.findByText('2 transacciones categorizadas'))

      await deshacer()

      await visible(screen.findByText('Se deshizo el cambio'))
      expect(stored('a')).toMatchObject({
        category: 'groceries',
        categoryConfidence: 0.8,
      })
      expect(stored('b')?.category ?? null).toBeNull()
      expect(stored('b')?.categoryConfidence ?? null).toBeNull()
      expect(repo.row('a')).toMatchObject({
        category: 'groceries',
        categoryConfidence: 0.8,
      })
      expect(repo.row('b')?.category ?? null).toBeNull()
      expect(repo.row('b')?.categoryConfidence ?? null).toBeNull()
    })

    it('Escape closes the picker and returns focus to Categorizar', async () => {
      seed([tx('a')])
      await select('a')
      await openPicker()

      await userEvent.keyboard('{Escape}')

      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Elegir categoría' })
        ).toBeNull()
      )
      expect(barButton('Categorizar')).toHaveFocus()
    })

    it('keeps the selection and offers no Deshacer when the write fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      seed([tx('a'), tx('b')])
      repo.failOn('update')
      await select('a', 'b')
      const dialog = await openPicker()

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Entretenimiento' })
      )

      await visible(
        screen.findByText('No se pudieron categorizar las transacciones')
      )
      expect(screen.getByText('2 seleccionadas')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull()
    })
  })

  describe('No contar', () => {
    it('leaves the rows out of the totals and Deshacer restores them exactly', async () => {
      seed([
        tx('a', { category: 'groceries', categoryConfidence: 0.8 }),
        tx('b', { category: 'restaurants', categoryConfidence: 0.6 }),
      ])
      await select('a', 'b')

      await userEvent.click(barButton('No contar'))

      await visible(
        screen.findByText('2 transacciones no cuentan en los totales')
      )
      for (const read of [stored, repo.row]) {
        for (const id of ['a', 'b']) {
          expect(read(id)).toMatchObject({
            category: 'ignored',
            categoryConfidence: 1,
          })
        }
      }

      await deshacer()

      await visible(screen.findByText('Se deshizo el cambio'))
      for (const read of [stored, repo.row]) {
        expect(read('a')).toMatchObject({
          category: 'groceries',
          categoryConfidence: 0.8,
        })
        expect(read('b')).toMatchObject({
          category: 'restaurants',
          categoryConfidence: 0.6,
        })
      }
    })

    it('does not touch a row that was already not counted', async () => {
      seed(
        [
          tx('a', { category: 'ignored', categoryConfidence: 1 }),
          tx('b', { category: 'groceries', categoryConfidence: 0.8 }),
        ],
        { showIgnored: true }
      )
      await select('a', 'b')
      await userEvent.click(barButton('No contar'))
      await visible(
        screen.findByText('2 transacciones no cuentan en los totales')
      )

      await deshacer()

      await visible(screen.findByText('Se deshizo el cambio'))
      expect(stored('a')).toMatchObject({
        category: 'ignored',
        categoryConfidence: 1,
      })
      expect(stored('b')).toMatchObject({
        category: 'groceries',
        categoryConfidence: 0.8,
      })
      expect(screen.queryByText(/mientras tanto/)).toBeNull()
    })

    it('changed meanwhile: Deshacer restores only what still holds', async () => {
      seed([
        tx('a', { category: 'groceries', categoryConfidence: 0.8 }),
        tx('b', { category: 'restaurants', categoryConfidence: 0.6 }),
      ])
      await select('a', 'b')
      await userEvent.click(barButton('No contar'))
      await visible(
        screen.findByText('2 transacciones no cuentan en los totales')
      )

      await act(async () => {
        await editTransaction(repo, 'b', {
          category: 'restaurants',
          applyScope: 'single',
        })
      })
      await deshacer()

      await visible(screen.findByText('Se deshizo el cambio'))
      expect(
        screen.getByText('1 cambió mientras tanto y quedó como está')
      ).toBeInTheDocument()
      expect(stored('a')).toMatchObject({
        category: 'groceries',
        categoryConfidence: 0.8,
      })
      expect(stored('b')).toMatchObject({ category: 'restaurants' })
    })

    it('says so when every row changed meanwhile', async () => {
      seed([tx('a'), tx('b')])
      await select('a', 'b')
      await userEvent.click(barButton('No contar'))
      await visible(
        screen.findByText('2 transacciones no cuentan en los totales')
      )

      await act(async () => {
        for (const id of ['a', 'b']) {
          await editTransaction(repo, id, {
            category: 'restaurants',
            applyScope: 'single',
          })
        }
      })
      await deshacer()

      await visible(
        screen.findByText(
          'Mientras tanto cambiaron estas transacciones; no se deshizo.'
        )
      )
      expect(stored('a')?.category).toBe('restaurants')
    })

    it('a partial Deshacer says how many came back, and Reintentar restores the rest', async () => {
      seed([
        tx('a', { category: 'groceries', categoryConfidence: 0.8 }),
        tx('b', { category: 'restaurants', categoryConfidence: 0.6 }),
      ])
      await select('a', 'b')
      await userEvent.click(barButton('No contar'))
      await visible(
        screen.findByText('2 transacciones no cuentan en los totales')
      )
      repo.failOn('update', {
        when: (ids) => ids.includes('b'),
        times: 1,
        error: new Error('timeout'),
      })
      vi.spyOn(console, 'error').mockImplementation(() => {})

      await deshacer()

      await visible(screen.findByText('Se actualizaron 1 de 2 — reintentar'))
      expect(stored('a')?.category).toBe('groceries')
      expect(stored('b')?.category).toBe('ignored')

      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

      await waitFor(() => expect(stored('b')?.category).toBe('restaurants'))
      expect(stored('b')?.categoryConfidence).toBe(0.6)
    })
  })

  describe('Volver a sugerir', () => {
    it('is in the picker, not on the bar, and says what it uses', async () => {
      seed([tx('a')])
      await select('a')
      expect(
        within(group()).queryByRole('button', { name: /Auto-categorizar/ })
      ).toBeNull()

      const dialog = await openPicker()

      const suggest = within(dialog).getByRole('button', {
        name: /Volver a sugerir/,
      })
      expect(suggest).toHaveAccessibleDescription(
        'Según tus reglas y los comercios que ya categorizaste'
      )
    })

    it('with no match: says so, keeps the selection, and Categorizar a mano reopens the picker', async () => {
      seed([
        tx('Comercio Inventado XYZ', {
          type: 'credit',
          category: undefined,
          categoryConfidence: undefined,
        }),
      ])
      await select('Comercio Inventado XYZ')
      const dialog = await openPicker()

      await userEvent.click(
        within(dialog).getByRole('button', { name: /Volver a sugerir/ })
      )

      await visible(screen.findByText('Sin coincidencias'))
      expect(
        screen.getByText(
          'Tus reglas y los comercios que ya categorizaste no sugieren otra categoría para la selección.'
        )
      ).toBeInTheDocument()
      expect(stored('Comercio Inventado XYZ')?.category).toBeUndefined()
      expect(screen.getByText('1 seleccionada')).toBeInTheDocument()

      fireEvent.click(
        screen.getByRole('button', { name: 'Categorizar a mano' })
      )

      expect(
        await screen.findByRole('dialog', { name: 'Elegir categoría' })
      ).toBeInTheDocument()
    })

    it('Categorizar a mano does nothing once the selection is gone', async () => {
      seed([
        tx('Comercio Inventado XYZ', {
          type: 'credit',
          category: undefined,
          categoryConfidence: undefined,
        }),
        tx('b'),
      ])
      await select('Comercio Inventado XYZ')
      const dialog = await openPicker()
      await userEvent.click(
        within(dialog).getByRole('button', { name: /Volver a sugerir/ })
      )
      await visible(screen.findByText('Sin coincidencias'))
      await userEvent.click(
        screen.getByRole('button', { name: 'Deseleccionar' })
      )

      fireEvent.click(
        screen.getByRole('button', { name: 'Categorizar a mano' })
      )
      await select('b')

      expect(
        screen.queryByRole('dialog', { name: 'Elegir categoría' })
      ).toBeNull()
    })

    it('with a match: categorizes, and Deshacer puts the row back', async () => {
      seed([
        tx('Devoto Supermercado', {
          category: undefined,
          categoryConfidence: undefined,
        }),
      ])
      await select('Devoto Supermercado')
      const dialog = await openPicker()

      await userEvent.click(
        within(dialog).getByRole('button', { name: /Volver a sugerir/ })
      )

      await visible(screen.findByText('1 transacción categorizada'))
      expect(stored('Devoto Supermercado')?.category).toBe('groceries')

      await deshacer()

      await visible(screen.findByText('Se deshizo el cambio'))
      expect(stored('Devoto Supermercado')?.category ?? null).toBeNull()
      expect(repo.row('Devoto Supermercado')?.category ?? null).toBeNull()
    })

    it('shows Sugiriendo… disabled while it runs', async () => {
      seed([
        tx('Devoto Supermercado', {
          category: undefined,
          categoryConfidence: undefined,
        }),
      ])
      await select('Devoto Supermercado')
      const dialog = await openPicker()
      const gate = repo.hold('update')

      await userEvent.click(
        within(dialog).getByRole('button', { name: /Volver a sugerir/ })
      )

      expect(
        await screen.findByRole('button', { name: /Sugiriendo/ })
      ).toBeDisabled()
      await act(async () => gate.release())
      await visible(screen.findByText('1 transacción categorizada'))
    })
  })

  describe('review round 1', () => {
    const rowBadge = (description: string) =>
      screen.getAllByRole('button', {
        name: (name) => name.startsWith(`Categoría de ${description}:`),
      })[0]

    async function pickInRow(description: string, label: string) {
      await userEvent.click(rowBadge(description))
      await userEvent.click(
        within(
          await screen.findByRole('dialog', { name: 'Elegir categoría' })
        ).getByRole('button', { name: label })
      )
    }

    const noMatchRow = () =>
      tx('Comercio Inventado XYZ', {
        type: 'credit',
        category: undefined,
        categoryConfidence: undefined,
      })

    async function noContarAll(ids: string[]) {
      await select(...ids)
      await userEvent.click(barButton('No contar'))
      await visible(
        screen.findByText(
          `${ids.length} transacciones no cuentan en los totales`
        )
      )
    }

    it('Categorizar a mano does nothing while another write runs', async () => {
      seed([noMatchRow()])
      await select('Comercio Inventado XYZ')
      const dialog = await openPicker()
      await userEvent.click(
        within(dialog).getByRole('button', { name: /Volver a sugerir/ })
      )
      await visible(screen.findByText('Sin coincidencias'))
      const gate = repo.hold('update')
      await userEvent.click(barButton('No contar'))
      await waitFor(() => expect(barButton('No contar')).toBeDisabled())

      fireEvent.click(
        screen.getByRole('button', { name: 'Categorizar a mano' })
      )

      expect(
        screen.queryByRole('dialog', { name: 'Elegir categoría' })
      ).toBeNull()
      await act(async () => gate.release())
      await visible(screen.findByText('1 transacción no cuenta en los totales'))
      expect(repo.requests.update).toBe(1)
    })

    it('locks the selected rows’ pickers while the bulk write runs', async () => {
      seed([tx('a'), tx('b')])
      await select('a', 'b')
      const dialog = await openPicker()
      const gate = repo.hold('update')
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Entretenimiento' })
      )

      await waitFor(() =>
        expect(rowBadge('a')).toHaveAttribute('aria-disabled', 'true')
      )
      await userEvent.click(rowBadge('a'))
      expect(
        screen.queryByRole('dialog', { name: 'Elegir categoría' })
      ).toBeNull()

      await act(async () => gate.release())
      await visible(screen.findByText('2 transacciones categorizadas'))
      await waitFor(() =>
        expect(rowBadge('a')).not.toHaveAttribute('aria-disabled')
      )
    })

    it('Deshacer leaves a row alone that was picked away and back', async () => {
      seed([tx('a'), tx('b')])
      await select('a', 'b')
      const dialog = await openPicker()
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Entretenimiento' })
      )
      const bulk = (
        await visible(screen.findByText('2 transacciones categorizadas'))
      ).closest('[data-sonner-toast]') as HTMLElement
      await pickInRow('a', 'Restaurantes')
      await waitFor(() => expect(stored('a')?.category).toBe('restaurants'))
      await pickInRow('a', 'Entretenimiento')
      await waitFor(() => expect(stored('a')?.category).toBe('entertainment'))

      fireEvent.click(within(bulk).getByRole('button', { name: 'Deshacer' }))

      await visible(screen.findByText('Se deshizo el cambio'))
      expect(stored('b')?.category).toBe('groceries')
      expect(stored('a')?.category).toBe('entertainment')
      expect(
        screen.getByText('1 cambió mientras tanto y quedó como está')
      ).toBeInTheDocument()
    })

    it('withdraws the bulk toast when the view goes away', async () => {
      const { unmount } = seed([tx('a'), tx('b')])
      await select('a', 'b')
      const dialog = await openPicker()
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Entretenimiento' })
      )
      await visible(screen.findByText('2 transacciones categorizadas'))

      unmount()

      await waitFor(() =>
        expect(screen.queryByText('2 transacciones categorizadas')).toBeNull()
      )
    })

    it('a row deleted mid-write is not offered, and one deleted before Reintentar is skipped', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      seed([
        tx('a', { category: 'groceries', categoryConfidence: 0.8 }),
        tx('b', { category: 'restaurants', categoryConfidence: 0.6 }),
        tx('c', { category: 'shopping', categoryConfidence: 0.7 }),
      ])
      await noContarAll(['a', 'b', 'c'])
      for (const failing of ['b', 'c']) {
        repo.failOn('update', {
          when: (ids) => ids.includes(failing),
          times: 1,
          error: new Error('timeout'),
        })
      }

      await deshacer()

      await visible(screen.findByText('Se actualizaron 1 de 3 — reintentar'))
      await act(async () => {
        await deleteTransactions(repo, ['b'])
      })
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

      await visible(screen.findByText('Cambios guardados'))
      expect(stored('c')).toMatchObject({
        category: 'shopping',
        categoryConfidence: 0.7,
      })
    })

    it('a guarded Reintentar refuses to overwrite a row re-categorized meanwhile', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      seed([
        tx('a', { category: 'groceries', categoryConfidence: 0.8 }),
        tx('b', { category: 'restaurants', categoryConfidence: 0.6 }),
      ])
      await noContarAll(['a', 'b'])
      repo.failOn('update', {
        when: (ids) => ids.includes('b'),
        times: 1,
        error: new Error('timeout'),
      })
      await deshacer()
      await visible(screen.findByText('Se actualizaron 1 de 2 — reintentar'))
      await act(async () => {
        await editTransaction(repo, 'b', {
          category: 'groceries',
          applyScope: 'single',
        })
      })

      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

      await visible(
        screen.findByText(
          'Mientras tanto cambiaron estas transacciones; no se deshizo.'
        )
      )
      expect(stored('b')?.category).toBe('groceries')
      expect(repo.row('b')?.category).toBe('groceries')
    })

    it('Deshacer stays silent after another account signed in', async () => {
      seed([tx('a'), tx('b')])
      await noContarAll(['a', 'b'])
      const updates = repo.requests.update

      act(() => {
        workspaceStore.setState({ userId: 'someone-else' })
      })
      await deshacer()
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(screen.queryByText('Se deshizo el cambio')).toBeNull()
      expect(screen.queryByText(/Mientras tanto/)).toBeNull()
      expect(repo.requests.update).toBe(updates)
      expect(repo.row('a')?.category).toBe('ignored')
    })

    it('a bulk write withdraws an in-place toast’s Deshacer first', async () => {
      seed([tx('a'), tx('b')])
      await pickInRow('a', 'Restaurantes')
      await visible(screen.findByText('Restaurantes en esta transacción'))
      const gate = repo.hold('update')

      await select('a')
      await userEvent.click(barButton('No contar'))

      await waitFor(() =>
        expect(
          screen.queryByText('Restaurantes en esta transacción')
        ).toBeNull()
      )
      await act(async () => gate.release())
    })

    it('hides Etiquetas and Volver a sugerir when the view cannot do them', async () => {
      repo = createInMemoryRepository({ transactions: [tx('a')] })
      transactionStore.getState().setTransactions([tx('a')])
      workspaceStore.setState({ userId: repo.userId, status: 'ready' })
      render(
        <Transactions
          transactions={[tx('a')]}
          initialFilters={{ ...DEFAULT_URL_FILTERS, period: { mode: 'all' } }}
        />
      )
      await select('a')

      expect(
        within(group()).queryByRole('button', { name: 'Etiquetas' })
      ).toBeNull()
      const dialog = await openPicker()
      expect(
        within(dialog).queryByRole('button', { name: /Volver a sugerir/ })
      ).toBeNull()
    })
  })

  describe('review round 2', () => {
    const rowBadge = (description: string) =>
      screen.getAllByRole('button', {
        name: (name) => name.startsWith(`Categoría de ${description}:`),
      })[0]

    async function pickInRow(description: string, label: string) {
      await userEvent.click(rowBadge(description))
      await userEvent.click(
        within(
          await screen.findByRole('dialog', { name: 'Elegir categoría' })
        ).getByRole('button', { name: label })
      )
    }

    async function categorizeAll(ids: string[]) {
      await select(...ids)
      const dialog = await openPicker()
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Entretenimiento' })
      )
      await visible(
        screen.findByText(`${ids.length} transacciones categorizadas`)
      )
    }

    it('locks the rows’ pickers while Deshacer restores them', async () => {
      seed([tx('a'), tx('b')])
      await categorizeAll(['a', 'b'])
      const gate = repo.hold('update')

      await deshacer()

      await waitFor(() =>
        expect(rowBadge('a')).toHaveAttribute('aria-disabled', 'true')
      )
      await act(async () => gate.release())
      await visible(screen.findByText('Se deshizo el cambio'))
      await waitFor(() =>
        expect(rowBadge('a')).not.toHaveAttribute('aria-disabled')
      )
    })

    it('Reintentar of a partial restore leaves a row picked away and back alone', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      seed([
        tx('a', { category: 'groceries', categoryConfidence: 0.8 }),
        tx('b', { category: 'restaurants', categoryConfidence: 0.6 }),
      ])
      await categorizeAll(['a', 'b'])
      repo.failOn('update', {
        when: (ids) => ids.includes('b'),
        times: 1,
        error: new Error('timeout'),
      })
      await deshacer()
      await visible(screen.findByText('Se actualizaron 1 de 2 — reintentar'))
      await pickInRow('b', 'Compras')
      await waitFor(() => expect(stored('b')?.category).toBe('shopping'))
      await pickInRow('b', 'Entretenimiento')
      await waitFor(() => expect(stored('b')?.category).toBe('entertainment'))

      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

      await visible(
        screen.findByText(
          'Mientras tanto cambiaron estas transacciones; no se deshizo.'
        )
      )
      expect(stored('b')?.category).toBe('entertainment')
    })

    it('Volver a sugerir offers Deshacer only for rows it saved', async () => {
      seed([
        tx('Devoto Supermercado', {
          category: undefined,
          categoryConfidence: undefined,
        }),
        tx('Otro', { category: 'groceries', categoryConfidence: 1 }),
      ])
      await select('Devoto Supermercado', 'Otro')
      const dialog = await openPicker()
      const gate = repo.hold('update')
      await userEvent.click(
        within(dialog).getByRole('button', { name: /Volver a sugerir/ })
      )
      await act(async () => {
        await editTransaction(repo, 'Otro', {
          category: 'restaurants',
          applyScope: 'single',
        })
      })
      await act(async () => gate.release())
      await visible(screen.findByText('1 transacción categorizada'))

      await deshacer()

      await visible(screen.findByText('Se deshizo el cambio'))
      expect(stored('Devoto Supermercado')?.category ?? null).toBeNull()
      expect(stored('Otro')?.category).toBe('restaurants')
      expect(screen.queryByText(/mientras tanto/)).toBeNull()
    })

    it('does not start a bulk write on rows with a write in flight', async () => {
      seed([tx('a'), tx('b')])
      await select('a')
      const gate = repo.hold('update')
      await pickInRow('a', 'Restaurantes')

      await waitFor(() => expect(barButton('No contar')).toBeDisabled())
      expect(barButton('Categorizar')).toBeDisabled()
      expect(barButton('Eliminar')).toBeDisabled()
      await act(async () => gate.release())

      await waitFor(() => expect(barButton('No contar')).toBeEnabled())
      expect(repo.requests.update).toBe(1)
    })

    it('a row deleted during the write is not offered for Deshacer', async () => {
      seed([tx('a'), tx('b')])
      await select('b')
      const dialog = await openPicker()
      const gate = repo.hold('update')
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Entretenimiento' })
      )
      await act(async () => {
        await deleteTransactions(repo, ['b'])
      })
      await act(async () => gate.release())
      await waitFor(() =>
        expect(document.querySelector('[data-sonner-toast]')).not.toBeNull()
      )

      expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull()
    })
  })
})

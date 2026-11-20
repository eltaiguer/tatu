import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
import { resolveCategory } from '../../services/categories/category-registry'
import type { Transaction } from '../../models'
import {
  editTransaction,
  restoreCategories,
} from '../../services/mutations/transaction-mutations'
import { buildDescriptionOverrideKey } from '../../services/descriptions/normalization'
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
import {
  merchantKeyOf,
  rawMerchantKey,
} from '../../services/merchants/merchant-key'
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

// Sonner's toasts are global: one test's must not outlive it into the next
// test's Toaster.
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
  render(<Toaster />)
  return render(
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

async function pick(description: string, label: string, which = 0) {
  await userEvent.click(badge(description, which))
  await userEvent.click(
    within(
      await screen.findByRole('dialog', { name: 'Elegir categoría' })
    ).getByRole('button', { name: label })
  )
}

// Sonner mounts a toast invisible and flips it a tick later (and shows at
// most three at once): wait for it to be visible, don't assert on arrival.
async function visible(element: HTMLElement | Promise<HTMLElement>) {
  const el = await element
  await waitFor(() => expect(el).toBeVisible())
  return el
}

const NAME = 'Devoto Supermercado'
const trio = (overrides: Partial<Transaction> = {}) =>
  ['d1', 'd2', 'd3'].map((id) => tx(id, { description: NAME, ...overrides }))

const groceries = resolveCategory('groceries').label
const restaurants = resolveCategory('restaurants').label
const hints = () => screen.queryAllByTitle(/^Otra/)

async function openEdit() {
  await act(async () => {
    fireEvent.click(
      screen.getAllByRole('button', { name: `Editar ${NAME}` })[0]
    )
  })
}
async function pickInDialog(label: string) {
  const dialog = await screen.findByRole('dialog', {
    name: 'Editar transacción',
  })
  fireEvent.click(within(dialog).getByLabelText('Categoría dropdown'))
  // The picker's list is a popover, outside the dialog's own subtree.
  fireEvent.click(await screen.findByRole('button', { name: label }))
}
const scope = (name: string | RegExp) =>
  fireEvent.click(
    within(
      screen.getByRole('group', { name: 'Aplicar nombre y categoría a' })
    ).getByLabelText(name)
  )
async function saveDialog() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  })
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Editar transacción' })
    ).toBeNull()
  )
}
// Edit d1 alone into `label`.
async function editFirstSolo(label: string) {
  await openEdit()
  await pickInDialog(label)
  scope('Solo esta transacción')
  await saveDialog()
}

describe('merchant split across categories (#281)', () => {
  it('shows no hint before anything is edited', () => {
    seed(trio())
    expect(hints()).toHaveLength(0)
  })

  it('offers to unify after a Solo esta save, and shows ≠ on every row', async () => {
    seed(trio())

    await editFirstSolo(restaurants)

    const saved = await visible(screen.findByText('Cambios guardados'))
    const toastEl = saved.closest('[data-sonner-toast]') as HTMLElement
    expect(
      within(toastEl).getByText(`Otras 2 de ${NAME} están en ${groceries}`)
    ).toBeInTheDocument()
    expect(
      within(toastEl).getByRole('button', { name: 'Aplicar a las 2 similares' })
    ).toBeInTheDocument()
    // The row and the card each show it: d1 once per view, d2 and d3 too.
    expect(
      screen.getAllByTitle(`Otras 2 de ${NAME} están en ${groceries}`)
    ).toHaveLength(2)
    expect(
      screen.getAllByTitle(`Otra de ${NAME} está en ${restaurants}`)
    ).toHaveLength(4)
  })

  it('Aplicar a las 2 similares unifies the merchant and the ≠ goes away', async () => {
    seed(trio())
    await editFirstSolo(restaurants)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Aplicar a las 2 similares' })
    )

    await visible(screen.findByText('Se aplicó a 2 transacciones'))
    for (const id of ['d1', 'd2', 'd3']) {
      expect(repo.row(id)).toMatchObject({
        category: 'restaurants',
        categoryConfidence: 1,
      })
    }
    expect(repo.categoryOverrides.size).toBe(1)
    await waitFor(() => expect(hints()).toHaveLength(0))
  })

  it('the default Todas save leaves no ≠ and no offer', async () => {
    seed(trio({ categoryConfidence: 0.9 }))

    await openEdit()
    await pickInDialog(restaurants)
    await saveDialog()

    await visible(screen.findByText('Cambios aplicados a 3 transacciones'))
    expect(hints()).toHaveLength(0)
    expect(
      screen.queryByRole('button', { name: /^Aplicar a/ })
    ).not.toBeInTheDocument()
  })

  it('offers nothing when the others already have that category', async () => {
    seed([
      tx('d1', { description: NAME }),
      tx('d2', { description: NAME, category: 'restaurants' }),
      tx('d3', { description: NAME, category: 'restaurants' }),
    ])

    await editFirstSolo(restaurants)

    await visible(screen.findByText('Cambios guardados'))
    expect(
      screen.queryByRole('button', { name: /^Aplicar a/ })
    ).not.toBeInTheDocument()
  })

  it('offers nothing for a lone merchant', async () => {
    seed([tx('d1', { description: NAME })])

    await openEdit()
    await pickInDialog(restaurants)
    await saveDialog()

    await visible(screen.findByText('Cambios guardados'))
    expect(
      screen.queryByRole('button', { name: /^Aplicar a/ })
    ).not.toBeInTheDocument()
  })

  it('offers to categorize the uncategorized rest, without a ≠', async () => {
    seed(trio({ category: undefined, categoryConfidence: undefined }))

    await editFirstSolo(groceries)

    await visible(screen.findByText('Cambios guardados'))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Aplicar a las 2 similares' })
    )
    await waitFor(() =>
      expect(['d1', 'd2', 'd3'].map((id) => repo.row(id)?.category)).toEqual([
        'groceries',
        'groceries',
        'groceries',
      ])
    )
    expect(hints()).toHaveLength(0)
  })

  it('a dialog save withdraws an older in-place toast', async () => {
    seed(trio().map((t) => (t.id === 'd2' ? { ...t, tags: ['viaje'] } : t)))
    await pick(NAME, restaurants)
    await visible(screen.findByRole('button', { name: 'Deshacer' }))

    await openEdit()
    fireEvent.click(screen.getByLabelText('Etiquetas dropdown'))
    fireEvent.click(await screen.findByRole('button', { name: 'viaje' }))
    await saveDialog()

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Deshacer' })
      ).not.toBeInTheDocument()
    )
  })

  it('offers nothing for a rename alone', async () => {
    seed(
      trio({ category: 'restaurants' }).map((t, i) =>
        i ? t : { ...t, category: 'groceries' }
      )
    )

    await openEdit()
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Devoto Centro' },
    })
    scope('Solo esta transacción')
    await saveDialog()

    await visible(screen.findByText('Cambios guardados'))
    expect(
      screen.queryByRole('button', { name: /^Aplicar a/ })
    ).not.toBeInTheDocument()
  })

  it('an in-place badge pick that splits the merchant shows the ≠ too', async () => {
    seed(trio())

    await pick(NAME, restaurants)

    await waitFor(() => expect(hints().length).toBeGreaterThan(0))
  })

  it('keeps the rows’ own names when only the category changes (Todas)', async () => {
    seed(
      ['d1', 'd2', 'd3'].map((id) =>
        tx(id, {
          description: NAME,
          displayDescription: `Nombre ${id}`,
          categoryConfidence: 0.9,
        })
      )
    )

    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Editar Nombre d1' })[0]
      )
    })
    await pickInDialog(restaurants)
    await saveDialog()

    await waitFor(() => expect(repo.row('d3')?.category).toBe('restaurants'))
    for (const id of ['d1', 'd2', 'd3']) {
      expect(repo.row(id)?.displayDescription).toBe(`Nombre ${id}`)
    }
  })

  it('does not default to Todas over a hand-set different category', async () => {
    seed([
      tx('d1', { description: NAME, categoryConfidence: 0.9 }),
      tx('d2', { description: NAME, category: 'transport' }),
      tx('d3', { description: NAME, categoryConfidence: 0.9 }),
    ])

    await openEdit()
    await pickInDialog(restaurants)
    await saveDialog()

    await visible(screen.findByText('Cambios guardados'))
    expect(repo.row('d3')?.category).toBe('groceries')
  })

  it('offers nothing when a similar row is a transfer', async () => {
    seed([
      tx('d1', { description: NAME }),
      tx('d2', { description: NAME }),
      tx('d3', { description: NAME, category: 'internal_transfer' }),
    ])

    await editFirstSolo(restaurants)

    await visible(screen.findByText('Cambios guardados'))
    expect(
      screen.queryByRole('button', { name: /^Aplicar a/ })
    ).not.toBeInTheDocument()
  })

  it('offers nothing when a similar row is a split parent', async () => {
    seed([
      tx('d1', { description: NAME }),
      tx('d2', { description: NAME }),
      tx('p', { description: NAME, isSplitParent: true }),
    ])

    await editFirstSolo(restaurants)

    await visible(screen.findByText('Cambios guardados'))
    expect(
      screen.queryByRole('button', { name: /^Aplicar a/ })
    ).not.toBeInTheDocument()
  })

  it('offers nothing after future_matching_only', async () => {
    seed(trio())

    await openEdit()
    await pickInDialog(restaurants)
    scope('Esta y las que importes en el futuro')
    await saveDialog()

    await visible(screen.findByText('Cambios guardados'))
    expect(
      screen.queryByRole('button', { name: /^Aplicar a/ })
    ).not.toBeInTheDocument()
  })

  it('putting the name back to the original under Todas clears the row’s own name', async () => {
    seed([
      tx('d1', {
        description: NAME,
        displayDescription: 'Foo',
        categoryConfidence: 0.9,
      }),
      tx('d2', { description: NAME, categoryConfidence: 0.9 }),
    ])

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Editar Foo' })[0])
    })
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: NAME },
    })
    await pickInDialog(restaurants)
    await saveDialog()

    await waitFor(() => expect(repo.row('d2')?.category).toBe('restaurants'))
    expect(repo.row('d1')?.displayDescription).toBeUndefined()
  })

  it('offers nothing when the merchant has a refund in another category', async () => {
    seed([
      tx('d1', { description: NAME, categoryConfidence: 0.9 }),
      tx('d2', { description: NAME, categoryConfidence: 0.9 }),
      tx('r', {
        description: NAME,
        type: 'credit',
        category: 'income',
        categoryConfidence: 0.9,
      }),
    ])

    await editFirstSolo(restaurants)

    await visible(screen.findByText('Cambios guardados'))
    expect(
      screen.queryByRole('button', { name: /^Aplicar a/ })
    ).not.toBeInTheDocument()
  })
})

describe('the name field opens with the row label (#296)', () => {
  const RAW =
    'COMPRA CON TARJETA DEBITO TINTORERIA MARTINIZI, MONTEVIDEO TARJ: ############9172'
  const LABEL = 'Tintoreria Martinizi'
  const bankTrio = () =>
    ['d1', 'd2', 'd3'].map((id) =>
      tx(id, { description: RAW, categoryConfidence: 0.9 })
    )
  async function openLabelled(name: string) {
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('button', { name: `Editar ${name}` })[0]
      )
    })
  }

  it('saving only a category (Solo esta) stores no rename and keeps the merchant key', async () => {
    seed(bankTrio())

    await openLabelled(LABEL)
    expect(screen.getByLabelText('Descripción edición')).toHaveValue(LABEL)
    await pickInDialog(restaurants)
    scope('Solo esta transacción')
    await saveDialog()

    await waitFor(() => expect(repo.row('d1')?.category).toBe('restaurants'))
    expect(repo.row('d1')?.displayDescription).toBeUndefined()
    expect(repo.descriptionOverrides.size).toBe(0)
    const stored = transactionStore
      .getState()
      .transactions.find((t) => t.id === 'd1')!
    expect(stored.displayDescription).toBeUndefined()
    expect(merchantKeyOf(stored)).toBe(rawMerchantKey(RAW))
  })

  it('saving only a category under the default scope renames nobody', async () => {
    seed(bankTrio())

    await openLabelled(LABEL)
    expect(screen.getByLabelText('Descripción edición')).toHaveValue(LABEL)
    await pickInDialog(restaurants)
    expect(
      within(
        screen.getByRole('group', { name: 'Aplicar nombre y categoría a' })
      ).getByLabelText(/^Todas las similares/)
    ).toBeChecked()
    await saveDialog()

    await waitFor(() => expect(repo.row('d3')?.category).toBe('restaurants'))
    for (const id of ['d1', 'd2', 'd3']) {
      expect(repo.row(id)?.category).toBe('restaurants')
      expect(repo.row(id)?.displayDescription).toBeUndefined()
    }
    expect(repo.descriptionOverrides.size).toBe(0)
  })

  it('typing the statement text back clears the row’s own name under Todas', async () => {
    seed([
      tx('d1', {
        description: RAW,
        displayDescription: 'Foo',
        categoryConfidence: 0.9,
      }),
      tx('d2', { description: RAW, categoryConfidence: 0.9 }),
    ])

    await openLabelled('Foo')
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: RAW },
    })
    await pickInDialog(restaurants)
    await saveDialog()

    await waitFor(() => expect(repo.row('d2')?.category).toBe('restaurants'))
    expect(repo.row('d1')?.displayDescription).toBeUndefined()
  })

  it('typing the statement text back clears the row’s own name under Solo esta', async () => {
    seed([
      tx('d1', {
        description: RAW,
        displayDescription: 'Foo',
        categoryConfidence: 0.9,
      }),
      tx('d2', {
        description: RAW,
        displayDescription: 'Bar',
        categoryConfidence: 0.9,
      }),
    ])

    await openLabelled('Foo')
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: RAW },
    })
    await pickInDialog(restaurants)
    scope('Solo esta transacción')
    await saveDialog()

    await waitFor(() => expect(repo.row('d1')?.category).toBe('restaurants'))
    expect(repo.row('d1')?.displayDescription).toBeUndefined()
    expect(repo.row('d2')?.displayDescription).toBe('Bar')
  })

  it('the original name over a live override: the dialog’s N, the toast and the write count the named parts', async () => {
    replaceDescriptionOverrides({
      [buildDescriptionOverrideKey(RAW)!]: {
        descriptionOriginal: RAW,
        friendlyDescription: 'Lavadero',
        updatedAt: '',
      },
    })
    seed([
      tx('d1', { description: RAW, categoryConfidence: 0.9 }),
      tx('d2', { description: RAW, categoryConfidence: 0.9 }),
      tx('part', {
        description: RAW,
        splitParentId: 'd1',
        categoryConfidence: 0.9,
      }),
    ])

    await openLabelled('Lavadero')
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: LABEL },
    })
    await pickInDialog(restaurants)
    scope(/^Todas las similares/)
    expect(
      screen.getByLabelText(/se aplica a 3 transacciones/)
    ).toBeInTheDocument()
    await saveDialog()

    await visible(screen.findByText(/3 transacciones/))
  })
})

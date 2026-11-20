import { beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { Toaster } from 'sonner'
import { Categories } from './Categories'
import type { Transaction } from '../models'
import {
  addCustomCategory,
  listCustomCategories,
  replaceCustomCategories,
  setCategoryHouseholdWithSync,
} from '../services/categories/category-store'
import {
  addCustomPattern,
  clearAllCustomPatterns,
  listCustomPatterns,
} from '../services/categorizer/custom-patterns'
import { replaceDescriptionOverrides } from '../services/descriptions/description-overrides'
import { replaceMerchantCategoryOverrides } from '../services/categorizer/category-overrides'
import { createInMemoryRepository } from '../services/repository/in-memory-repository'
import { workspaceStore } from '../stores/workspace-state'

// Category and rule changes are saved before they count; these view tests
// get a signed-in user whose (in-memory) server accepts writes.
let repo = createInMemoryRepository()

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2026-01-10T00:00:00.000Z'),
    description: 'sample',
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    category: 'groceries',
    rawData: {},
    ...overrides,
  }
}

function openRuleForm() {
  fireEvent.click(screen.getByRole('button', { name: /Nueva regla/ }))
}

describe('Categories', () => {
  beforeEach(() => {
    clearAllCustomPatterns()
    replaceDescriptionOverrides({})
    replaceMerchantCategoryOverrides({})
    replaceCustomCategories([])
    vi.restoreAllMocks()
    repo = createInMemoryRepository()
    workspaceStore.setState({ userId: repo.userId, status: 'ready' })
  })

  it('renders the page heading and all default categories', () => {
    render(<Categories repository={repo} transactions={[]} />)

    expect(
      screen.getByRole('heading', { name: 'Categorías y reglas' })
    ).toBeInTheDocument()
    expect(screen.getByText('Tus categorías')).toBeInTheDocument()
    expect(screen.getByText('Alimentación')).toBeInTheDocument()
    expect(screen.getByText('Restaurantes')).toBeInTheDocument()
    expect(screen.getByText('Transporte')).toBeInTheDocument()
  })

  it('titles the grid, the rules and the category form as level-2 sections', () => {
    render(<Categories repository={repo} transactions={[]} />)

    expect(
      screen.getByRole('heading', { level: 2, name: 'Tus categorías' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Tus categorías' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Reglas de auto-categorización',
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Reglas del hogar' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Reglas del hogar' })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }))
    expect(
      screen.getByRole('heading', { level: 2, name: 'Nueva categoría' })
    ).toBeInTheDocument()
  })

  it("shows each category's spend and how many expenses make it up", () => {
    const txs = [
      makeTx({ id: '1', category: 'groceries', amount: 100, currency: 'USD' }),
      makeTx({ id: '2', category: 'groceries', amount: 400, currency: 'UYU' }),
      makeTx({ id: '3', category: 'restaurants', amount: 7, currency: 'USD' }),
      // A refund in the same category is not an expense.
      makeTx({
        id: '4',
        category: 'groceries',
        amount: 50,
        currency: 'USD',
        type: 'credit',
      }),
    ]
    render(
      <Categories
        repository={repo}
        transactions={txs}
        homeCurrency="USD"
        fxRate={40}
      />
    )

    expect(screen.getByText(/US\$ 110,00 · 2 gastos/)).toBeInTheDocument()
    expect(screen.getByText(/US\$ 7,00 · 1 gasto$/)).toBeInTheDocument()
  })

  it('lists categories by spend, largest first, ignored ones last', () => {
    const txs = [
      makeTx({ id: '1', category: 'restaurants', amount: 5, currency: 'USD' }),
      makeTx({ id: '2', category: 'groceries', amount: 50, currency: 'USD' }),
    ]
    render(
      <Categories
        repository={repo}
        transactions={txs}
        homeCurrency="USD"
        fxRate={40}
      />
    )

    const names = screen
      .getAllByRole('button', { name: /^Editar categoría/ })
      .map((b) => b.getAttribute('aria-label'))
    expect(names.indexOf('Editar categoría Alimentación')).toBeLessThan(
      names.indexOf('Editar categoría Restaurantes')
    )
    expect(names.indexOf('Editar categoría Restaurantes')).toBeLessThan(
      names.indexOf('Editar categoría Salud')
    )
  })

  it("shows a category's spend as soon as it stops being ignored", async () => {
    render(
      <Categories
        repository={repo}
        transactions={[
          makeTx({
            id: '1',
            category: 'external_transfer',
            amount: 9,
            currency: 'USD',
          }),
        ]}
        homeCurrency="USD"
        fxRate={40}
      />
    )
    // Ignored by default: counted, but no spend.
    expect(screen.queryByText(/US\$ 9,00/)).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Editar categoría Transferencias externas',
      })
    )
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Ignorar en totales/ })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText(/US\$ 9,00 · 1 gasto/)).toBeInTheDocument()
  })

  it('gives a deleted category that still has expenses its own card', () => {
    render(
      <Categories
        repository={repo}
        transactions={[
          makeTx({
            id: '1',
            category: 'cafe-viejo',
            amount: 3,
            currency: 'USD',
          }),
        ]}
        homeCurrency="USD"
        fxRate={40}
      />
    )

    expect(screen.getByText('sin definir')).toBeInTheDocument()
    expect(screen.getByText(/US\$ 3,00 · 1 gasto/)).toBeInTheDocument()
  })

  it('excludes the inert split-parent row from the transaction count', () => {
    const txs = [
      makeTx({ id: '1', category: 'groceries', isSplitParent: true }),
      makeTx({ id: '1_split_0', category: 'groceries', splitParentId: '1' }),
      makeTx({ id: '1_split_1', category: 'restaurants', splitParentId: '1' }),
    ]
    render(
      <Categories
        repository={repo}
        transactions={txs}
        homeCurrency="UYU"
        fxRate={40}
      />
    )

    // Each part is one expense; the parent counts nowhere.
    expect(screen.getAllByText(/· 1 gasto$/)).toHaveLength(2)
  })

  it('opens new category form when clicking Nueva categoría', () => {
    render(<Categories repository={repo} transactions={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }))

    expect(screen.getByLabelText('Nombre de categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Color de categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Icono de categoría')).toBeInTheDocument()
  })

  it('creates a new custom category', async () => {
    render(<Categories repository={repo} transactions={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }))

    fireEvent.change(screen.getByLabelText('Nombre de categoría'), {
      target: { value: 'Mascotas' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar categoría' }))

    expect(listCustomCategories()[0].label).toBe('Mascotas')
    // The form closes once the save is confirmed by the server.
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Nombre de categoría')
      ).not.toBeInTheDocument()
    )
  })

  it('edits custom category color and icon', async () => {
    const custom = addCustomCategory({
      label: 'Coffee',
      color: '#ff0000',
      icon: '☕',
    })

    render(
      <Categories
        repository={repo}
        transactions={[makeTx({ category: custom.id })]}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: `Editar categoría ${custom.label}` })
    )

    fireEvent.change(screen.getByLabelText('Color de categoría'), {
      target: { value: '#00ff00' },
    })
    fireEvent.change(screen.getByLabelText('Icono de categoría'), {
      target: { value: '🫖' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(listCustomCategories()[0].color).toBe('#00ff00')
    expect(listCustomCategories()[0].icon).toBe('🫖')
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Nombre de categoría')
      ).not.toBeInTheDocument()
    )
  })

  it('deletes a custom category', async () => {
    const custom = addCustomCategory({
      label: 'Yoga',
      color: '#aabbcc',
      icon: '🧘',
    })
    expect(listCustomCategories()).toHaveLength(1)

    render(<Categories repository={repo} transactions={[]} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Eliminar categoría ${custom.label}` })
    )

    expect(listCustomCategories()).toHaveLength(0)
    await waitFor(() =>
      expect(
        screen.queryByRole('button', {
          name: `Eliminar categoría ${custom.label}`,
        })
      ).not.toBeInTheDocument()
    )
  })

  it('adds and removes a pattern rule', async () => {
    render(<Categories repository={repo} transactions={[]} />)
    openRuleForm()

    fireEvent.change(screen.getByPlaceholderText(/Ej\. "farmacia"/), {
      target: { value: 'farmashop' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar regla' }))

    await screen.findByText(/"farmashop"/)

    const removeBtn = screen.getByRole('button', {
      name: 'Eliminar regla farmashop',
    })
    fireEvent.click(removeBtn)

    // Removed once the server confirms the delete.
    await waitFor(() =>
      expect(screen.queryByText(/"farmashop"/)).not.toBeInTheDocument()
    )
  })

  it("shows how many transactions each rule's pattern matches", () => {
    addCustomPattern({
      pattern: 'uber',
      matchType: 'contains',
      category: 'transport',
    })
    render(
      <Categories
        repository={repo}
        transactions={[
          makeTx({ id: '1', description: 'UBER TRIP' }),
          makeTx({ id: '2', description: 'UBER EATS' }),
          makeTx({ id: '3', description: 'DEVOTO' }),
        ]}
      />
    )

    expect(screen.getByText(/2 transacciones coinciden/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Nueva regla/ })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Agregar regla' })
    ).not.toBeInTheDocument()
  })

  it('reports how many past transactions a new rule was applied to', async () => {
    const onApplyPatternToPast = vi
      .fn()
      .mockResolvedValue({ updated: 3, failed: 0 })
    render(
      <>
        <Categories
          repository={repo}
          transactions={[]}
          onApplyPatternToPast={onApplyPatternToPast}
        />
        <Toaster />
      </>
    )

    openRuleForm()
    fireEvent.change(screen.getByPlaceholderText(/Ej\. "farmacia"/), {
      target: { value: 'farmashop' },
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Pasadas y futuras' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar regla' }))

    expect(
      await screen.findByText('Regla creada · aplicada a 3 transacciones')
    ).toBeInTheDocument()
  })

  it('says how many past transactions failed instead of claiming success', async () => {
    const onApplyPatternToPast = vi
      .fn()
      .mockResolvedValue({ updated: 2, failed: 1 })
    render(
      <>
        <Categories
          repository={repo}
          transactions={[]}
          onApplyPatternToPast={onApplyPatternToPast}
        />
        <Toaster />
      </>
    )

    openRuleForm()
    fireEvent.change(screen.getByPlaceholderText(/Ej\. "farmacia"/), {
      target: { value: 'farmashop' },
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Pasadas y futuras' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar regla' }))

    expect(
      await screen.findByText(/Se aplicó a 2 de 3 transacciones/)
    ).toBeInTheDocument()
  })

  it('confirms a new category only after it is saved', async () => {
    render(
      <>
        <Categories repository={repo} transactions={[]} />
        <Toaster />
      </>
    )
    fireEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }))
    fireEvent.change(screen.getByLabelText('Nombre de categoría'), {
      target: { value: 'Viajes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar categoría' }))

    expect(
      await screen.findByText('Categoría "Viajes" creada')
    ).toBeInTheDocument()
  })

  it('opens the uncategorized transactions from "Sin categoría"', () => {
    const onNavigateToTransactions = vi.fn()
    render(
      <Categories
        repository={repo}
        transactions={[
          makeTx({ id: 'a', category: undefined }),
          makeTx({ id: 'b', category: '' }),
        ]}
        onNavigateToTransactions={onNavigateToTransactions}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Revisar 2' }))
    expect(onNavigateToTransactions).toHaveBeenCalledWith({
      categories: ['uncategorized'],
    })
  })

  it('saves the type and category chosen in the rule form', async () => {
    render(<Categories repository={repo} transactions={[]} />)
    openRuleForm()

    fireEvent.change(screen.getByPlaceholderText(/Ej\. "farmacia"/), {
      target: { value: 'uber' },
    })
    fireEvent.change(screen.getByLabelText('Tipo'), {
      target: { value: 'starts_with' },
    })
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'transport' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Agregar regla/ }))

    await waitFor(() =>
      expect(listCustomPatterns()).toEqual([
        expect.objectContaining({
          matchType: 'starts_with',
          category: 'transport',
        }),
      ])
    )
  })

  it('exposes which scope is selected to assistive tech', () => {
    render(<Categories repository={repo} transactions={[]} />)
    openRuleForm()

    const group = screen.getByRole('group', { name: 'Aplicar a' })
    expect(
      within(group).getByRole('radio', { name: 'Solo futuras' })
    ).toBeChecked()
    fireEvent.click(
      within(group).getByRole('radio', { name: 'Pasadas y futuras' })
    )
    expect(
      within(group).getByRole('radio', { name: 'Pasadas y futuras' })
    ).toBeChecked()
  })

  describe('rules: collapsed form, Editar and "Aplicar a las N" (#287)', () => {
    const rulesRegion = () =>
      screen.getByRole('region', { name: 'Reglas de auto-categorización' })
    const patternInput = () =>
      within(rulesRegion()).getByPlaceholderText(/Ej\. "farmacia"/)
    const uber = () =>
      addCustomPattern({
        pattern: 'uber',
        matchType: 'starts_with',
        category: 'transport',
        description: 'Uber',
      })
    const uberRows = [
      makeTx({ id: '1', description: 'UBER TRIP', categoryConfidence: 0.8 }),
      makeTx({ id: '2', description: 'UBER EATS', categoryConfidence: 0.8 }),
      makeTx({
        id: '3',
        description: 'UBER X',
        category: 'transport',
        displayDescription: 'Uber',
        categoryConfidence: 0.8,
      }),
      makeTx({ id: '4', description: 'UBER Y', categoryConfidence: 1 }),
      makeTx({ id: '5', description: 'DEVOTO' }),
    ]
    const renderWithToasts = (
      props: Partial<React.ComponentProps<typeof Categories>> = {}
    ) =>
      render(
        <>
          <Categories repository={repo} transactions={uberRows} {...props} />
          <Toaster />
        </>
      )

    it('hides the form until "Nueva regla" is clicked, then focuses the pattern', () => {
      render(<Categories repository={repo} transactions={[]} />)

      expect(
        within(rulesRegion()).getByText(/No hay reglas personalizadas/)
      ).toBeInTheDocument()
      expect(
        within(rulesRegion()).getByRole('button', { name: /Nueva regla/ })
      ).toBeInTheDocument()
      expect(
        screen.queryByPlaceholderText(/Ej\. "farmacia"/)
      ).not.toBeInTheDocument()

      openRuleForm()

      expect(patternInput()).toHaveFocus()
      expect(
        within(rulesRegion()).getByRole('heading', {
          level: 3,
          name: 'Nueva regla',
        })
      ).toBeInTheDocument()
      expect(
        within(rulesRegion()).queryByRole('button', { name: /Nueva regla/ })
      ).not.toBeInTheDocument()
    })

    it('closes the form with the X and puts focus back on "Nueva regla"', () => {
      render(<Categories repository={repo} transactions={[]} />)
      openRuleForm()

      fireEvent.click(
        within(rulesRegion()).getByRole('button', { name: 'Cancelar' })
      )

      expect(
        screen.queryByPlaceholderText(/Ej\. "farmacia"/)
      ).not.toBeInTheDocument()
      expect(
        within(rulesRegion()).getByRole('button', { name: /Nueva regla/ })
      ).toHaveFocus()
    })

    it('closes the form once a rule is created', async () => {
      renderWithToasts({ transactions: [] })
      openRuleForm()
      fireEvent.change(patternInput(), { target: { value: 'farmashop' } })
      fireEvent.click(screen.getByRole('button', { name: 'Agregar regla' }))

      expect(await screen.findByText('Regla creada')).toBeInTheDocument()
      expect(
        screen.queryByPlaceholderText(/Ej\. "farmacia"/)
      ).not.toBeInTheDocument()
    })

    it('keeps the form open, with its values, when the create fails', async () => {
      repo.failOn('upsertCustomPattern', { error: new Error('timeout') })
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      renderWithToasts({ transactions: [] })
      openRuleForm()
      fireEvent.change(patternInput(), { target: { value: 'farmashop' } })
      fireEvent.click(screen.getByRole('button', { name: 'Agregar regla' }))

      expect(
        await screen.findByText(/No se pudo crear la regla/)
      ).toBeInTheDocument()
      expect(patternInput()).toHaveValue('farmashop')
      expect(logged).toHaveBeenCalled()
    })

    it('reopens the form with the rule\'s values from "Editar"', () => {
      uber()
      render(<Categories repository={repo} transactions={[]} />)

      fireEvent.click(screen.getByRole('button', { name: 'Editar regla uber' }))

      const region = within(rulesRegion())
      expect(
        region.getByRole('heading', { level: 3, name: 'Editar regla' })
      ).toBeInTheDocument()
      expect(patternInput()).toHaveValue('uber')
      expect(region.getByLabelText('Tipo')).toHaveValue('starts_with')
      expect(region.getByLabelText('Categoría')).toHaveValue('transport')
      expect(region.getByLabelText('Descripción (opcional)')).toHaveValue(
        'Uber'
      )
      expect(
        region.getByRole('button', { name: 'Guardar cambios' })
      ).toBeInTheDocument()
      expect(region.getByRole('radio', { name: 'Solo futuras' })).toBeChecked()
    })

    it('saves an edit in place and closes the form', async () => {
      const rule = uber()
      renderWithToasts({ transactions: [] })
      fireEvent.click(screen.getByRole('button', { name: 'Editar regla uber' }))
      fireEvent.change(within(rulesRegion()).getByLabelText('Categoría'), {
        target: { value: 'restaurants' },
      })
      fireEvent.click(
        within(rulesRegion()).getByRole('button', { name: 'Guardar cambios' })
      )

      expect(await screen.findByText('Regla guardada')).toBeInTheDocument()
      expect(listCustomPatterns()).toEqual([
        expect.objectContaining({ id: rule.id, category: 'restaurants' }),
      ])
      expect(
        screen.queryByPlaceholderText(/Ej\. "farmacia"/)
      ).not.toBeInTheDocument()
    })

    it('applies an edited rule to past rows when "Pasadas y futuras" is chosen', async () => {
      const rule = uber()
      const onApplyPatternToPast = vi
        .fn()
        .mockResolvedValue({ updated: 2, failed: 0 })
      renderWithToasts({ transactions: [], onApplyPatternToPast })
      fireEvent.click(screen.getByRole('button', { name: 'Editar regla uber' }))
      fireEvent.click(screen.getByRole('radio', { name: 'Pasadas y futuras' }))
      fireEvent.click(
        within(rulesRegion()).getByRole('button', { name: 'Guardar cambios' })
      )

      expect(
        await screen.findByText('Regla guardada · aplicada a 2 transacciones')
      ).toBeInTheDocument()
      expect(onApplyPatternToPast).toHaveBeenCalledWith(
        expect.objectContaining({ id: rule.id })
      )
    })

    it('counts the rows a rule would change and applies them', async () => {
      const rule = uber()
      const onApplyPatternToPast = vi
        .fn()
        .mockResolvedValue({ updated: 2, failed: 0 })
      renderWithToasts({ onApplyPatternToPast })

      // The pattern matches 4 rows; it would change 2 (one is applied, one
      // was categorized by hand).
      expect(screen.getByText(/4 transacciones coinciden/)).toBeInTheDocument()
      const apply = screen.getByRole('button', {
        name: 'Aplicar regla uber a 2 transacciones',
      })
      expect(apply).toHaveTextContent('Aplicar a las 2')

      fireEvent.click(apply)

      expect(
        await screen.findByText('Regla aplicada a 2 transacciones')
      ).toBeInTheDocument()
      expect(onApplyPatternToPast).toHaveBeenCalledWith(
        expect.objectContaining({ id: rule.id })
      )
    })

    it('shows no apply button when nothing would change, and "Aplicar a 1" for one row', () => {
      uber()
      const onApplyPatternToPast = vi.fn()
      const { unmount } = render(
        <Categories
          repository={repo}
          transactions={[uberRows[2], uberRows[3], uberRows[4]]}
          onApplyPatternToPast={onApplyPatternToPast}
        />
      )
      expect(
        screen.queryByRole('button', { name: /Aplicar regla/ })
      ).not.toBeInTheDocument()
      unmount()

      render(
        <Categories
          repository={repo}
          transactions={[uberRows[0], uberRows[2]]}
          onApplyPatternToPast={onApplyPatternToPast}
        />
      )
      expect(
        screen.getByRole('button', {
          name: 'Aplicar regla uber a 1 transacción',
        })
      ).toHaveTextContent('Aplicar a 1')
    })

    it('says how many rows failed on a partial apply, and reports a rejected apply', async () => {
      uber()
      const onApplyPatternToPast = vi
        .fn()
        .mockResolvedValueOnce({ updated: 1, failed: 1 })
        .mockRejectedValueOnce(new Error('boom'))
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      renderWithToasts({ onApplyPatternToPast })
      const apply = () =>
        screen.getByRole('button', {
          name: 'Aplicar regla uber a 2 transacciones',
        })

      fireEvent.click(apply())
      expect(
        await screen.findByText(
          'Se aplicó a 1 de 2 transacciones; el resto no se pudo guardar.'
        )
      ).toBeInTheDocument()

      await waitFor(() => expect(apply()).toBeEnabled())
      fireEvent.click(apply())
      expect(
        await screen.findByText(/No se pudo aplicar la regla/)
      ).toBeInTheDocument()
      expect(logged).toHaveBeenCalled()
    })

    it('says nothing changed when the apply found no rows to change', async () => {
      uber()
      const onApplyPatternToPast = vi
        .fn()
        .mockResolvedValue({ updated: 0, failed: 0 })
      renderWithToasts({ onApplyPatternToPast })

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Aplicar regla uber a 2 transacciones',
        })
      )

      expect(
        await screen.findByText('Regla aplicada · ninguna transacción cambió')
      ).toBeInTheDocument()
    })

    it('closes the form when the rule being edited is deleted', async () => {
      uber()
      render(<Categories repository={repo} transactions={[]} />)
      fireEvent.click(screen.getByRole('button', { name: 'Editar regla uber' }))
      expect(patternInput()).toBeInTheDocument()

      fireEvent.click(
        screen.getByRole('button', { name: 'Eliminar regla uber' })
      )

      await waitFor(() =>
        expect(
          screen.queryByPlaceholderText(/Ej\. "farmacia"/)
        ).not.toBeInTheDocument()
      )
    })

    describe('review round 1 (#287)', () => {
      const never = () =>
        new Promise<{ updated: number; failed: number }>(() => {})
      const save = () =>
        fireEvent.click(
          within(rulesRegion()).getByRole('button', { name: 'Guardar cambios' })
        )

      it('keeps the rule locked through the apply that follows its save', async () => {
        uber()
        renderWithToasts({ onApplyPatternToPast: vi.fn(never) })
        fireEvent.click(
          screen.getByRole('button', { name: 'Editar regla uber' })
        )
        fireEvent.click(
          screen.getByRole('radio', { name: 'Pasadas y futuras' })
        )
        save()

        await waitFor(() =>
          expect(
            screen.queryByPlaceholderText(/Ej\. "farmacia"/)
          ).not.toBeInTheDocument()
        )
        expect(
          screen.getByRole('button', { name: 'Editar regla uber' })
        ).toBeDisabled()
        expect(
          screen.getByRole('button', { name: 'Eliminar regla uber' })
        ).toBeDisabled()
        expect(
          screen.getByRole('button', { name: /Aplicar regla uber/ })
        ).toBeDisabled()
      })

      it("can't save an edited rule while its apply is running", async () => {
        uber()
        renderWithToasts({ onApplyPatternToPast: vi.fn(never) })
        fireEvent.click(
          screen.getByRole('button', { name: 'Editar regla uber' })
        )
        fireEvent.click(
          screen.getByRole('button', { name: /Aplicar regla uber/ })
        )

        await waitFor(() =>
          expect(
            within(rulesRegion()).getByRole('button', {
              name: 'Guardar cambios',
            })
          ).toBeDisabled()
        )
      })

      it("doesn't close a form opened after a delete that finishes late", async () => {
        uber()
        const gate = repo.hold('deleteCustomPattern')
        renderWithToasts({ transactions: [] })
        fireEvent.click(
          screen.getByRole('button', { name: 'Editar regla uber' })
        )
        fireEvent.click(
          screen.getByRole('button', { name: 'Eliminar regla uber' })
        )
        fireEvent.click(
          within(rulesRegion()).getByRole('button', { name: 'Cancelar' })
        )
        openRuleForm()
        fireEvent.change(patternInput(), { target: { value: 'farmashop' } })

        gate.release()
        expect(await screen.findByText('Regla eliminada')).toBeInTheDocument()

        expect(patternInput()).toHaveValue('farmashop')
      })

      it('says no row changed when the form apply finds nothing to change', async () => {
        renderWithToasts({
          transactions: [],
          onApplyPatternToPast: vi
            .fn()
            .mockResolvedValue({ updated: 0, failed: 0 }),
        })
        openRuleForm()
        fireEvent.change(patternInput(), { target: { value: 'farmashop' } })
        fireEvent.click(
          screen.getByRole('radio', { name: 'Pasadas y futuras' })
        )
        fireEvent.click(screen.getByRole('button', { name: 'Agregar regla' }))

        expect(
          await screen.findByText('Regla creada · ninguna transacción cambió')
        ).toBeInTheDocument()
      })

      it('says no row changed after an edit that finds nothing to change', async () => {
        uber()
        renderWithToasts({
          transactions: [],
          onApplyPatternToPast: vi
            .fn()
            .mockResolvedValue({ updated: 0, failed: 0 }),
        })
        fireEvent.click(
          screen.getByRole('button', { name: 'Editar regla uber' })
        )
        fireEvent.click(
          screen.getByRole('radio', { name: 'Pasadas y futuras' })
        )
        save()

        expect(
          await screen.findByText('Regla guardada · ninguna transacción cambió')
        ).toBeInTheDocument()
      })

      it('uses the singular when a single row failed to apply', async () => {
        renderWithToasts({
          transactions: [],
          onApplyPatternToPast: vi
            .fn()
            .mockResolvedValue({ updated: 0, failed: 1 }),
        })
        openRuleForm()
        fireEvent.change(patternInput(), { target: { value: 'farmashop' } })
        fireEvent.click(
          screen.getByRole('radio', { name: 'Pasadas y futuras' })
        )
        fireEvent.click(screen.getByRole('button', { name: 'Agregar regla' }))

        expect(
          await screen.findByText(/Se aplicó a 0 de 1 transacción;/)
        ).toBeInTheDocument()
      })

      it('keeps an archived category selectable when editing', () => {
        addCustomPattern({
          pattern: 'viaje',
          matchType: 'contains',
          category: 'viajes-viejos',
        })
        render(<Categories repository={repo} transactions={[]} />)

        fireEvent.click(
          screen.getByRole('button', { name: 'Editar regla viaje' })
        )

        const select = within(rulesRegion()).getByLabelText('Categoría')
        expect(select).toHaveValue('viajes-viejos')
        expect(
          within(select).getByRole('option', { name: /viajes viejos/i })
        ).toBeInTheDocument()
      })

      it('keeps the form open and the list unchanged when an edit fails', async () => {
        const rule = uber()
        repo.failOn('upsertCustomPattern', { error: new Error('timeout') })
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
        renderWithToasts({ transactions: [] })
        fireEvent.click(
          screen.getByRole('button', { name: 'Editar regla uber' })
        )
        fireEvent.change(within(rulesRegion()).getByLabelText('Categoría'), {
          target: { value: 'restaurants' },
        })
        save()

        expect(
          await screen.findByText(/No se pudo guardar la regla/)
        ).toBeInTheDocument()
        expect(patternInput()).toBeInTheDocument()
        expect(listCustomPatterns()).toEqual([rule])
        expect(logged).toHaveBeenCalled()
      })
    })

    it('keeps a legacy category id selected when editing', () => {
      addCustomPattern({
        pattern: 'disco',
        matchType: 'contains',
        category: 'food',
      })
      render(<Categories repository={repo} transactions={[]} />)

      fireEvent.click(
        screen.getByRole('button', { name: 'Editar regla disco' })
      )

      expect(within(rulesRegion()).getByLabelText('Categoría')).toHaveValue(
        'groceries'
      )
    })
  })

  describe('household checkbox in the category form (#251)', () => {
    const tile = (label: string) =>
      screen.getByRole('button', { name: `Hogar: ${label}` })
    const box = () => screen.getByRole('checkbox', { name: /^Hogar/ })
    const edit = (label: string) =>
      fireEvent.click(
        screen.getByRole('button', { name: `Editar categoría ${label}` })
      )
    const save = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    const formClosed = () =>
      waitFor(() =>
        expect(
          screen.queryByLabelText('Nombre de categoría')
        ).not.toBeInTheDocument()
      )

    it('says a change by hand wins over the category in the form helper', () => {
      render(<Categories repository={repo} transactions={[]} />)
      fireEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }))

      expect(
        screen.getByText(
          'Sus transacciones cuentan como gastos del hogar, salvo las que cambies a mano.'
        )
      ).toBeInTheDocument()
    })

    it('creates a household category from the form', async () => {
      render(<Categories repository={repo} transactions={[]} />)
      fireEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }))
      expect(box()).not.toBeChecked()
      fireEvent.change(screen.getByLabelText('Nombre de categoría'), {
        target: { value: 'Mascotas' },
      })

      fireEvent.click(box())
      fireEvent.click(screen.getByRole('button', { name: 'Guardar categoría' }))

      await formClosed()
      expect(tile('Mascotas')).toHaveAttribute('aria-pressed', 'true')
      expect(repo.customCategories.get('mascotas')?.isHousehold).toBe(true)
    })

    it('prefills the box from the effective default', () => {
      render(<Categories repository={repo} transactions={[]} />)

      edit('Alimentación')
      expect(box()).toBeChecked()
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      edit('Restaurantes')
      expect(box()).not.toBeChecked()
    })

    it('unchecks a seeded household category (false), and checking it again goes back to the app default (null)', async () => {
      render(<Categories repository={repo} transactions={[]} />)

      edit('Alimentación')
      fireEvent.click(box())
      save()
      await formClosed()
      expect(tile('Alimentación')).toHaveAttribute('aria-pressed', 'false')
      expect(repo.customCategories.get('groceries')?.isHousehold).toBe(false)

      edit('Alimentación')
      expect(box()).not.toBeChecked()
      fireEvent.click(box())
      save()
      await formClosed()
      expect(tile('Alimentación')).toHaveAttribute('aria-pressed', 'true')
      expect(
        repo.customCategories.get('groceries')?.isHousehold
      ).toBeUndefined()
    })

    it('has no household box for Sin categoría or Ingresos', () => {
      render(<Categories repository={repo} transactions={[]} />)

      for (const label of ['Sin categoría', 'Ingresos']) {
        edit(label)
        expect(
          screen.getByRole('checkbox', { name: /Ignorar en totales/ })
        ).toBeInTheDocument()
        expect(
          screen.queryByRole('checkbox', { name: /^Hogar/ })
        ).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      }
    })

    it('has no household box on an ignored category (#261)', () => {
      addCustomCategory({ label: 'Ahorro', color: '#112233', isIgnored: true })
      render(<Categories repository={repo} transactions={[]} />)

      for (const label of [
        'Transferencias externas',
        'Transferencias internas',
        'Ahorro',
      ]) {
        edit(label)
        expect(
          screen.getByRole('checkbox', { name: /Ignorar en totales/ })
        ).toBeChecked()
        expect(
          screen.queryByRole('checkbox', { name: /^Hogar/ })
        ).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      }
    })

    it('hides the box while Ignorar en totales is ticked and shows it again when unticked (#261)', () => {
      render(<Categories repository={repo} transactions={[]} />)
      edit('Restaurantes')
      const ignore = () =>
        screen.getByRole('checkbox', { name: /Ignorar en totales/ })
      expect(box()).toBeInTheDocument()

      fireEvent.click(ignore())
      expect(
        screen.queryByRole('checkbox', { name: /^Hogar/ })
      ).not.toBeInTheDocument()

      fireEvent.click(ignore())
      expect(box()).toBeInTheDocument()
    })

    it('does not save a household change made before ticking Ignorar en totales (#261)', async () => {
      render(<Categories repository={repo} transactions={[]} />)
      edit('Restaurantes')

      fireEvent.click(box())
      fireEvent.click(
        screen.getByRole('checkbox', { name: /Ignorar en totales/ })
      )
      save()

      await formClosed()
      const stored = repo.customCategories.get('restaurants')
      expect(stored?.isIgnored).toBe(true)
      expect(stored?.isHousehold).toBeUndefined()
    })

    it('does not store a household default on a new category created ignored (#261)', async () => {
      render(<Categories repository={repo} transactions={[]} />)
      fireEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }))
      fireEvent.change(screen.getByLabelText('Nombre de categoría'), {
        target: { value: 'Ahorro' },
      })

      fireEvent.click(box())
      fireEvent.click(
        screen.getByRole('checkbox', { name: /Ignorar en totales/ })
      )
      fireEvent.click(screen.getByRole('button', { name: 'Guardar categoría' }))

      await formClosed()
      const stored = repo.customCategories.get('ahorro')
      expect(stored?.isIgnored).toBe(true)
      expect(stored?.isHousehold).toBeFalsy()
    })

    it('leaves the stored default as it was when the box is not touched', async () => {
      await setCategoryHouseholdWithSync(repo, 'groceries', false)
      await setCategoryHouseholdWithSync(repo, 'restaurants', true)
      render(<Categories repository={repo} transactions={[]} />)

      edit('Alimentación')
      save()
      await formClosed()
      edit('Restaurantes')
      save()
      await formClosed()

      expect(repo.customCategories.get('groceries')?.isHousehold).toBe(false)
      expect(repo.customCategories.get('restaurants')?.isHousehold).toBe(true)
    })

    it('keeps a tile flip made while the form was open, when the box is untouched', async () => {
      render(<Categories repository={repo} transactions={[]} />)
      edit('Restaurantes')
      expect(box()).not.toBeChecked()

      fireEvent.click(tile('Restaurantes'))
      await waitFor(() =>
        expect(repo.customCategories.get('restaurants')?.isHousehold).toBe(true)
      )
      save()

      await formClosed()
      expect(tile('Restaurantes')).toHaveAttribute('aria-pressed', 'true')
      expect(repo.customCategories.get('restaurants')?.isHousehold).toBe(true)
    })

    it('an untouched save leaves the stored default alone', async () => {
      // A default saved from another tab: the store has not loaded it.
      repo.customCategories.set('healthcare', {
        id: 'healthcare',
        label: 'healthcare',
        color: '#112233',
        isIgnored: false,
        isHousehold: true,
        isArchived: false,
        createdAt: '',
        updatedAt: '',
      })
      render(<Categories repository={repo} transactions={[]} />)

      edit('Salud')
      save()

      await formClosed()
      expect(repo.customCategories.get('healthcare')?.isHousehold).toBe(true)
    })

    it('blocks Guardar while the tile of the open category is saving', async () => {
      render(<Categories repository={repo} transactions={[]} />)
      edit('Restaurantes')
      const held = repo.hold('upsertCustomCategory')

      fireEvent.click(tile('Restaurantes'))

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Guardar cambios' })
        ).toBeDisabled()
      )
      held.release()
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Guardar cambios' })
        ).toBeEnabled()
      )
    })

    it('shows the new value in the open form after a tile flip, and an untouched save keeps it', async () => {
      render(<Categories repository={repo} transactions={[]} />)
      edit('Restaurantes')
      expect(box()).not.toBeChecked()

      fireEvent.click(tile('Restaurantes'))

      await waitFor(() => expect(box()).toBeChecked())
      save()
      await formClosed()
      expect(repo.customCategories.get('restaurants')?.isHousehold).toBe(true)
    })

    it('leaves a custom category’s default alone when only its name changes', async () => {
      const custom = addCustomCategory({
        label: 'Mascotas',
        color: '#112233',
        isHousehold: true,
      })
      await setCategoryHouseholdWithSync(repo, custom.id, true)
      render(<Categories repository={repo} transactions={[]} />)

      edit('Mascotas')
      expect(box()).toBeChecked()
      fireEvent.change(screen.getByLabelText('Nombre de categoría'), {
        target: { value: 'Perro' },
      })
      save()

      await formClosed()
      expect(tile('Perro')).toHaveAttribute('aria-pressed', 'true')
      expect(repo.customCategories.get(custom.id)?.isHousehold).toBe(true)
    })

    it('clears a custom category’s default when unchecked', async () => {
      const custom = addCustomCategory({ label: 'Mascotas', color: '#112233' })
      await setCategoryHouseholdWithSync(repo, custom.id, true)
      render(<Categories repository={repo} transactions={[]} />)

      edit('Mascotas')
      fireEvent.click(box())
      save()

      await formClosed()
      expect(tile('Mascotas')).toHaveAttribute('aria-pressed', 'false')
      expect(repo.customCategories.get(custom.id)?.isHousehold).toBeUndefined()
    })
  })

  describe('household toggle on each tile (#251)', () => {
    const toggle = (label: string) =>
      screen.getByRole('button', { name: `Hogar: ${label}` })

    function renderWithToasts(transactions: Transaction[] = []) {
      return render(
        <>
          <Categories repository={repo} transactions={transactions} />
          <Toaster />
        </>
      )
    }

    it('explains the house under the section heading', () => {
      render(<Categories repository={repo} transactions={[]} />)

      expect(
        within(
          screen.getByRole('region', { name: 'Tus categorías' })
        ).getByText(
          'El ícono de la casa marca las categorías del hogar; podés cambiarlo en cada transacción.'
        )
      ).toBeInTheDocument()
    })

    it('puts a toggle on every tile, pressed for the household ones', () => {
      render(<Categories repository={repo} transactions={[]} />)

      for (const label of ['Alimentación', 'Servicios', 'Vivienda']) {
        expect(toggle(label)).toHaveAttribute('aria-pressed', 'true')
      }
      expect(toggle('Restaurantes')).toHaveAttribute('aria-pressed', 'false')
    })

    it('has no toggle on Sin categoría, Ingresos or a deleted category', () => {
      render(
        <Categories
          repository={repo}
          transactions={[makeTx({ category: 'viajes-familia' })]}
        />
      )

      expect(screen.getByText('Viajes familia')).toBeInTheDocument()
      for (const label of ['Sin categoría', 'Ingresos', 'Viajes familia']) {
        expect(
          screen.queryByRole('button', { name: `Hogar: ${label}` })
        ).not.toBeInTheDocument()
      }
    })

    it('has no toggle on an ignored category, built-in or custom (#261)', () => {
      addCustomCategory({ label: 'Ahorro', color: '#112233', isIgnored: true })
      render(<Categories repository={repo} transactions={[]} />)

      expect(screen.getByText('Ahorro')).toBeInTheDocument()
      for (const label of [
        'Transferencias externas',
        'Transferencias internas',
        'Ahorro',
      ]) {
        expect(
          screen.queryByRole('button', { name: `Hogar: ${label}` })
        ).not.toBeInTheDocument()
      }
      expect(toggle('Restaurantes')).toBeInTheDocument()
    })

    it('says the state in the tooltip and keeps the name constant', () => {
      render(<Categories repository={repo} transactions={[]} />)

      expect(toggle('Alimentación')).toHaveAttribute('title', 'Hogar: Sí')
      expect(toggle('Restaurantes')).toHaveAttribute('title', 'Hogar: No')
    })

    it('looks like the row house: brand when Hogar, muted outline when No (#265)', () => {
      render(<Categories repository={repo} transactions={[]} />)

      expect(toggle('Alimentación').className).toContain('--brand-text')
      expect(toggle('Restaurantes').className).toContain('--text-muted')
      expect(toggle('Restaurantes').className).not.toContain('--text-faint')
    })

    it('marks a category as household, saves it, and a second click goes back to the app default', async () => {
      renderWithToasts()

      fireEvent.click(toggle('Restaurantes'))

      expect(
        await screen.findByText('Restaurantes: ahora es del hogar')
      ).toBeInTheDocument()
      expect(toggle('Restaurantes')).toHaveAttribute('aria-pressed', 'true')
      expect(repo.customCategories.get('restaurants')?.isHousehold).toBe(true)

      fireEvent.click(toggle('Restaurantes'))

      expect(
        await screen.findByText('Restaurantes: ya no es del hogar')
      ).toBeInTheDocument()
      expect(toggle('Restaurantes')).toHaveAttribute('aria-pressed', 'false')
      expect(
        repo.customCategories.get('restaurants')?.isHousehold
      ).toBeUndefined()
    })

    it('stores false for a household-by-default category, and clears it on the way back', async () => {
      renderWithToasts()

      fireEvent.click(toggle('Alimentación'))

      expect(
        await screen.findByText('Alimentación: ya no es del hogar')
      ).toBeInTheDocument()
      expect(toggle('Alimentación')).toHaveAttribute('aria-pressed', 'false')
      expect(repo.customCategories.get('groceries')?.isHousehold).toBe(false)

      fireEvent.click(toggle('Alimentación'))

      await waitFor(() =>
        expect(toggle('Alimentación')).toHaveAttribute('aria-pressed', 'true')
      )
      expect(
        repo.customCategories.get('groceries')?.isHousehold
      ).toBeUndefined()
    })

    it('starts a custom category unpressed and stores true on its row', async () => {
      addCustomCategory({ label: 'Mascotas', color: '#112233' })
      renderWithToasts()
      expect(toggle('Mascotas')).toHaveAttribute('aria-pressed', 'false')

      fireEvent.click(toggle('Mascotas'))

      await waitFor(() =>
        expect(toggle('Mascotas')).toHaveAttribute('aria-pressed', 'true')
      )
      expect(repo.customCategories.get('mascotas')?.isHousehold).toBe(true)
    })

    it('puts the house back and shows an error when the save fails', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      renderWithToasts()
      repo.failOn('upsertCustomCategory', { error: new Error('timeout') })

      fireEvent.click(toggle('Restaurantes'))

      expect(
        await screen.findByText('No se pudo guardar el cambio')
      ).toBeInTheDocument()
      expect(toggle('Restaurantes')).toHaveAttribute('aria-pressed', 'false')
      expect(repo.customCategories.size).toBe(0)
      expect(logged).toHaveBeenCalledWith(expect.any(Error))
    })

    it('does not announce a save that finished after another user signed in', async () => {
      renderWithToasts()
      const held = repo.hold('upsertCustomCategory')

      fireEvent.click(toggle('Restaurantes'))
      await waitFor(() =>
        expect(toggle('Restaurantes')).toHaveAttribute('aria-disabled', 'true')
      )
      workspaceStore.setState({ userId: 'someone-else', status: 'ready' })
      held.release()

      await waitFor(() =>
        expect(toggle('Restaurantes')).not.toHaveAttribute(
          'aria-disabled',
          'true'
        )
      )
      expect(
        screen.queryByText('Restaurantes: ahora es del hogar')
      ).not.toBeInTheDocument()
    })

    it('blocks the toggle while its save is in flight, without dropping keyboard focus', async () => {
      renderWithToasts()
      const held = repo.hold('upsertCustomCategory')
      toggle('Restaurantes').focus()

      fireEvent.click(toggle('Restaurantes'))

      await waitFor(() =>
        expect(toggle('Restaurantes')).toHaveAttribute('aria-disabled', 'true')
      )
      expect(toggle('Restaurantes')).toHaveFocus()
      expect(toggle('Servicios')).not.toHaveAttribute('aria-disabled', 'true')
      // A second click while saving writes nothing more.
      fireEvent.click(toggle('Restaurantes'))
      held.release()
      await waitFor(() =>
        expect(toggle('Restaurantes')).not.toHaveAttribute(
          'aria-disabled',
          'true'
        )
      )
      expect(toggle('Restaurantes')).toHaveAttribute('aria-pressed', 'true')
      expect(toggle('Restaurantes')).toHaveFocus()
      expect(repo.requests.upsertCustomCategory).toBe(1)
    })
  })
})

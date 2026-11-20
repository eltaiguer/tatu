import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ComponentProps } from 'react'
import { TransactionFilters } from './TransactionFilters'
import { resolveCategory } from '../services/categories/category-registry'
import {
  DEFAULT_URL_FILTERS,
  hasActiveFilters,
} from '../services/filters/url-filters'
import type { FilterState } from '../services/filters/transaction-filter'
import { SECONDARY_FILTERS_CLEARED } from './transactions/secondary-filters'
import { replaceCustomCategories } from '../services/categories/category-store'

type FilterProps = ComponentProps<typeof TransactionFilters>

function renderFilters(
  filters: Partial<FilterState> = {},
  overrides: Partial<FilterProps> = {}
) {
  const state: FilterState = {
    ...DEFAULT_URL_FILTERS,
    period: { mode: 'all' },
    ...filters,
  }
  const props: FilterProps = {
    filters: state,
    hasActiveFilters: hasActiveFilters(state),
    dateRange: { from: '', to: '' },
    availableCategories: ['groceries', 'restaurants'],
    ignoredCount: 0,
    onChange: vi.fn(),
    onDateBoundChange: vi.fn(),
    onClearAll: vi.fn(),
    ...overrides,
  }
  render(<TransactionFilters {...props} />)
  return props
}

function segment(group: string, option: string): HTMLElement {
  return within(screen.getByRole('radiogroup', { name: group })).getByRole(
    'radio',
    {
      name: option,
    }
  )
}

// The panel is a modal sheet in jsdom (matchMedia says "not wide").
async function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: /^Filtros/ }))
  return within(await screen.findByRole('dialog', { name: 'Filtros' }))
}

async function closeFilters() {
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Filtros' })).getByRole(
      'button',
      { name: 'Cerrar' }
    )
  )
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

describe('TransactionFilters', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('updates the search term as the user types', () => {
    const props = renderFilters()

    fireEvent.change(
      screen.getByPlaceholderText('Buscar por comercio o descripción...'),
      { target: { value: 'disco' } }
    )

    expect(props.onChange).toHaveBeenCalledWith({ search: 'disco' })
  })

  describe('category filter', () => {
    const groceries = resolveCategory('groceries').label
    const restaurants = resolveCategory('restaurants').label

    it('adds a category picked from the list', () => {
      const props = renderFilters()

      fireEvent.click(screen.getByLabelText('Filtro categoría'))
      fireEvent.click(screen.getByRole('button', { name: restaurants }))

      expect(props.onChange).toHaveBeenCalledWith({
        categories: ['restaurants'],
      })
    })

    it('keeps already chosen categories when adding another', () => {
      const props = renderFilters({ categories: ['groceries'] })

      fireEvent.click(screen.getByLabelText('Filtro categoría'))
      fireEvent.click(screen.getByRole('button', { name: restaurants }))

      expect(props.onChange).toHaveBeenCalledWith({
        categories: ['groceries', 'restaurants'],
      })
    })

    it('removes a chosen category when picked again', () => {
      const props = renderFilters({ categories: ['groceries'] })

      fireEvent.click(screen.getByLabelText('Filtro categoría'))
      fireEvent.click(screen.getByRole('button', { name: groceries }))

      expect(props.onChange).toHaveBeenCalledWith({ categories: [] })
    })

    it('shows the chosen category as a removable chip', () => {
      const props = renderFilters({
        categories: ['groceries', 'restaurants'],
      })

      expect(screen.getByLabelText('Filtro categoría')).toHaveTextContent('· 2')
      fireEvent.click(screen.getByLabelText(`Quitar filtro ${groceries}`))

      expect(props.onChange).toHaveBeenCalledWith({
        categories: ['restaurants'],
      })
    })
  })

  describe('the primary row and the Filtros panel (#284)', () => {
    it('shows only search, Categoría, Hogar and Filtros', () => {
      renderFilters()

      expect(
        screen.getByPlaceholderText('Buscar por comercio o descripción...')
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Filtro categoría')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Filtro Hogar' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Filtros' })
      ).toBeInTheDocument()
      expect(screen.queryByLabelText('Tarjeta')).toBeNull()
      expect(
        screen.queryByRole('radiogroup', { name: 'Tipo de transacción' })
      ).toBeNull()
      expect(screen.queryByRole('radiogroup', { name: 'Moneda' })).toBeNull()
      expect(screen.queryByLabelText('Monto mínimo')).toBeNull()
      expect(
        screen.queryByRole('button', { name: /transferencias/ })
      ).toBeNull()
    })

    it('counts the active panel filters on the button', () => {
      renderFilters({ accounts: ['credit_card'], currency: 'UYU' })
      expect(
        screen.getByRole('button', { name: 'Filtros (2)' })
      ).toBeInTheDocument()
    })

    it('opens a panel with every secondary control', async () => {
      renderFilters()
      const panel = await openFilters()

      expect(panel.getByLabelText('Tarjeta')).toBeInTheDocument()
      expect(panel.getByLabelText('Cuenta bancaria')).toBeInTheDocument()
      expect(
        panel.getByRole('radiogroup', { name: 'Tipo de transacción' })
      ).toBeInTheDocument()
      expect(
        panel.getByRole('radiogroup', { name: 'Moneda' })
      ).toBeInTheDocument()
      expect(panel.getByLabelText('Monto mínimo')).toBeInTheDocument()
      expect(panel.getByLabelText('Monto máximo')).toBeInTheDocument()
      expect(
        panel.getByRole('button', { name: /transferencias/ })
      ).toBeInTheDocument()
    })

    describe('on a wide screen', () => {
      const original = window.matchMedia
      afterEach(() => {
        window.matchMedia = original
      })

      it('opens a popover with the same controls', async () => {
        window.matchMedia = ((query: string) => ({
          matches: query === '(min-width: 768px)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })) as typeof window.matchMedia
        renderFilters()
        const panel = await openFilters()

        expect(panel.getByLabelText('Tarjeta')).toBeInTheDocument()
        expect(
          panel.getByRole('radiogroup', { name: 'Moneda' })
        ).toBeInTheDocument()
        expect(panel.getByLabelText('Monto máximo')).toBeInTheDocument()
        // A popover is not modal: the page behind stays reachable.
        expect(screen.getByLabelText('Filtro categoría')).toBeInTheDocument()
      })
    })

    it('gives focus back to the Filtros button when it closes', async () => {
      renderFilters()
      await openFilters()
      await closeFilters()

      expect(screen.getByRole('button', { name: 'Filtros' })).toHaveFocus()
    })

    describe('Limpiar', () => {
      it('is absent while no panel filter is active', async () => {
        renderFilters({ search: 'disco', categories: ['groceries'] })
        const panel = await openFilters()
        expect(panel.queryByRole('button', { name: 'Limpiar' })).toBeNull()
      })

      it('clears only the panel filters', async () => {
        const props = renderFilters({
          search: 'disco',
          categories: ['groceries'],
          household: 'household',
          currency: 'UYU',
          showIgnored: true,
        })
        const panel = await openFilters()

        fireEvent.click(panel.getByRole('button', { name: 'Limpiar' }))

        expect(props.onChange).toHaveBeenCalledTimes(1)
        expect(props.onChange).toHaveBeenCalledWith(SECONDARY_FILTERS_CLEARED)
        expect(props.onClearAll).not.toHaveBeenCalled()
      })
    })
  })

  describe('account filter', () => {
    it('adds the account ticked in the panel', async () => {
      const props = renderFilters()
      const panel = await openFilters()

      fireEvent.click(panel.getByRole('checkbox', { name: 'Tarjeta' }))

      expect(props.onChange).toHaveBeenCalledWith({ accounts: ['credit_card'] })
    })

    it('drops the account that is unticked', async () => {
      const props = renderFilters({ accounts: ['credit_card', 'bank_account'] })
      const panel = await openFilters()

      fireEvent.click(panel.getByRole('checkbox', { name: 'Tarjeta' }))

      expect(props.onChange).toHaveBeenCalledWith({
        accounts: ['bank_account'],
      })
    })

    it('removes the account via its chip', () => {
      const props = renderFilters({
        accounts: ['credit_card', 'bank_account'],
      })

      fireEvent.click(
        screen.getByLabelText('Quitar filtro Cuenta: Cuenta bancaria')
      )

      expect(props.onChange).toHaveBeenCalledWith({ accounts: ['credit_card'] })
    })
  })

  describe('type filter', () => {
    it('filters to expenses or income', async () => {
      const props = renderFilters()
      await openFilters()

      fireEvent.click(segment('Tipo de transacción', 'Gastos'))
      expect(props.onChange).toHaveBeenLastCalledWith({ type: 'debit' })

      fireEvent.click(segment('Tipo de transacción', 'Ingresos'))
      expect(props.onChange).toHaveBeenLastCalledWith({ type: 'credit' })
    })

    it('shows the active type and clears it via its chip', async () => {
      const props = renderFilters({ type: 'debit' })

      fireEvent.click(screen.getByLabelText('Quitar filtro Tipo: Gastos'))
      expect(props.onChange).toHaveBeenCalledWith({ type: 'all' })

      await openFilters()
      expect(segment('Tipo de transacción', 'Gastos')).toBeChecked()
    })
  })

  describe('currency filter', () => {
    it('filters to one currency', async () => {
      const props = renderFilters()
      await openFilters()

      fireEvent.click(segment('Moneda', 'US$'))
      expect(props.onChange).toHaveBeenLastCalledWith({ currency: 'USD' })

      fireEvent.click(segment('Moneda', '$U'))
      expect(props.onChange).toHaveBeenLastCalledWith({ currency: 'UYU' })
    })

    it('clears the currency via its chip', () => {
      const props = renderFilters({ currency: 'UYU' })

      fireEvent.click(screen.getByLabelText('Quitar filtro Moneda: $U'))

      expect(props.onChange).toHaveBeenCalledWith({ currency: 'all' })
    })
  })

  describe('amount filter', () => {
    it('sets the minimum and maximum amount from the panel', async () => {
      const props = renderFilters()
      expect(screen.queryByRole('button', { name: 'Monto' })).toBeNull()
      const panel = await openFilters()

      fireEvent.change(panel.getByLabelText('Monto mínimo'), {
        target: { value: '50' },
      })
      fireEvent.change(panel.getByLabelText('Monto máximo'), {
        target: { value: '500' },
      })

      expect(props.onChange).toHaveBeenCalledWith({ min: '50' })
      expect(props.onChange).toHaveBeenCalledWith({ max: '500' })
    })

    it('clears both bounds via the amount chip', () => {
      const props = renderFilters({ min: '50' })

      fireEvent.click(screen.getByLabelText('Quitar filtro Monto: 50–∞'))

      expect(props.onChange).toHaveBeenCalledWith({ min: '', max: '' })
    })
  })

  describe('ignored transfers', () => {
    it('toggles showing them and says how many there are', async () => {
      const props = renderFilters({}, { ignoredCount: 3 })
      const panel = await openFilters()

      const toggle = panel.getByRole('button', {
        name: /Mostrar transferencias ignoradas/,
      })
      expect(toggle).toHaveTextContent('· 3')
      expect(toggle).toHaveAttribute('aria-pressed', 'false')

      fireEvent.click(toggle)
      expect(props.onChange).toHaveBeenCalledWith({ showIgnored: true })
    })

    it('offers to hide them when they are shown', async () => {
      const props = renderFilters({ showIgnored: true }, { ignoredCount: 3 })
      const panel = await openFilters()

      fireEvent.click(
        panel.getByRole('button', { name: /Ocultar transferencias ignoradas/ })
      )
      expect(props.onChange).toHaveBeenCalledWith({ showIgnored: false })
    })

    it('is disabled when nothing is ignored', async () => {
      renderFilters({}, { ignoredCount: 0 })
      const panel = await openFilters()

      expect(
        panel.getByRole('button', { name: /transferencias ignoradas/ })
      ).toBeDisabled()
    })

    it('shows a chip while they are visible, and counts it', () => {
      const props = renderFilters({ showIgnored: true }, { ignoredCount: 3 })

      expect(
        screen.getByRole('button', { name: 'Filtros (1)' })
      ).toBeInTheDocument()
      fireEvent.click(
        screen.getByLabelText(
          'Quitar filtro Transferencias ignoradas: visibles'
        )
      )
      expect(props.onChange).toHaveBeenCalledWith({ showIgnored: false })
    })
  })

  describe('the first option of each group (#265)', () => {
    it('reads Ambos for the type and Ambas for the currency', async () => {
      renderFilters()
      await openFilters()
      const first = (group: string) =>
        within(screen.getByRole('radiogroup', { name: group }))
          .getAllByRole('radio')
          .map((r) => r.getAttribute('aria-label') ?? r.textContent)
      expect(first('Tipo de transacción')).toEqual([
        'Ambos',
        'Ingresos',
        'Gastos',
      ])
      expect(first('Moneda')).toEqual(['Ambas', '$U', 'US$'])
    })
  })

  describe('Hogar', () => {
    const chip = () => screen.getByRole('button', { name: 'Filtro Hogar' })

    it('is one toggle chip, pressed when the filter is on', () => {
      renderFilters()
      expect(chip()).toHaveAttribute('aria-pressed', 'false')
      expect(screen.queryByRole('radiogroup', { name: 'Hogar' })).toBeNull()
    })

    it('reads pressed under the household filter', () => {
      renderFilters({ household: 'household' })
      expect(chip()).toHaveAttribute('aria-pressed', 'true')
    })

    it('sets the filter when clicked', () => {
      const props = renderFilters()
      fireEvent.click(chip())
      expect(props.onChange).toHaveBeenCalledWith({ household: 'household' })
    })

    it('puts the type back to Ambos when income would leave nothing', () => {
      const props = renderFilters({ type: 'credit' })
      fireEvent.click(chip())
      expect(props.onChange).toHaveBeenCalledWith({
        household: 'household',
        type: 'all',
      })
    })

    it('picking Ingresos while Hogar is on goes back to Todo in Hogar', async () => {
      const props = renderFilters({ household: 'household' })
      await openFilters()
      fireEvent.click(segment('Tipo de transacción', 'Ingresos'))
      expect(props.onChange).toHaveBeenCalledWith({
        type: 'credit',
        household: 'all',
      })
    })

    it('picking Gastos keeps the household filter', async () => {
      const props = renderFilters({ household: 'household' })
      await openFilters()
      fireEvent.click(segment('Tipo de transacción', 'Gastos'))
      expect(props.onChange).toHaveBeenCalledWith({ type: 'debit' })
    })

    it('keeps the type when going back to Todo', () => {
      const props = renderFilters({ type: 'credit', household: 'household' })
      fireEvent.click(chip())
      expect(props.onChange).toHaveBeenCalledWith({ household: 'all' })
    })

    it('has no removable chip: the pressed chip is the state', () => {
      renderFilters({ household: 'household' })
      expect(
        screen.queryByRole('button', { name: 'Quitar filtro Hogar' })
      ).toBeNull()
    })

    it('offers Limpiar todo when Hogar is the only filter', () => {
      const props = renderFilters({ household: 'household' })
      fireEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }))
      expect(props.onClearAll).toHaveBeenCalled()
    })
  })

  describe('A revisar', () => {
    it('shows a chip that clears it', () => {
      const props = renderFilters({ review: true })
      expect(screen.getByText('A revisar')).toBeInTheDocument()
      fireEvent.click(
        screen.getByRole('button', { name: 'Quitar filtro A revisar' })
      )
      expect(props.onChange).toHaveBeenCalledWith({ review: false })
    })
  })
})

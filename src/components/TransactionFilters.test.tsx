import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { TransactionFilters } from './TransactionFilters'
import { DEFAULT_URL_FILTERS } from '../services/filters/url-filters'
import {
  hasActiveFilters,
  type FilterState,
} from '../services/filters/transaction-filter'
import { getCategoryDisplay } from '../utils/category-display'
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
    const groceries = getCategoryDisplay('groceries').label
    const restaurants = getCategoryDisplay('restaurants').label

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

  describe('account filter', () => {
    it('adds the account picked from the list', () => {
      const props = renderFilters()

      fireEvent.click(screen.getByLabelText('Filtro cuenta'))
      fireEvent.click(screen.getByRole('button', { name: 'Tarjeta' }))

      expect(props.onChange).toHaveBeenCalledWith({ accounts: ['credit_card'] })
    })

    it('removes the account via its chip', () => {
      const props = renderFilters({
        accounts: ['credit_card', 'bank_account'],
      })

      fireEvent.click(screen.getByLabelText('Quitar filtro Cuenta bancaria'))

      expect(props.onChange).toHaveBeenCalledWith({ accounts: ['credit_card'] })
    })
  })

  describe('type filter', () => {
    it('filters to expenses or income', () => {
      const props = renderFilters()

      fireEvent.click(segment('Tipo de transacción', 'Gastos'))
      expect(props.onChange).toHaveBeenLastCalledWith({ type: 'debit' })

      fireEvent.click(segment('Tipo de transacción', 'Ingresos'))
      expect(props.onChange).toHaveBeenLastCalledWith({ type: 'credit' })
    })

    it('shows the active type and clears it via its chip', () => {
      const props = renderFilters({ type: 'debit' })

      expect(segment('Tipo de transacción', 'Gastos')).toBeChecked()
      fireEvent.click(screen.getByLabelText('Quitar filtro Gastos'))

      expect(props.onChange).toHaveBeenCalledWith({ type: 'all' })
    })
  })

  describe('currency filter', () => {
    it('filters to one currency', () => {
      const props = renderFilters()

      fireEvent.click(segment('Moneda', 'US$'))
      expect(props.onChange).toHaveBeenLastCalledWith({ currency: 'USD' })

      fireEvent.click(segment('Moneda', '$U'))
      expect(props.onChange).toHaveBeenLastCalledWith({ currency: 'UYU' })
    })

    it('clears the currency via its chip', () => {
      const props = renderFilters({ currency: 'UYU' })

      fireEvent.click(screen.getByLabelText('Quitar filtro Pesos'))

      expect(props.onChange).toHaveBeenCalledWith({ currency: 'all' })
    })
  })

  describe('amount filter', () => {
    it('sets the minimum and maximum amount from the amount panel', () => {
      const props = renderFilters()

      expect(screen.queryByPlaceholderText('∞')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Monto' }))

      fireEvent.change(screen.getByLabelText('Monto mínimo'), {
        target: { value: '50' },
      })
      fireEvent.change(screen.getByLabelText('Monto máximo'), {
        target: { value: '500' },
      })

      expect(props.onChange).toHaveBeenCalledWith({ min: '50' })
      expect(props.onChange).toHaveBeenCalledWith({ max: '500' })
    })

    it('clears both bounds via the amount chip', () => {
      const props = renderFilters({ min: '50' })

      fireEvent.click(screen.getByLabelText('Quitar filtro Monto 50–∞'))

      expect(props.onChange).toHaveBeenCalledWith({ min: '', max: '' })
    })
  })

  describe('date range', () => {
    it('edits the from and to dates', () => {
      const props = renderFilters()

      fireEvent.change(screen.getByLabelText('Filtro fecha desde'), {
        target: { value: '2025-01-01' },
      })
      fireEvent.change(screen.getByLabelText('Filtro fecha hasta'), {
        target: { value: '2025-01-31' },
      })

      expect(props.onDateBoundChange).toHaveBeenCalledWith('from', '2025-01-01')
      expect(props.onDateBoundChange).toHaveBeenCalledWith('to', '2025-01-31')
      expect(props.onChange).not.toHaveBeenCalled()
    })

    it("shows the period's days", () => {
      renderFilters(
        { period: { mode: 'month', y: 2026, m: 2 } },
        { dateRange: { from: '2026-03-01', to: '2026-03-31' } }
      )

      expect(screen.getByLabelText('Filtro fecha desde')).toHaveValue(
        '2026-03-01'
      )
      expect(screen.getByLabelText('Filtro fecha hasta')).toHaveValue(
        '2026-03-31'
      )
    })
  })

  describe('clear all', () => {
    it('resets every filter at once', () => {
      const props = renderFilters({
        categories: ['groceries'],
        type: 'debit',
        currency: 'USD',
      })

      fireEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }))

      expect(props.onClearAll).toHaveBeenCalledTimes(1)
    })

    it('is not offered when no filter is active', () => {
      renderFilters()

      expect(screen.queryByRole('button', { name: 'Limpiar todo' })).toBeNull()
    })

    // The view decides what counts as "filtrado" once, for the header too.
    it('follows whether the view says a filter is active', () => {
      renderFilters({ categories: ['groceries'] }, { hasActiveFilters: false })

      expect(screen.queryByRole('button', { name: 'Limpiar todo' })).toBeNull()
    })
  })
})

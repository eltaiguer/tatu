import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { TransactionFilters } from './TransactionFilters'
import { getCategoryDisplay } from '../utils/category-display'
import { replaceCustomCategories } from '../services/categories/category-store'

type FilterProps = ComponentProps<typeof TransactionFilters>

function renderFilters(overrides: Partial<FilterProps> = {}) {
  const props: FilterProps = {
    searchTerm: '',
    dateFromFilter: '',
    dateToFilter: '',
    categoryFilters: [],
    accountFilters: [],
    currencyFilter: 'all',
    typeFilter: 'all',
    minAmount: '',
    maxAmount: '',
    availableCategories: ['groceries', 'restaurants'],
    hasActiveFilters: false,
    onSearchChange: vi.fn(),
    onDateFromChange: vi.fn(),
    onDateToChange: vi.fn(),
    onCategoryFiltersChange: vi.fn(),
    onAccountFiltersChange: vi.fn(),
    onCurrencyChange: vi.fn(),
    onTypeChange: vi.fn(),
    onMinAmountChange: vi.fn(),
    onMaxAmountChange: vi.fn(),
    onClearAll: vi.fn(),
    ...overrides,
  }
  render(<TransactionFilters {...props} />)
  return props
}

function segment(group: string, option: string): HTMLElement {
  return within(screen.getByRole('tablist', { name: group })).getByRole('tab', {
    name: option,
  })
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

    expect(props.onSearchChange).toHaveBeenCalledWith('disco')
  })

  describe('category filter', () => {
    const groceries = getCategoryDisplay('groceries').label
    const restaurants = getCategoryDisplay('restaurants').label

    it('adds a category picked from the list', () => {
      const props = renderFilters()

      fireEvent.click(screen.getByLabelText('Filtro categoría'))
      fireEvent.click(screen.getByRole('button', { name: restaurants }))

      expect(props.onCategoryFiltersChange).toHaveBeenCalledWith([
        'restaurants',
      ])
    })

    it('keeps already chosen categories when adding another', () => {
      const props = renderFilters({ categoryFilters: ['groceries'] })

      fireEvent.click(screen.getByLabelText('Filtro categoría'))
      fireEvent.click(screen.getByRole('button', { name: restaurants }))

      expect(props.onCategoryFiltersChange).toHaveBeenCalledWith([
        'groceries',
        'restaurants',
      ])
    })

    it('removes a chosen category when picked again', () => {
      const props = renderFilters({ categoryFilters: ['groceries'] })

      fireEvent.click(screen.getByLabelText('Filtro categoría'))
      fireEvent.click(screen.getByRole('button', { name: groceries }))

      expect(props.onCategoryFiltersChange).toHaveBeenCalledWith([])
    })

    it('shows the chosen category as a removable chip', () => {
      const props = renderFilters({
        categoryFilters: ['groceries', 'restaurants'],
        hasActiveFilters: true,
      })

      expect(screen.getByLabelText('Filtro categoría')).toHaveTextContent('· 2')
      fireEvent.click(screen.getByLabelText(`Quitar filtro ${groceries}`))

      expect(props.onCategoryFiltersChange).toHaveBeenCalledWith([
        'restaurants',
      ])
    })
  })

  describe('account filter', () => {
    it('adds the account picked from the list', () => {
      const props = renderFilters()

      fireEvent.click(screen.getByLabelText('Filtro cuenta'))
      fireEvent.click(screen.getByRole('button', { name: 'Tarjeta' }))

      expect(props.onAccountFiltersChange).toHaveBeenCalledWith(['credit_card'])
    })

    it('removes the account via its chip', () => {
      const props = renderFilters({
        accountFilters: ['credit_card', 'bank_account'],
        hasActiveFilters: true,
      })

      fireEvent.click(screen.getByLabelText('Quitar filtro Cuenta bancaria'))

      expect(props.onAccountFiltersChange).toHaveBeenCalledWith(['credit_card'])
    })
  })

  describe('type filter', () => {
    it('filters to expenses or income', () => {
      const props = renderFilters()

      fireEvent.click(segment('Tipo de transacción', 'Gastos'))
      expect(props.onTypeChange).toHaveBeenLastCalledWith('debit')

      fireEvent.click(segment('Tipo de transacción', 'Ingresos'))
      expect(props.onTypeChange).toHaveBeenLastCalledWith('credit')
    })

    it('shows the active type and clears it via its chip', () => {
      const props = renderFilters({
        typeFilter: 'debit',
        hasActiveFilters: true,
      })

      expect(segment('Tipo de transacción', 'Gastos')).toHaveAttribute(
        'aria-selected',
        'true'
      )
      fireEvent.click(screen.getByLabelText('Quitar filtro Gastos'))

      expect(props.onTypeChange).toHaveBeenCalledWith('all')
    })
  })

  describe('currency filter', () => {
    it('filters to one currency', () => {
      const props = renderFilters()

      fireEvent.click(segment('Moneda', 'US$'))
      expect(props.onCurrencyChange).toHaveBeenLastCalledWith('USD')

      fireEvent.click(segment('Moneda', '$U'))
      expect(props.onCurrencyChange).toHaveBeenLastCalledWith('UYU')
    })

    it('clears the currency via its chip', () => {
      const props = renderFilters({
        currencyFilter: 'UYU',
        hasActiveFilters: true,
      })

      fireEvent.click(screen.getByLabelText('Quitar filtro Pesos'))

      expect(props.onCurrencyChange).toHaveBeenCalledWith('all')
    })
  })

  describe('amount filter', () => {
    it('sets the minimum and maximum amount from the amount panel', () => {
      const props = renderFilters()

      expect(screen.queryByPlaceholderText('∞')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Monto' }))

      fireEvent.change(screen.getByPlaceholderText('0'), {
        target: { value: '50' },
      })
      fireEvent.change(screen.getByPlaceholderText('∞'), {
        target: { value: '500' },
      })

      expect(props.onMinAmountChange).toHaveBeenCalledWith('50')
      expect(props.onMaxAmountChange).toHaveBeenCalledWith('500')
    })

    it('clears both bounds via the amount chip', () => {
      const props = renderFilters({
        minAmount: '50',
        maxAmount: '',
        hasActiveFilters: true,
      })

      fireEvent.click(screen.getByLabelText('Quitar filtro Monto 50–∞'))

      expect(props.onMinAmountChange).toHaveBeenCalledWith('')
      expect(props.onMaxAmountChange).toHaveBeenCalledWith('')
    })
  })

  describe('date range', () => {
    it('updates the from and to dates', () => {
      const props = renderFilters()

      fireEvent.change(screen.getByLabelText('Filtro fecha desde'), {
        target: { value: '2025-01-01' },
      })
      fireEvent.change(screen.getByLabelText('Filtro fecha hasta'), {
        target: { value: '2025-01-31' },
      })

      expect(props.onDateFromChange).toHaveBeenCalledWith('2025-01-01')
      expect(props.onDateToChange).toHaveBeenCalledWith('2025-01-31')
    })
  })

  describe('clear all', () => {
    it('resets every filter at once', () => {
      const props = renderFilters({
        categoryFilters: ['groceries'],
        typeFilter: 'debit',
        currencyFilter: 'USD',
        hasActiveFilters: true,
      })

      fireEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }))

      expect(props.onClearAll).toHaveBeenCalledTimes(1)
    })

    it('is not offered when no filter is active', () => {
      renderFilters()

      expect(screen.queryByRole('button', { name: 'Limpiar todo' })).toBeNull()
    })
  })
})

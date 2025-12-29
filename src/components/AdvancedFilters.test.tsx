import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdvancedFilters } from './AdvancedFilters'
import type { FilterOptions } from '../services/filters/filters'
import { Category } from '../models'

function renderWithState(initial: FilterOptions) {
  const handleChange = vi.fn()

  const Wrapper = () => {
    const [filters, setFilters] = useState(initial)
    return (
      <AdvancedFilters
        filters={filters}
        onChange={(next) => {
          setFilters(next)
          handleChange(next)
        }}
      />
    )
  }

  return { handleChange, ...render(<Wrapper />) }
}

describe('AdvancedFilters', () => {
  it('renders category, date, and amount controls', () => {
    renderWithState({})

    expect(screen.getByText('Categories')).toBeInTheDocument()
    expect(screen.getByLabelText('From')).toBeInTheDocument()
    expect(screen.getByLabelText('To')).toBeInTheDocument()
    expect(screen.getByText('Amount range')).toBeInTheDocument()
  })

  it('updates category filters when toggling checkboxes', () => {
    const { handleChange } = renderWithState({})

    const groceries = screen.getByLabelText('Groceries')
    fireEvent.click(groceries)

    const [next] =
      handleChange.mock.calls[handleChange.mock.calls.length - 1] as [
        FilterOptions,
      ]
    expect(next.categories).toEqual([Category.Groceries])
  })

  it('updates date range filters', () => {
    const { handleChange } = renderWithState({})

    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2025-03-01' },
    })
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: '2025-03-31' },
    })

    const [next] =
      handleChange.mock.calls[handleChange.mock.calls.length - 1] as [
        FilterOptions,
      ]
    expect(next.dateFrom?.toISOString()).toBe('2025-03-01T00:00:00.000Z')
    expect(next.dateTo?.toISOString()).toBe('2025-03-31T23:59:59.999Z')
  })

  it('updates amount range sliders', () => {
    const { handleChange } = renderWithState({})

    fireEvent.change(screen.getByTestId('amount-min'), {
      target: { value: '50' },
    })
    fireEvent.change(screen.getByTestId('amount-max'), {
      target: { value: '200' },
    })

    const [next] =
      handleChange.mock.calls[handleChange.mock.calls.length - 1] as [
        FilterOptions,
      ]
    expect(next.amountMin).toBe(50)
    expect(next.amountMax).toBe(200)
  })

  it('renders and clears filter chips', () => {
    const { handleChange } = renderWithState({
      categories: [Category.Groceries],
      amountMin: 10,
      amountMax: 100,
    })

    expect(
      screen.getByRole('button', { name: /Groceries/ })
    ).toBeInTheDocument()
    expect(screen.getByText('Amount: 10 - 100')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Clear all'))
    const [next] =
      handleChange.mock.calls[handleChange.mock.calls.length - 1] as [
        FilterOptions,
      ]
    expect(next).toEqual({})
  })
})

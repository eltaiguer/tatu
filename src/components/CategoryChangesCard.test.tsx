import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { CategoryChangesCard } from './CategoryChangesCard'
import { Category } from '../models'
import type { CategoryChanges } from '../services/charts/category-changes'

// August against May–July: two increases (one too small a baseline for a
// %) and one decrease.
const changes: CategoryChanges = {
  kind: 'ok',
  reference: '2026-08',
  baseline: ['2026-05', '2026-06', '2026-07'],
  increases: [
    {
      category: Category.Entertainment,
      current: 900,
      baselineByMonth: [1088.89, 167.86, 491.25],
      median: 491.25,
      delta: 408.75,
      pct: 0.832,
    },
    {
      category: Category.Transport,
      current: 60,
      baselineByMonth: [0, 4, 0],
      median: 0,
      delta: 60,
      pct: null,
    },
  ],
  decrease: {
    category: Category.Restaurants,
    current: 100,
    baselineByMonth: [300, 250, 350],
    median: 300,
    delta: -200,
    pct: -0.667,
  },
}

function rowOf(label: string) {
  return screen.getByText(label).closest('li') as HTMLElement
}

describe('CategoryChangesCard', () => {
  it('labels the decrease with the plain category name, direction in words', () => {
    render(<CategoryChangesCard changes={changes} homeCurrency="USD" />)

    expect(screen.queryByText(/Bajaste en/)).not.toBeInTheDocument()
    const down = rowOf('Restaurantes')
    expect(within(down).getByText('Bajó')).toBeInTheDocument()
    expect(within(down).getByText('−US$ 200,00')).toBeInTheDocument()
    expect(within(down).getByText('(−67%)')).toBeInTheDocument()

    const up = rowOf('Entretenimiento')
    expect(within(up).getByText('Subió')).toBeInTheDocument()
    expect(within(up).getByText('+US$ 408,75')).toBeInTheDocument()
    expect(within(up).getByText('(+83%)')).toBeInTheDocument()
  })

  it('shows no % when the baseline is too small for one', () => {
    render(<CategoryChangesCard changes={changes} homeCurrency="USD" />)

    expect(within(rowOf('Transporte')).queryByText(/%/)).toBeNull()
  })

  it('says a move under 1% is under 1%, not 0%', () => {
    render(
      <CategoryChangesCard
        changes={{
          ...changes,
          increases: [{ ...changes.increases[0], pct: 0.004 }],
          decrease: { ...changes.decrease!, pct: -0.004 },
        }}
        homeCurrency="USD"
      />
    )

    expect(within(rowOf('Entretenimiento')).getByText('(+<1%)')).toBeVisible()
    expect(within(rowOf('Restaurantes')).getByText('(−<1%)')).toBeVisible()
  })

  it("sums up the baseline as its median, each month's amount as the description", () => {
    render(<CategoryChangesCard changes={changes} homeCurrency="USD" />)

    const baseline = within(rowOf('Entretenimiento')).getByRole('button', {
      name: 'Ver los gastos en Entretenimiento de may.–jul.',
    })
    expect(baseline).toHaveTextContent(/^mediana US\$ 491,25$/)
    expect(baseline).toHaveAccessibleDescription(
      'may. US$ 1.088,89 · jun. US$ 167,86 · jul. US$ 491,25'
    )
  })

  it('sets amounts in mono, the words around them in the UI font', () => {
    render(<CategoryChangesCard changes={changes} homeCurrency="USD" />)

    const current = within(rowOf('Entretenimiento')).getByRole('button', {
      name: 'Ver los gastos en Entretenimiento de agosto',
    })
    expect(current).toHaveTextContent(/^US\$ 900,00 en ago\.$/)
    expect(current).not.toHaveClass('font-mono')
    expect(within(current).getByText('US$ 900,00')).toHaveClass(
      'font-mono',
      'tabular-nums'
    )
  })

  it('opens the month and the baseline rows of each category', () => {
    const open = vi.fn()
    render(
      <CategoryChangesCard changes={changes} homeCurrency="USD" onOpen={open} />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Ver los gastos en Restaurantes de agosto',
      })
    )
    expect(open).toHaveBeenLastCalledWith({
      categories: ['restaurants'],
      type: 'debit',
      period: { mode: 'month', y: 2026, m: 7 },
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Ver los gastos en Restaurantes de may.–jul.',
      })
    )
    expect(open).toHaveBeenLastCalledWith({
      categories: ['restaurants'],
      type: 'debit',
      period: { mode: 'range', from: '2026-05-01', to: '2026-07-31' },
    })
  })
})

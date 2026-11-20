import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { MonthlyTrendRow } from '../../services/charts/dashboard-rows'
import { MonthlySpendTooltip } from './MonthlySpendTooltip'

// jsdom cannot hover a Recharts bar, so the tooltip's body is tested alone.

function month(overrides: Partial<MonthlyTrendRow> = {}): MonthlyTrendRow {
  return {
    key: '2026-08',
    month: 'ago. 2026',
    ingresos: 900,
    gastos: 300,
    todoGastos: 400,
    neto: 600,
    complete: true,
    ...overrides,
  }
}

describe('MonthlySpendTooltip', () => {
  it('in Hogar mode names the household spend and its share of the total', () => {
    const { container } = render(
      <MonthlySpendTooltip
        month={month()}
        label="ago. 2026"
        homeCurrency="USD"
        ghost="total"
      />
    )

    expect(container).toHaveTextContent('Gastos del hogar: US$ 300,00')
    expect(container).toHaveTextContent('Hogar 75% de US$ 400,00')
    expect(screen.queryByText(/Ingresos/)).not.toBeInTheDocument()
  })

  it('sets every amount in the mono face', () => {
    render(
      <MonthlySpendTooltip
        month={month()}
        label="ago. 2026"
        homeCurrency="USD"
        ghost="total"
      />
    )

    expect(screen.getByText('US$ 300,00')).toHaveClass('font-mono')
    expect(screen.getByText('US$ 400,00')).toHaveClass('font-mono')
  })

  it('in Hogar mode words a partial month for the typical month', () => {
    render(
      <MonthlySpendTooltip
        month={month({ complete: false })}
        label="ago. 2026"
        homeCurrency="USD"
        ghost="total"
      />
    )

    expect(
      screen.getByText(
        'Le faltan datos de alguna cuenta: no entra en el mes típico'
      )
    ).toBeInTheDocument()
  })

  it('leaves out the share when there is no total to share', () => {
    const { container } = render(
      <MonthlySpendTooltip
        month={month({ gastos: 0, todoGastos: 0 })}
        label="ago. 2026"
        homeCurrency="USD"
        ghost="total"
      />
    )

    expect(container).not.toHaveTextContent(/Hogar \d/)
  })

  it('in Todo mode says Gastos and Ingresos, with no share (guard)', () => {
    const { container } = render(
      <MonthlySpendTooltip
        month={month({ complete: false })}
        label="ago. 2026"
        homeCurrency="USD"
        ghost="income"
      />
    )

    expect(container).toHaveTextContent('Gastos: US$ 300,00')
    expect(container).toHaveTextContent('Ingresos: US$ 900,00')
    expect(container).not.toHaveTextContent('Hogar')
    expect(container).toHaveTextContent('no entra en el promedio')
  })
})

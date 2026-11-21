import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TotalsStrip } from './TotalsStrip'
import { fitMonoFontSize } from '../../utils/formatting'
import type { Transaction } from '../../models'

function tx(id: string, type: 'debit' | 'credit', amount: number) {
  return {
    id,
    date: new Date(Date.UTC(2026, 0, 5)),
    description: id,
    amount,
    currency: 'UYU',
    type,
    source: 'bank_account',
    rawData: {},
  } as Transaction
}

// The amount element of a tile, found by its label.
function amount(label: string): HTMLElement {
  const group = screen.getByRole('group', { name: 'Totales del período' })
  const tile = within(group).getByText(label).closest('.\\@container')
  return tile!.querySelector('.font-mono') as HTMLElement
}

describe('TotalsStrip phone sizes (#284)', () => {
  it('sizes Gastos to its own figure, not to the longest of the three', () => {
    render(
      <TotalsStrip
        rows={[tx('a', 'debit', 50), tx('b', 'credit', 12345678.9)]}
        homeCurrency="UYU"
        fxRate={40}
      />
    )

    const gastos = amount('Gastos')
    expect(gastos.textContent).toBe('$U 50,00')
    expect(gastos.style.getPropertyValue('--amt-sm')).toBe(
      fitMonoFontSize('$U 50,00', 22)
    )
    // From sm the three share one size.
    const long = ['Ingresos', 'Gastos', 'Balance']
      .map((l) => amount(l).textContent!)
      .reduce((a, b) => (b.length > a.length ? b : a))
    expect(gastos.style.getPropertyValue('--amt-lg')).toBe(
      fitMonoFontSize(long, 22)
    )
  })

  it('sizes Ingresos and Balance together, at most 16px', () => {
    render(
      <TotalsStrip
        rows={[tx('a', 'debit', 50), tx('b', 'credit', 12345678.9)]}
        homeCurrency="UYU"
        fxRate={40}
      />
    )
    const income = amount('Ingresos')
    const balance = amount('Balance')
    const longer =
      income.textContent!.length > balance.textContent!.length
        ? income.textContent!
        : balance.textContent!
    expect(income.style.getPropertyValue('--amt-sm')).toBe(
      fitMonoFontSize(longer, 16)
    )
    expect(balance.style.getPropertyValue('--amt-sm')).toBe(
      fitMonoFontSize(longer, 16)
    )
  })

  it('keeps the one-tile Hogar strip as it was', () => {
    render(
      <TotalsStrip
        rows={[tx('a', 'debit', 50)]}
        homeCurrency="UYU"
        fxRate={40}
        household="household"
      />
    )
    const tile = screen
      .getByText('Gastos del hogar')
      .closest('.\\@container') as HTMLElement
    expect(tile.className).toMatch(/(^| )py-2( |$)/)
    expect(tile.className).not.toMatch(/py-1\.5/)
  })
})

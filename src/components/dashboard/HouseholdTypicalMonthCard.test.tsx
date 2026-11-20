import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TypicalMonth } from '../../services/charts/typical-month'
import { HouseholdTypicalMonthCard } from './HouseholdTypicalMonthCard'

function typical(min: number, max: number): TypicalMonth {
  return {
    months: ['2026-07', '2026-08'],
    median: (min + max) / 2,
    min,
    max,
    topCategories: [],
  }
}

function renderCard(t: TypicalMonth) {
  render(
    <HouseholdTypicalMonthCard
      typical={t}
      monthlyTrend={[]}
      homeCurrency="USD"
    />
  )
}

describe('HouseholdTypicalMonthCard band', () => {
  it('hides the band when the months differ by less than a cent', () => {
    // After conversion two equal months can differ by float noise.
    renderCard(typical(100, 100.004))

    expect(screen.queryByText(/^Entre /)).not.toBeInTheDocument()
  })

  it('shows the band, its amounts in the mono face, when they differ', () => {
    renderCard(typical(100, 400))

    expect(screen.getByText(/^Entre /)).toHaveTextContent(
      'Entre US$ 100,00 y US$ 400,00 por mes'
    )
    expect(screen.getByText('US$ 100,00')).toHaveClass('font-mono')
    expect(screen.getByText('US$ 400,00')).toHaveClass('font-mono')
  })
})

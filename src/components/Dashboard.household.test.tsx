import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { Dashboard } from './Dashboard'
import type { Transaction, TransactionsFilter } from '../models'
import { Category } from '../models'
import {
  replaceCustomCategories,
  upsertBuiltinOverride,
} from '../services/categories/category-store'

// Resumen's Todo / Hogar mode. The mode lives in the URL (App owns it, see
// App.test.tsx); here a tiny harness plays that part.

let seq = 0
function tx(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1
  return {
    id: `h-${seq}`,
    date: new Date('2026-03-10T00:00:00.000Z'),
    description: `Comercio ${seq}`,
    amount: 100,
    currency: 'USD',
    type: 'debit',
    source: 'credit_card',
    category: Category.Groceries,
    rawData: {},
    ...overrides,
  }
}

// Home currency USD at 40 UYU per dollar. March 2026 is the newest month.
//   household (seeded groceries): 100 + 2000 UYU (= 50) ; Cine Hogar, a
//   restaurant row set by hand to household: 40  -> 190 in March
//   not household: Resto plano (restaurants, 60) ; income 500
function marchRows(): Transaction[] {
  return [
    tx({ description: 'Super Uno', amount: 100 }),
    tx({
      description: 'Super Dos',
      amount: 2000,
      currency: 'UYU',
      source: 'bank_account',
    }),
    tx({
      description: 'Cena Hogar',
      amount: 40,
      category: Category.Restaurants,
      household: true,
    }),
    tx({
      description: 'Resto plano',
      amount: 60,
      category: Category.Restaurants,
    }),
    tx({
      description: 'Sueldo',
      amount: 500,
      type: 'credit',
      category: Category.Income,
    }),
  ]
}

function Harness({
  transactions,
  initialHousehold = false,
  onNavigateToTransactions,
  onNavigateToCategories,
}: {
  transactions: Transaction[]
  initialHousehold?: boolean
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
  onNavigateToCategories?: () => void
}) {
  const [household, setHousehold] = useState(initialHousehold)
  return (
    <Dashboard
      transactions={transactions}
      homeCurrency="USD"
      fxRate={40}
      householdMode={household}
      onHouseholdModeChange={setHousehold}
      onNavigateToTransactions={onNavigateToTransactions}
      onNavigateToCategories={onNavigateToCategories}
    />
  )
}

function chooseHogar() {
  fireEvent.click(
    within(screen.getByRole('radiogroup', { name: 'Ver gastos' })).getByRole(
      'radio',
      { name: 'Hogar' }
    )
  )
}

describe('Dashboard: Todo / Hogar mode', () => {
  beforeEach(() => {
    replaceCustomCategories([])
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 9, 12))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('offers Todo / Hogar, with Todo selected by default', () => {
    render(<Harness transactions={marchRows()} />)
    const group = screen.getByRole('radiogroup', { name: 'Ver gastos' })
    expect(within(group).getByRole('radio', { name: 'Todo' })).toBeChecked()
    expect(
      within(group).getByRole('radio', { name: 'Hogar' })
    ).not.toBeChecked()
  })

  it('opens in Hogar mode when told to', () => {
    render(<Harness transactions={marchRows()} initialHousehold />)
    expect(screen.getByText(/Gastos del hogar/)).toBeInTheDocument()
  })

  it('shows the household expense of the month as the hero sentence', () => {
    render(<Harness transactions={marchRows()} />)
    chooseHogar()
    const hero = screen.getByRole('heading', { name: /Gastos del hogar/ })
    expect(hero).toHaveTextContent('Gastos del hogar US$ 190,00')
    expect(hero).toHaveTextContent(/Marzo de 2026 · todo en dólares/)
    expect(screen.queryByText(/Gastaste/)).not.toBeInTheDocument()
  })

  it('drops the income, balance and savings views', () => {
    render(<Harness transactions={marchRows()} initialHousehold />)
    expect(screen.queryByText('Ingresos')).not.toBeInTheDocument()
    expect(screen.queryByText('Balance neto')).not.toBeInTheDocument()
    expect(screen.queryByText('¿Estás ahorrando?')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Ver los ingresos de/ })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/son tus ingresos/)).not.toBeInTheDocument()
    // The spend bars stay.
    expect(screen.getByText('Gasto por mes')).toBeInTheDocument()
  })

  it('keeps the savings card and income bars in Todo mode', () => {
    render(<Harness transactions={marchRows()} />)
    expect(screen.getByText('¿Estás ahorrando?')).toBeInTheDocument()
    expect(screen.getByText(/son tus ingresos/)).toBeInTheDocument()
  })

  it('lists only household rows in merchants and recent movements', () => {
    render(<Harness transactions={marchRows()} initialHousehold />)
    expect(screen.getAllByText('Super Uno').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cena Hogar').length).toBeGreaterThan(0)
    expect(screen.queryByText('Resto plano')).not.toBeInTheDocument()
    expect(screen.queryByText('Sueldo')).not.toBeInTheDocument()
  })

  it('sums the donut over household rows only', () => {
    render(
      <Harness
        transactions={marchRows()}
        initialHousehold
        onNavigateToTransactions={() => {}}
      />
    )
    expect(
      screen.getByRole('button', { name: 'Ver los gastos en Alimentación' })
    ).toBeInTheDocument()
    // The hand-set restaurant row's category appears with its household
    // part only (US$ 40,00), not the plain row's 60 on top.
    const row = screen.getByRole('button', {
      name: 'Ver los gastos en Restaurantes',
    })
    expect(row).toHaveTextContent('US$ 40,00')
    expect(row).not.toHaveTextContent('US$ 100,00')
  })

  it('keeps the Todo month when the newest month has no household spend', () => {
    const rows = [
      ...marchRows().map((t) => ({
        ...t,
        date: new Date('2026-02-10T00:00:00.000Z'),
      })),
      tx({
        description: 'Cena afuera',
        category: Category.Restaurants,
        date: new Date('2026-03-20T00:00:00.000Z'),
        amount: 80,
      }),
    ]
    render(<Harness transactions={rows} />)
    chooseHogar()
    const hero = screen.getByRole('heading', { name: /Gastos del hogar/ })
    expect(hero).toHaveTextContent(/Marzo de 2026/)
    expect(hero).toHaveTextContent('Gastos del hogar US$ 0,00')
  })

  it('changes the Hogar numbers when a category default changes, without a remount', () => {
    const rows = marchRows()
    const { rerender } = render(
      <Harness transactions={rows} initialHousehold />
    )
    expect(
      screen.getByRole('heading', { name: /Gastos del hogar/ })
    ).toHaveTextContent('US$ 190,00')

    // Restaurantes becomes a household category: Resto plano joins in.
    act(() => {
      upsertBuiltinOverride(Category.Restaurants, { isHousehold: true })
    })
    // The category store is read at render, like Transacciones does.
    rerender(<Harness transactions={rows} initialHousehold />)
    expect(
      screen.getByRole('heading', { name: /Gastos del hogar/ })
    ).toHaveTextContent('US$ 250,00')
  })

  it('changes the Hogar numbers when a row’s own choice changes', () => {
    const rows = marchRows()
    const { rerender } = render(
      <Harness transactions={rows} initialHousehold />
    )
    const flipped = rows.map((t) =>
      t.description === 'Super Uno' ? { ...t, household: false } : t
    )
    rerender(<Harness transactions={flipped} initialHousehold />)
    expect(
      screen.getByRole('heading', { name: /Gastos del hogar/ })
    ).toHaveTextContent('US$ 90,00')
  })

  describe('every drill-through carries household', () => {
    function setup() {
      const go = vi.fn()
      render(
        <Harness
          transactions={marchRows()}
          initialHousehold
          onNavigateToTransactions={go}
        />
      )
      return go
    }

    it('a category slice', () => {
      const go = setup()
      fireEvent.click(
        screen.getByRole('button', { name: 'Ver los gastos en Alimentación' })
      )
      expect(go).toHaveBeenCalledWith({
        categories: [Category.Groceries],
        type: 'debit',
        household: 'household',
      })
    })

    it('a merchant', () => {
      const go = setup()
      fireEvent.click(
        screen.getByRole('button', { name: 'Ver los gastos en Super Uno' })
      )
      expect(go).toHaveBeenCalledWith({
        merchant: 'super uno',
        type: 'debit',
        household: 'household',
      })
    })

    it('an account card', () => {
      const go = setup()
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Ver los gastos de Tarjeta de crédito',
        })
      )
      expect(go).toHaveBeenCalledWith({
        accountType: 'credit_card',
        type: 'debit',
        household: 'household',
      })
    })

    it('a month bar', () => {
      const go = setup()
      fireEvent.click(
        screen.getByRole('button', { name: /Ver los gastos de mar/ })
      )
      expect(go).toHaveBeenCalledWith({
        period: { mode: 'month', y: 2026, m: 2 },
        type: 'debit',
        household: 'household',
      })
    })

    it('the hero link opens the month’s household expenses', () => {
      const go = setup()
      fireEvent.click(
        screen.getByRole('button', { name: 'Ver los gastos del hogar del mes' })
      )
      expect(go).toHaveBeenCalledWith({
        period: { mode: 'month', y: 2026, m: 2 },
        type: 'debit',
        household: 'household',
      })
    })
  })

  it('sends no household key from Todo mode', () => {
    const go = vi.fn()
    render(<Harness transactions={marchRows()} onNavigateToTransactions={go} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Ver los gastos en Alimentación' })
    )
    expect(go).toHaveBeenCalledWith({
      categories: [Category.Groceries],
      type: 'debit',
    })
  })

  describe('with no household spend at all', () => {
    const rows = () => [
      tx({ category: Category.Restaurants, description: 'Resto plano' }),
    ]

    it('says so and points to Categorías, instead of zeroed cards', () => {
      const goCategories = vi.fn()
      render(
        <Harness
          transactions={rows()}
          initialHousehold
          onNavigateToCategories={goCategories}
        />
      )
      expect(
        screen.getByText('Todavía no hay gastos del hogar')
      ).toBeInTheDocument()
      expect(screen.queryByText('Gasto por categoría')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /Categorías/ }))
      expect(goCategories).toHaveBeenCalled()
    })

    it('keeps the toggle so you can go back to Todo', () => {
      render(<Harness transactions={rows()} initialHousehold />)
      fireEvent.click(screen.getByRole('radio', { name: 'Todo' }))
      expect(screen.getByText(/Gastaste/)).toBeInTheDocument()
    })
  })
})

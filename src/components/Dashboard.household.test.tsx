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
  homeCurrency = 'USD',
  onNavigateToTransactions,
  onNavigateToCategories,
}: {
  transactions: Transaction[]
  homeCurrency?: 'USD' | 'UYU'
  initialHousehold?: boolean
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
  onNavigateToCategories?: () => void
}) {
  const [household, setHousehold] = useState(initialHousehold)
  return (
    <Dashboard
      transactions={transactions}
      homeCurrency={homeCurrency}
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

  it('Hogar mode shows the same rate line under its hero (#276)', () => {
    render(<Harness transactions={marchRows()} initialHousehold />)

    const hero = screen.getByRole('heading', { name: /Gastos del hogar/ })
    const rate = screen.getByText(
      (_, el) => el?.textContent === '1 US$ = $U 40,00 (manual)',
      { selector: 'span' }
    )
    expect(
      hero.compareDocumentPosition(rate) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('shows the same comparisons hint in both modes, from every row', () => {
    // Household rows alone (card groceries Aug–Oct) would compare; the USD
    // account has no August row, so every row says Aug is missing it.
    const bank = {
      source: 'bank_account' as const,
      currency: 'USD' as const,
      category: Category.Restaurants,
    }
    render(
      <Harness
        transactions={[
          tx({ date: new Date('2026-08-01T00:00:00.000Z') }),
          tx({ date: new Date('2026-09-15T00:00:00.000Z') }),
          tx({ date: new Date('2026-10-28T00:00:00.000Z') }),
          tx({ ...bank, date: new Date('2026-09-01T00:00:00.000Z') }),
          tx({ ...bank, date: new Date('2026-10-29T00:00:00.000Z') }),
        ]}
      />
    )
    const expectHint = () => {
      expect(
        screen.getByText(
          'Comparaciones mes a mes: a partir de 3 meses completos seguidos (tenés 2)'
        )
      ).toBeInTheDocument()
      expect(
        screen.getByText('A ago. 2026 le faltan datos de Cuenta USD')
      ).toBeInTheDocument()
      expect(screen.queryByText(/Qué cambió/)).not.toBeInTheDocument()
    }
    expectHint()
    chooseHogar()
    expectHint()
  })

  it('offers Todo / Hogar, with Todo selected by default', () => {
    render(<Harness transactions={marchRows()} />)
    const group = screen.getByRole('radiogroup', { name: 'Ver gastos' })
    expect(within(group).getByRole('radio', { name: 'Todo' })).toBeChecked()
    expect(
      within(group).getByRole('radio', { name: 'Hogar' })
    ).not.toBeChecked()
  })

  it('labels the Todo / Hogar toggle "Ver:" on Resumen', () => {
    render(<Harness transactions={marchRows()} />)
    const group = screen.getByRole('radiogroup', { name: 'Ver gastos' })
    const label = screen.getByText('Ver:')

    expect(
      label.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(label.parentElement?.querySelector('svg')).toBeNull()
  })

  it('the hero\'s eyebrow names the month and the currency, without "todo"', () => {
    const { unmount } = render(<Harness transactions={marchRows()} />)
    expect(screen.getByRole('heading', { name: /Gastaste/ })).toHaveTextContent(
      /Marzo de 2026 · en dólares/
    )
    chooseHogar()
    expect(
      screen.getByRole('heading', { name: /Gastos del hogar/ })
    ).toHaveTextContent(/Marzo de 2026 · en dólares/)
    expect(screen.queryByText(/todo en/)).toBeNull()
    unmount()

    render(<Harness transactions={marchRows()} homeCurrency="UYU" />)
    expect(screen.getByRole('heading', { name: /Gastaste/ })).toHaveTextContent(
      /Marzo de 2026 · en pesos/
    )
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
    expect(hero).toHaveTextContent(/Marzo de 2026 · en dólares/)
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
      expect(
        screen.getByText(/tocá el ícono de la casa en cada transacción/)
      ).toBeVisible()
      expect(screen.queryByText(/casita/i)).toBeNull()
      expect(screen.queryByText('Gasto por categoría')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /Categorías/ }))
      expect(goCategories).toHaveBeenCalled()
    })

    it('keeps the mode toggle in the header and shows no rate line (#276)', () => {
      render(<Harness transactions={rows()} initialHousehold />)
      expect(
        screen.getByRole('radiogroup', { name: 'Ver gastos' })
      ).toBeInTheDocument()
      expect(screen.queryByText(/1 US\$ =/)).toBeNull()
    })

    it('keeps the toggle so you can go back to Todo', () => {
      render(<Harness transactions={rows()} initialHousehold />)
      fireEvent.click(screen.getByRole('radio', { name: 'Todo' }))
      expect(screen.getByText(/Gastaste/)).toBeInTheDocument()
    })
  })

  describe('Sin categoría in Hogar mode', () => {
    // Uncategorized rows with no choice are not household: March 30 + Feb
    // 800 UYU (= 20) -> 50 all time; households stay 190.
    const withUncategorized = () => [
      ...marchRows(),
      tx({
        description: 'Cosa rara',
        amount: 30,
        category: Category.Uncategorized,
      }),
      tx({
        description: 'Cosa vieja',
        amount: 800,
        currency: 'UYU',
        category: Category.Uncategorized,
        date: new Date('2026-02-10T00:00:00.000Z'),
      }),
    ]
    const nudge = () =>
      screen.getByRole('button', { name: 'Ver los gastos sin categoría' })

    function setup(rows = withUncategorized(), initialHousehold = true) {
      const go = vi.fn()
      render(
        <Harness
          transactions={rows}
          initialHousehold={initialHousehold}
          onNavigateToTransactions={go}
        />
      )
      return go
    }

    it('keeps uncategorized rows out of the household total', () => {
      setup()
      expect(
        screen.getByRole('heading', { name: /Gastos del hogar/ })
      ).toHaveTextContent('Gastos del hogar US$ 190,00')
    })

    it('shows the same Sin categoría nudge as Todo (all time, all rows)', () => {
      setup()
      const hogar = nudge().textContent
      expect(nudge()).toHaveTextContent('US$ 50,00')
      expect(nudge()).toHaveTextContent('2 gastos · todo el historial')
      fireEvent.click(screen.getByRole('radio', { name: 'Todo' }))
      expect(nudge().textContent).toBe(hogar)
    })

    it('opens the uncategorized expenses without the household filter', () => {
      const go = setup()
      fireEvent.click(nudge())
      expect(go).toHaveBeenCalledWith({
        categories: [Category.Uncategorized],
        type: 'debit',
      })
    })

    it('has no nudge when nothing is uncategorized', () => {
      setup(marchRows())
      expect(
        screen.queryByRole('button', { name: 'Ver los gastos sin categoría' })
      ).not.toBeInTheDocument()
    })

    it('says nothing of Sin definir, in either mode', () => {
      setup()
      expect(screen.queryByText(/Sin definir/)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('radio', { name: 'Todo' }))
      expect(screen.queryByText(/Sin definir/)).not.toBeInTheDocument()
    })
  })

  describe('the household share, in Todo mode', () => {
    it('says how much of the month’s spend was for the household', () => {
      render(<Harness transactions={marchRows()} />)
      expect(
        screen.getByRole('button', {
          name: 'Hogar US$ 190,00 de US$ 250,00 gastados: ver solo los gastos del hogar',
        })
      ).toBeInTheDocument()
      // The hero sentence is unchanged.
      expect(
        screen.getByRole('heading', { name: /Gastaste/ })
      ).toHaveTextContent('Gastaste US$ 250,00')
    })

    it('switches Resumen to Hogar mode when clicked', () => {
      render(<Harness transactions={marchRows()} />)
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Hogar US$ 190,00 de US$ 250,00 gastados: ver solo los gastos del hogar',
        })
      )
      expect(
        screen.getByRole('heading', { name: /Gastos del hogar/ })
      ).toHaveTextContent('US$ 190,00')
      expect(screen.getByRole('radio', { name: 'Hogar' })).toBeChecked()
    })

    it('does not navigate away', () => {
      const go = vi.fn()
      render(
        <Harness transactions={marchRows()} onNavigateToTransactions={go} />
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: /^Hogar US\$ 190,00 de .*: ver solo los gastos del hogar$/,
        })
      )
      expect(go).not.toHaveBeenCalled()
    })

    it('is hidden when the month has no household spend', () => {
      render(
        <Harness
          transactions={[
            tx({ category: Category.Restaurants, description: 'Resto plano' }),
          ]}
        />
      )
      expect(screen.queryByText(/gastados$/)).not.toBeInTheDocument()
    })

    it('is gone in Hogar mode', () => {
      render(<Harness transactions={marchRows()} initialHousehold />)
      expect(screen.queryByText(/gastados$/)).not.toBeInTheDocument()
    })
  })

  describe('review round 1', () => {
    it('shows only the no-transactions state on ?hogar=si with no rows', () => {
      render(<Harness transactions={[]} initialHousehold />)
      expect(
        screen.getByText('Empezá importando tu extracto')
      ).toBeInTheDocument()
      expect(
        screen.queryByText('Todavía no hay gastos del hogar')
      ).not.toBeInTheDocument()
    })

    it('keeps a month with no household spend in "Mes a mes", at the same months as Todo', () => {
      const rows = [
        tx({ amount: 100, date: new Date('2026-01-10T00:00:00.000Z') }),
        tx({
          amount: 60,
          category: Category.Restaurants,
          date: new Date('2026-02-10T00:00:00.000Z'),
        }),
        tx({ amount: 100, date: new Date('2026-03-10T00:00:00.000Z') }),
      ]
      const months = () =>
        screen
          .getAllByRole('button', { name: /^Ver los gastos de (ene|feb|mar)/ })
          .map((b) => b.textContent)
      const { unmount } = render(
        <Harness transactions={rows} onNavigateToTransactions={() => {}} />
      )
      const todo = months()
      expect(todo).toHaveLength(3)
      expect(screen.getByText(/Últimos 3 meses con datos/)).toBeInTheDocument()
      unmount()

      render(
        <Harness
          transactions={rows}
          initialHousehold
          onNavigateToTransactions={() => {}}
        />
      )
      // The axis keeps the three months (the label below counts them); the
      // $0 one has no drill of its own (round 2).
      expect(months()).toEqual(todo.filter((m) => !/feb/.test(m ?? '')))
      expect(screen.getByText(/Últimos 3 meses con datos/)).toBeInTheDocument()
    })

    it('the empty Hogar state shows the Sin categoría nudge', () => {
      render(
        <Harness
          transactions={[
            tx({ category: Category.Restaurants, description: 'Resto plano' }),
            tx({ category: Category.Uncategorized, amount: 30 }),
          ]}
          initialHousehold
          onNavigateToTransactions={() => {}}
        />
      )
      expect(
        screen.getByText('Todavía no hay gastos del hogar')
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Ver los gastos sin categoría' })
      ).toHaveTextContent('US$ 30,00')
    })

    it('hides the household link at $0', () => {
      render(
        <Harness
          transactions={[
            tx({ date: new Date('2026-02-10T00:00:00.000Z') }),
            tx({
              category: Category.Restaurants,
              amount: 80,
              date: new Date('2026-03-20T00:00:00.000Z'),
            }),
          ]}
          initialHousehold
          onNavigateToTransactions={() => {}}
        />
      )
      expect(
        screen.queryByRole('button', {
          name: 'Ver los gastos del hogar del mes',
        })
      ).not.toBeInTheDocument()
    })

    it('moves focus to the hero after the share button switches the mode', () => {
      render(<Harness transactions={marchRows()} />)
      fireEvent.click(
        screen.getByRole('button', { name: /: ver solo los gastos del hogar$/ })
      )
      expect(
        screen.getByRole('heading', { name: /Gastos del hogar/ })
      ).toHaveFocus()
    })
  })

  describe('review round 2', () => {
    const rows = () => [
      tx({ amount: 100, date: new Date('2026-01-10T00:00:00.000Z') }),
      tx({
        amount: 60,
        category: Category.Restaurants,
        date: new Date('2026-02-10T00:00:00.000Z'),
      }),
      tx({ amount: 100, date: new Date('2026-03-10T00:00:00.000Z') }),
    ]
    const drill = (month: string) =>
      screen.queryByRole('button', {
        name: new RegExp(`^Ver los gastos de ${month}`),
      })

    it('has no drill for a month with no household spend', () => {
      render(
        <Harness
          transactions={rows()}
          initialHousehold
          onNavigateToTransactions={() => {}}
        />
      )
      expect(drill('ene')).toBeInTheDocument()
      expect(drill('mar')).toBeInTheDocument()
      expect(drill('feb')).not.toBeInTheDocument()
    })

    it('keeps every month’s drill in Todo mode', () => {
      render(
        <Harness transactions={rows()} onNavigateToTransactions={() => {}} />
      )
      expect(drill('feb')).toBeInTheDocument()
    })
  })
})

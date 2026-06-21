import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Dashboard } from './Dashboard'
import type { Transaction } from '../models'
import { Category } from '../models'
import * as descriptionOverrides from '../services/descriptions/description-overrides'
import { replaceCustomCategories } from '../services/categories/category-store'

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2026-01-10T00:00:00.000Z'),
    description: 'sample',
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
    ...overrides,
  }
}

describe('Dashboard', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('shows empty state with import CTA when there are no transactions', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-20T12:00:00.000Z'))

    render(<Dashboard transactions={[]} />)

    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
    expect(screen.getByText('Empezá importando tu extracto')).toBeInTheDocument()
    expect(screen.queryByText('Panel General')).not.toBeInTheDocument()

    vi.useRealTimers()
  })

  it('shows converted+combined totals in home currency', () => {
    const transactions = [
      makeTransaction({ id: 'uyu-debit', currency: 'UYU', type: 'debit', amount: 1000 }),
      makeTransaction({ id: 'usd-debit', currency: 'USD', type: 'debit', amount: 50 }),
      makeTransaction({ id: 'usd-credit', currency: 'USD', type: 'credit', amount: 200, category: Category.Income }),
    ]

    // homeCurrency defaults to 'USD', fxRate defaults to 40.5
    // income = 200 USD (only Category.Income credits count), expenses = 50 USD + 1000/40 ≈ 25 USD
    render(<Dashboard transactions={transactions} homeCurrency="USD" fxRate={40} />)

    // income = 200 USD appears in "Este mes" panel
    expect(screen.getByText('US$ 200,00')).toBeInTheDocument()
    // UYU transaction native amount appears in recent list (sign and amount share one span)
    expect(screen.getAllByText(/\$U 1\.000,00/).length).toBeGreaterThan(0)
    // Converted secondary line appears for the UYU tx (≈ USD)
    expect(screen.getAllByText(/≈ US\$/).length).toBeGreaterThan(0)
  })

  it('uses description-overrides service when displayDescription is absent', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'))
    vi.spyOn(descriptionOverrides, 'getDescriptionOverride').mockImplementation(
      (desc) =>
        desc === 'SUPERMERCADO DEVOTO SA 0032'
          ? { friendlyDescription: 'Devoto', updatedAt: '2026-01-01' }
          : null,
    )

    const tx = makeTransaction({
      id: 'tx-override',
      description: 'SUPERMERCADO DEVOTO SA 0032',
      amount: 500,
      currency: 'UYU',
      type: 'debit',
      date: new Date('2026-01-10T00:00:00.000Z'),
    })

    render(<Dashboard transactions={[tx]} />)

    expect(screen.getAllByText('Devoto').length).toBeGreaterThan(0)
    expect(screen.queryByText('SUPERMERCADO DEVOTO SA 0032')).not.toBeInTheDocument()

    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('does not count transfer debits as expenses in converted totals', () => {
    const transactions = [
      makeTransaction({
        id: 'normal-expense',
        currency: 'USD',
        type: 'debit',
        amount: 50,
        category: Category.Groceries,
      }),
      makeTransaction({
        id: 'internal-transfer',
        currency: 'USD',
        type: 'debit',
        amount: 100,
        category: Category.InternalTransfer,
      }),
    ]

    // homeCurrency=USD, so expense total = 50 (transfer excluded)
    render(<Dashboard transactions={transactions} homeCurrency="USD" fxRate={40} />)

    // 50 appears (native + converted total)
    expect(screen.getAllByText('US$ 50,00').length).toBeGreaterThan(0)
    // 150 should NOT appear (transfer excluded from totals)
    expect(screen.queryByText('US$ 150,00')).not.toBeInTheDocument()
  })

  it('does not show NaN/Infinity with credit-only transactions', () => {
    const transactions = [
      makeTransaction({
        id: 'credit-only',
        type: 'credit',
        amount: 300,
        category: Category.Income,
      }),
    ]

    render(<Dashboard transactions={transactions} />)

    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
  })

  it('renders category breakdown from expense data', () => {
    const transactions = [
      makeTransaction({ id: 'food-1', category: Category.Groceries, amount: 100 }),
      makeTransaction({ id: 'food-2', category: Category.Groceries, amount: 50 }),
      makeTransaction({ id: 'transport-1', category: Category.Transport, amount: 30 }),
    ]

    render(<Dashboard transactions={transactions} />)

    expect(screen.getAllByText('Alimentación').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Transporte').length).toBeGreaterThan(0)
  })

  it('includes normal merchants in Mayores comercios section', () => {
    const transactions = [
      makeTransaction({
        id: 'ignored-1',
        description: 'MERCHANT IGNORED',
        category: 'ignored' as Category,
        amount: 9999,
      }),
      makeTransaction({
        id: 'normal-1',
        description: 'NORMAL MERCHANT',
        category: Category.Transport,
        amount: 10,
      }),
    ]

    render(<Dashboard transactions={transactions} />)

    // Mayores comercios section must render
    expect(screen.getByText('Mayores comercios')).toBeInTheDocument()
    // Normal merchant (passes filter) appears in the merchants list
    expect(screen.getAllByText('NORMAL MERCHANT').length).toBeGreaterThan(0)
  })

  it('excludes merchants whose category has isIgnored flag from Mayores comercios', () => {
    replaceCustomCategories([
      { id: 'salary', label: 'Salary', color: '#000', isIgnored: true },
    ])
    // Build 7 normal transactions so the salary one doesn't appear in recent (top 6)
    const normalTxs = Array.from({ length: 7 }, (_, i) =>
      makeTransaction({
        id: `normal-${i}`,
        description: 'GROCERY STORE',
        category: Category.Transport,
        amount: 50,
        date: new Date(2026, 0, 20 + i),
      }),
    )
    const transactions = [
      makeTransaction({
        id: 'salary-1',
        description: 'EMPLOYER DEPOSIT',
        category: 'salary' as Category,
        amount: 5000,
        date: new Date(2026, 0, 1),
      }),
      ...normalTxs,
    ]

    render(<Dashboard transactions={transactions} />)

    // Salary (isIgnored) must not appear in merchants section (it also won't be in recent — pushed out by 7 newer ones)
    expect(screen.queryByText('EMPLOYER DEPOSIT')).not.toBeInTheDocument()
    expect(screen.getAllByText('GROCERY STORE').length).toBeGreaterThan(0)
  })

  it('renders all major section headings', () => {
    const transactions = [
      makeTransaction({ id: 'food-1', category: Category.Groceries, amount: 200 }),
      makeTransaction({ id: 'transport-1', category: Category.Transport, amount: 80 }),
      makeTransaction({
        id: 'income-1',
        type: 'credit',
        category: Category.Income,
        amount: 500,
      }),
    ]

    render(<Dashboard transactions={transactions} />)

    expect(screen.getByText('Gasto por categoría')).toBeInTheDocument()
    expect(screen.getByText('Ingresos vs Gastos')).toBeInTheDocument()
    expect(screen.getByText('¿Estás ahorrando?')).toBeInTheDocument()
    expect(screen.getByText('Gasto por moneda')).toBeInTheDocument()
    expect(screen.getByText('Mayores comercios')).toBeInTheDocument()
  })
})

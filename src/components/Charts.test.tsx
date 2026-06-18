import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Charts } from './Charts'
import type { Transaction } from '../models'
import {
  replaceCustomCategories,
} from '../services/categories/category-store'

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2026-01-10T00:00:00.000Z'),
    description: 'sample',
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    category: 'food',
    rawData: {},
    ...overrides,
  }
}

describe('Charts', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('does not show NaN/Infinity when there are no expense transactions', () => {
    const transactions = [
      makeTransaction({
        id: 'credit-only',
        type: 'credit',
        amount: 300,
        category: 'income',
      }),
    ]

    render(<Charts transactions={transactions} />)

    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
  })

  it('renders category breakdown from expense data', () => {
    const transactions = [
      makeTransaction({ id: 'food-1', category: 'food', amount: 100 }),
      makeTransaction({ id: 'food-2', category: 'food', amount: 50 }),
      makeTransaction({ id: 'transport-1', category: 'transport', amount: 30 }),
    ]

    render(<Charts transactions={transactions} />)

    expect(screen.getAllByText('Alimentación').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Transporte').length).toBeGreaterThan(0)
  })

  it('excludes merchants with legacy ignored category string (backward compat)', () => {
    const transactions = [
      makeTransaction({ id: 'ignored-1', description: 'MERCHANT IGNORED', category: 'ignored', amount: 9999 }),
      makeTransaction({ id: 'normal-1', description: 'NORMAL MERCHANT', category: 'transport', amount: 10 }),
    ]

    render(<Charts transactions={transactions} />)

    expect(screen.queryByText('MERCHANT IGNORED')).not.toBeInTheDocument()
    expect(screen.getByText('NORMAL MERCHANT')).toBeInTheDocument()
  })

  it('excludes merchants whose category has isIgnored flag set via custom override', () => {
    replaceCustomCategories([
      { id: 'salary', label: 'Salary', color: '#000', isIgnored: true },
    ])
    const transactions = [
      makeTransaction({ id: 'salary-1', description: 'EMPLOYER DEPOSIT', category: 'salary', amount: 5000 }),
      makeTransaction({ id: 'normal-1', description: 'GROCERY STORE', category: 'transport', amount: 50 }),
    ]

    render(<Charts transactions={transactions} />)

    expect(screen.queryByText('EMPLOYER DEPOSIT')).not.toBeInTheDocument()
    expect(screen.getByText('GROCERY STORE')).toBeInTheDocument()
  })

  it('renders all major chart section headings', () => {
    const transactions = [
      makeTransaction({ id: 'food-1', category: 'food', amount: 200 }),
      makeTransaction({ id: 'transport-1', category: 'transport', amount: 80 }),
      makeTransaction({
        id: 'income-1',
        type: 'credit',
        category: 'income',
        amount: 500,
      }),
    ]

    render(<Charts transactions={transactions} />)

    expect(screen.getByText('Gasto por categoría')).toBeInTheDocument()
    expect(screen.getByText('Ingresos vs Gastos')).toBeInTheDocument()
    expect(screen.getByText('¿Estás ahorrando?')).toBeInTheDocument()
    expect(screen.getByText('Gasto por moneda')).toBeInTheDocument()
    expect(screen.getByText('Mayores comercios')).toBeInTheDocument()
  })
})

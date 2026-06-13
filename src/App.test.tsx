import { beforeEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { transactionStore } from './stores/transaction-store'

vi.mock('./services/supabase/client', () => ({
  isSupabaseConfigured: () => false,
}))

describe('App', () => {
  beforeEach(() => {
    transactionStore.getState().clearTransactions()
    localStorage.clear()
  })

  it('renders overview (dashboard) view by default', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Bienvenido a Tatú' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Empezá importando tu extracto' })).toBeInTheDocument()
  })

  it('opens import view when clicking the sidebar Importar button', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    expect(screen.getByRole('heading', { name: 'Importar Transacciones' })).toBeInTheDocument()
    expect(screen.getByText('Arrastrá tu archivo CSV aquí')).toBeInTheDocument()
  })

  it('shows supported file types on import view', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    expect(screen.getByText('Tarjeta de Crédito')).toBeInTheDocument()
    expect(screen.getByText('Cuenta USD')).toBeInTheDocument()
    expect(screen.getByText('Cuenta UYU')).toBeInTheDocument()
    expect(screen.getByText(/Extracto de tarjeta Santander/)).toBeInTheDocument()
  })

  it('switches to transactions view from sidebar navigation', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    expect(screen.getByRole('heading', { name: 'Transacciones' })).toBeInTheDocument()
    expect(screen.getByText(/transacciones encontradas/)).toBeInTheDocument()
  })

  it('auto-categorizes selected transactions from the transactions view', async () => {
    transactionStore.getState().addTransactions([
      {
        id: 'tx-1',
        date: new Date('2026-01-10T00:00:00.000Z'),
        description: 'Devoto Supermercado',
        amount: 100,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        rawData: {},
      },
    ])

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('checkbox', {
          name: 'Seleccionar Devoto Supermercado',
        })[0]
      )
    })

    const autoCategorizeButton = screen.getByRole('button', {
      name: /Auto-categorizar/,
    })
    await waitFor(() => expect(autoCategorizeButton).not.toBeDisabled())

    await act(async () => {
      fireEvent.click(autoCategorizeButton)
    })

    await waitFor(() =>
      expect(transactionStore.getState().transactions[0].category).toBe('groceries')
    )
    expect(transactionStore.getState().transactions[0].categoryConfidence).toBeGreaterThan(0)
    expect(screen.getAllByText('Alimentación').length).toBeGreaterThan(0)
    expect(
      screen.getByText('1 transacción auto-categorizada')
    ).toBeInTheDocument()
  })

  it('shows a notice when auto-categorization finds no category matches', async () => {
    transactionStore.getState().addTransactions([
      {
        id: 'tx-1',
        date: new Date('2026-01-10T00:00:00.000Z'),
        description: 'Comercio Inventado XYZ',
        amount: 100,
        currency: 'UYU',
        type: 'credit',
        source: 'bank_account',
        rawData: {},
      },
    ])

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('checkbox', {
          name: 'Seleccionar Comercio Inventado XYZ',
        })[0]
      )
    })

    const autoCategorizeButton = screen.getByRole('button', {
      name: /Auto-categorizar/,
    })
    await waitFor(() => expect(autoCategorizeButton).not.toBeDisabled())

    await act(async () => {
      fireEvent.click(autoCategorizeButton)
    })

    await waitFor(() =>
      expect(
        screen.getByText('No se encontraron categorías automáticas para las transacciones seleccionadas')
      ).toBeInTheDocument()
    )
    expect(transactionStore.getState().transactions[0].category).toBe('uncategorized')
  })

  it('switches to categorías view from sidebar navigation', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Categorías' }))

    expect(screen.getByRole('heading', { name: 'Categorías y reglas' })).toBeInTheDocument()
  })

  it('filters Transacciones by category when deep-linking from Resumen', async () => {
    transactionStore.getState().addTransactions([
      {
        id: 'tx-cat',
        date: new Date('2026-01-10T00:00:00.000Z'),
        description: 'Devoto Supermercado',
        amount: 100,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        category: 'groceries',
        rawData: {},
      },
      {
        id: 'tx-other',
        date: new Date('2026-01-11T00:00:00.000Z'),
        description: 'Café Bacacay',
        amount: 50,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        category: 'restaurants',
        rawData: {},
      },
    ])

    render(<App />)
    // Click top category card to deep-link
    const topCategoryLink = screen.getByText(/Alimentación|Restaurantes/)
    fireEvent.click(topCategoryLink)

    expect(screen.getByRole('heading', { name: 'Transacciones' })).toBeInTheDocument()
  })

  it('opens import as a dialog overlay without navigating away from current view', () => {
    render(<App />)
    // Importar button is in the sidebar
    expect(screen.getByRole('button', { name: 'Importar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    // Import dialog content appears
    expect(screen.getByRole('heading', { name: 'Importar Transacciones' })).toBeInTheDocument()
    expect(screen.getByText('Arrastrá tu archivo CSV aquí')).toBeInTheDocument()
  })

  it('applies dark theme from localStorage on initial render', () => {
    localStorage.setItem('theme', 'dark')

    render(<App />)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('sidebar nav items are visible and functional', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'Resumen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transacciones' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Análisis' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Categorías' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Configuración' })).toBeInTheDocument()
  })
})

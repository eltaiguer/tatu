import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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

  it('renders dashboard view by default', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Bienvenido a Tatú' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Panel General' })).toBeInTheDocument()
  })

  it('switches to import view from navigation', () => {
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

  it('switches to transactions view from navigation', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    expect(screen.getByRole('heading', { name: 'Transacciones' })).toBeInTheDocument()
    expect(screen.getByText(/transacciones encontradas/)).toBeInTheDocument()
  })

  it('switches to tools view from navigation', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Herramientas' }))

    expect(screen.getByRole('heading', { name: 'Herramientas' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Filtros Avanzados' })).toBeInTheDocument()
  })

  it('applies dark theme from localStorage on initial render', () => {
    localStorage.setItem('theme', 'dark')

    render(<App />)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('opens mobile menu and closes it when selecting a view', () => {
    const { container } = render(<App />)
    const menuToggle = container.querySelector(
      'button.md\\:hidden'
    ) as HTMLButtonElement

    expect(menuToggle).toBeTruthy()
    fireEvent.click(menuToggle)
    expect(screen.getByText('Modo oscuro')).toBeInTheDocument()

    const importButtons = screen.getAllByRole('button', { name: 'Importar' })
    fireEvent.click(importButtons[importButtons.length - 1])
    expect(screen.queryByText('Modo oscuro')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Importar Transacciones' })).toBeInTheDocument()
  })
})

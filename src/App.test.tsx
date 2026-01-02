import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

describe('App', () => {
  it('renders import page on /import route', () => {
    render(
      <MemoryRouter initialEntries={['/import']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByText('Importar Transacciones')).toBeInTheDocument()
    expect(
      screen.getByText('Arrastrá tu archivo CSV aquí')
    ).toBeInTheDocument()
  })

  it('shows supported file types on import page', () => {
    render(
      <MemoryRouter initialEntries={['/import']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByText('Tarjeta de Crédito')).toBeInTheDocument()
    expect(screen.getByText('Cuenta USD')).toBeInTheDocument()
    expect(screen.getByText('Cuenta UYU')).toBeInTheDocument()
    expect(
      screen.getByText(/Extracto de tarjeta Santander/)
    ).toBeInTheDocument()
  })

  it('redirects root to import when no data is loaded', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )

    expect(
      screen.getByText('Arrastrá tu archivo CSV aquí')
    ).toBeInTheDocument()
  })

  it('redirects transactions route to import when no data is loaded', () => {
    render(
      <MemoryRouter initialEntries={['/transactions']}>
        <App />
      </MemoryRouter>
    )

    expect(
      screen.getByText('Arrastrá tu archivo CSV aquí')
    ).toBeInTheDocument()
  })

  it('renders the tools page', () => {
    render(
      <MemoryRouter initialEntries={['/tools']}>
        <App />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Herramientas' })).toBeInTheDocument()
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
  })
})

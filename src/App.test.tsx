import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

describe('App', () => {
  it('renders file upload component initially', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByText('Importar Transacciones')).toBeInTheDocument()
    expect(
      screen.getByText('Arrastrá tu archivo CSV aquí')
    ).toBeInTheDocument()
  })

  it('shows supported file types information', () => {
    render(
      <MemoryRouter>
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

  it('redirects section routes to import when no data is loaded', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    )

    expect(
      screen.getByText('Arrastrá tu archivo CSV aquí')
    ).toBeInTheDocument()
  })

  it('renders the tools placeholder route', () => {
    render(
      <MemoryRouter initialEntries={['/tools']}>
        <App />
      </MemoryRouter>
    )

    expect(screen.getByText('Coming soon')).toBeInTheDocument()
  })
})

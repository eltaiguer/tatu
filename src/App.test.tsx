import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

describe('App', () => {
  it('renders the app title', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByText('Tatu - Expense Tracker')).toBeInTheDocument()
  })

  it('renders the subtitle', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    expect(
      screen.getByText('Santander Uruguay Bank Statement Parser')
    ).toBeInTheDocument()
  })

  it('renders file upload component initially', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    expect(
      screen.getByText('Drop your Santander CSV file here')
    ).toBeInTheDocument()
  })

  it('shows supported file types information', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByText('Supported File Types')).toBeInTheDocument()
    expect(screen.getByText(/Credit Card Statements/)).toBeInTheDocument()
    expect(screen.getByText(/USD Bank Account/)).toBeInTheDocument()
    expect(screen.getByText(/UYU Bank Account/)).toBeInTheDocument()
  })

  it('redirects section routes to import when no data is loaded', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    )

    expect(
      screen.getByText('Drop your Santander CSV file here')
    ).toBeInTheDocument()
  })
})

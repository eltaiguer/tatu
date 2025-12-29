import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the app title', () => {
    render(<App />)
    expect(screen.getByText('Tatú')).toBeInTheDocument()
  })

  it('renders the subtitle', () => {
    render(<App />)
    expect(
      screen.getByText('Gestor de gastos confiable y moderno')
    ).toBeInTheDocument()
  })

  it('renders file upload component initially', () => {
    render(<App />)
    expect(
      screen.getByText('Drop your Santander CSV file here')
    ).toBeInTheDocument()
  })

  it('shows supported file types information', () => {
    render(<App />)
    expect(screen.getByText('Supported File Types')).toBeInTheDocument()
    expect(screen.getByText(/Credit Card Statements/)).toBeInTheDocument()
    expect(screen.getByText(/USD Bank Account/)).toBeInTheDocument()
    expect(screen.getByText(/UYU Bank Account/)).toBeInTheDocument()
  })
})

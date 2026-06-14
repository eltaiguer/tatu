import { beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Settings } from './Settings'
import type { Transaction } from '../models'
import type { SupabaseSession } from '../services/supabase/client'

vi.mock('../services/supabase/client', () => ({
  isSupabaseConfigured: () => false,
}))

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
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

const mockSession: SupabaseSession = {
  user: { id: 'user-1', email: 'jose@example.uy' },
} as unknown as SupabaseSession

describe('Settings', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the page heading and Apariencia section with all theme options', () => {
    render(
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency="UYU"
        onSetCurrency={() => {}}
        session={null}
        supabaseEnabled={false}
        onSignOut={() => {}}
        transactions={[]}
      />
    )

    expect(
      screen.getByRole('heading', { name: 'Configuración' })
    ).toBeInTheDocument()
    expect(screen.getByText('Apariencia')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Claro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Auto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Oscuro' })).toBeInTheDocument()
  })

  it('calls onSetTheme with the selected value when clicking a theme button', () => {
    const onSetTheme = vi.fn()
    render(
      <Settings
        theme="light"
        onSetTheme={onSetTheme}
        preferredCurrency="UYU"
        onSetCurrency={() => {}}
        session={null}
        supabaseEnabled={false}
        onSignOut={() => {}}
        transactions={[]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Oscuro' }))
    expect(onSetTheme).toHaveBeenCalledWith('dark')

    fireEvent.click(screen.getByRole('button', { name: 'Auto' }))
    expect(onSetTheme).toHaveBeenCalledWith('auto')
  })

  it('calls onSetCurrency when clicking a currency button', () => {
    const onSetCurrency = vi.fn()
    render(
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency="UYU"
        onSetCurrency={onSetCurrency}
        session={null}
        supabaseEnabled={false}
        onSignOut={() => {}}
        transactions={[]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dólares US$' }))
    expect(onSetCurrency).toHaveBeenCalledWith('USD')
  })

  it('shows Conectado badge and sign-out button when session is active', () => {
    render(
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency="UYU"
        onSetCurrency={() => {}}
        session={mockSession}
        supabaseEnabled={true}
        onSignOut={() => {}}
        transactions={[]}
      />
    )

    expect(screen.getByText('Conectado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salir' })).toBeInTheDocument()
  })

  it('calls onSignOut when clicking Salir', () => {
    const onSignOut = vi.fn()
    render(
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency="UYU"
        onSetCurrency={() => {}}
        session={mockSession}
        supabaseEnabled={true}
        onSignOut={onSignOut}
        transactions={[]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('shows the correct privacy copy', () => {
    render(
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency="UYU"
        onSetCurrency={() => {}}
        session={null}
        supabaseEnabled={false}
        onSignOut={() => {}}
        transactions={[]}
      />
    )

    expect(
      screen.getByText(/Tus movimientos se guardan cifrados en tu cuenta/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Nunca compartimos tus datos financieros/)
    ).toBeInTheDocument()
  })

  it('calls onResetAllData after confirm on reset click', () => {
    const onReset = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency="UYU"
        onSetCurrency={() => {}}
        session={null}
        supabaseEnabled={false}
        onSignOut={() => {}}
        transactions={[makeTx()]}
        onResetAllData={onReset}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Resetear' }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})

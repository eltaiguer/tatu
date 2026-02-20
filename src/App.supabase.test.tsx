import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { transactionStore } from './stores/transaction-store'

const {
  getCurrentSessionMock,
  requestPasswordResetMock,
  signInWithPasswordMock,
  signOutMock,
  signUpWithPasswordMock,
  isSupabaseConfiguredMock,
  loadUserTransactionsMock,
  persistTransactionsMock,
} = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
  requestPasswordResetMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  signOutMock: vi.fn(),
  signUpWithPasswordMock: vi.fn(),
  isSupabaseConfiguredMock: vi.fn(),
  loadUserTransactionsMock: vi.fn(),
  persistTransactionsMock: vi.fn(),
}))

vi.mock('./services/supabase/client', () => ({
  isSupabaseConfigured: isSupabaseConfiguredMock,
}))

vi.mock('./services/supabase/auth', () => ({
  getCurrentSession: getCurrentSessionMock,
  requestPasswordReset: requestPasswordResetMock,
  signInWithPassword: signInWithPasswordMock,
  signOut: signOutMock,
  signUpWithPassword: signUpWithPasswordMock,
}))

vi.mock('./services/supabase/transactions', () => ({
  loadUserTransactions: loadUserTransactionsMock,
  persistTransactions: persistTransactionsMock,
}))

describe('App with supabase enabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    transactionStore.getState().clearTransactions()
    isSupabaseConfiguredMock.mockReturnValue(true)
    getCurrentSessionMock.mockReturnValue(null)
    loadUserTransactionsMock.mockResolvedValue([])
    persistTransactionsMock.mockResolvedValue(undefined)
    requestPasswordResetMock.mockResolvedValue(undefined)
    signOutMock.mockResolvedValue(undefined)
    signUpWithPasswordMock.mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 9999,
      user: { id: 'user-1', email: 'test@example.com' },
    })
  })

  it('renders authentication form when no session exists', async () => {
    const { default: App } = await import('./App')
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Ingresar a Tatú' })
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('email@ejemplo.com')).toBeInTheDocument()
  })

  it('signs in and loads transactions', async () => {
    signInWithPasswordMock.mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 9999,
      user: { id: 'user-1', email: 'test@example.com' },
    })

    const { default: App } = await import('./App')
    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('email@ejemplo.com'), {
      target: { value: 'test@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    await waitFor(() =>
      expect(signInWithPasswordMock).toHaveBeenCalledWith(
        'test@example.com',
        'secret123'
      )
    )

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Bienvenido a Tatú' })
      ).toBeInTheDocument()
    )
  })

  it('triggers password reset request', async () => {
    const { default: App } = await import('./App')
    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('email@ejemplo.com'), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }))

    await waitFor(() =>
      expect(requestPasswordResetMock).toHaveBeenCalledWith('test@example.com')
    )
  })

  it('migrates local persisted transactions after sign in', async () => {
    signInWithPasswordMock.mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 9999,
      user: { id: 'user-1', email: 'test@example.com' },
    })

    localStorage.setItem(
      'tatu:transactions',
      JSON.stringify({
        state: {
          transactions: [
            {
              id: 'tx-local-1',
              date: '2026-02-10T00:00:00.000Z',
              description: 'Local tx',
              amount: 100,
              currency: 'UYU',
              type: 'debit',
              source: 'bank_account',
              rawData: {},
            },
          ],
        },
        version: 0,
      })
    )

    const { default: App } = await import('./App')
    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('email@ejemplo.com'), {
      target: { value: 'test@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    await waitFor(() => expect(persistTransactionsMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByText('1 transacciones locales migradas')).toBeInTheDocument()
    )
  })
})

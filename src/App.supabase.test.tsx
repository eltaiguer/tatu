import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { transactionStore } from './stores/transaction-store'

const {
  getCurrentSessionMock,
  requestPasswordResetMock,
  signInWithPasswordMock,
  signOutMock,
  signUpWithPasswordMock,
  subscribeToAuthChangesMock,
  updatePasswordMock,
  isSupabaseConfiguredMock,
  loadUserTransactionsMock,
  persistTransactionsMock,
  softDeleteTransactionMock,
  updateTransactionMock,
  listCategoryOverridesMock,
  upsertCategoryOverrideMock,
  listCustomCategoriesMock,
  upsertCustomCategoryMock,
} = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
  requestPasswordResetMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  signOutMock: vi.fn(),
  signUpWithPasswordMock: vi.fn(),
  subscribeToAuthChangesMock: vi.fn(),
  updatePasswordMock: vi.fn(),
  isSupabaseConfiguredMock: vi.fn(),
  loadUserTransactionsMock: vi.fn(),
  persistTransactionsMock: vi.fn(),
  softDeleteTransactionMock: vi.fn(),
  updateTransactionMock: vi.fn(),
  listCategoryOverridesMock: vi.fn(),
  upsertCategoryOverrideMock: vi.fn(),
  listCustomCategoriesMock: vi.fn(),
  upsertCustomCategoryMock: vi.fn(),
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
  subscribeToAuthChanges: subscribeToAuthChangesMock,
  updatePassword: updatePasswordMock,
}))

vi.mock('./services/supabase/transactions', () => ({
  loadUserTransactions: loadUserTransactionsMock,
  persistTransactions: persistTransactionsMock,
  softDeleteTransaction: softDeleteTransactionMock,
  updateTransaction: updateTransactionMock,
}))

vi.mock('./services/supabase/category-overrides', () => ({
  listCategoryOverrides: listCategoryOverridesMock,
  upsertCategoryOverride: upsertCategoryOverrideMock,
}))

vi.mock('./services/supabase/custom-categories', () => ({
  listCustomCategories: listCustomCategoriesMock,
  upsertCustomCategory: upsertCustomCategoryMock,
}))

vi.mock('./services/supabase/import-runs', () => ({
  createImportRun: vi.fn(),
  completeImportRun: vi.fn(),
  failImportRun: vi.fn(),
  sha256Hex: vi.fn().mockResolvedValue('hash'),
}))

describe('App with supabase enabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
    localStorage.clear()
    transactionStore.getState().clearTransactions()
    isSupabaseConfiguredMock.mockReturnValue(true)
    getCurrentSessionMock.mockReturnValue(null)
    loadUserTransactionsMock.mockResolvedValue([])
    persistTransactionsMock.mockResolvedValue(undefined)
    softDeleteTransactionMock.mockResolvedValue(undefined)
    updateTransactionMock.mockResolvedValue(undefined)
    listCategoryOverridesMock.mockResolvedValue([])
    upsertCategoryOverrideMock.mockResolvedValue(undefined)
    listCustomCategoriesMock.mockResolvedValue([])
    upsertCustomCategoryMock.mockResolvedValue(undefined)
    requestPasswordResetMock.mockResolvedValue(undefined)
    subscribeToAuthChangesMock.mockReturnValue(() => undefined)
    updatePasswordMock.mockResolvedValue(undefined)
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

  it('updates password from recovery mode', async () => {
    window.history.replaceState({}, '', '/?mode=reset-password')

    const { default: App } = await import('./App')
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Elegí una nueva contraseña' })
    ).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Nueva contraseña'), {
      target: { value: 'new-secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    await waitFor(() =>
      expect(updatePasswordMock).toHaveBeenCalledWith('new-secret123')
    )
    await waitFor(() =>
      expect(signOutMock).toHaveBeenCalledWith(null)
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Ingresar a Tatú' })
      ).toBeInTheDocument()
    )
  })

  it('keeps user in reset screen during recovery even with active session', async () => {
    window.history.replaceState({}, '', '/?mode=reset-password')
    getCurrentSessionMock.mockReturnValue({
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 9999,
      user: { id: 'user-1', email: 'test@example.com' },
    })

    const { default: App } = await import('./App')
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Elegí una nueva contraseña' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Bienvenido a Tatú' })
    ).not.toBeInTheDocument()
    expect(loadUserTransactionsMock).not.toHaveBeenCalled()
  })

  it('switches to reset mode when recovery event is raised', async () => {
    subscribeToAuthChangesMock.mockImplementation((_onSession, onRecovery) => {
      onRecovery?.()
      return () => undefined
    })

    const { default: App } = await import('./App')
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Elegí una nueva contraseña' })
    ).toBeInTheDocument()
    expect(loadUserTransactionsMock).not.toHaveBeenCalled()
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

  it('migrates local category data after sign in', async () => {
    signInWithPasswordMock.mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 9999,
      user: { id: 'user-1', email: 'test@example.com' },
    })

    localStorage.setItem(
      'tatu:categoryOverrides',
      JSON.stringify({
        devoto: {
          merchantName: 'Devoto',
          category: 'groceries',
          updatedAt: '2026-02-20T00:00:00.000Z',
        },
      })
    )
    localStorage.setItem(
      'tatu:customCategories',
      JSON.stringify([
        {
          id: 'mates',
          label: 'Mates',
          color: '#00AA11',
          icon: '🧉',
        },
      ])
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

    await waitFor(() => expect(upsertCategoryOverrideMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(upsertCustomCategoryMock).toHaveBeenCalledTimes(1))
  })

  it(
    'updates and soft-deletes transactions from transactions view',
    async () => {
    getCurrentSessionMock.mockReturnValue({
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 9999,
      user: { id: 'user-1', email: 'test@example.com' },
    })
    loadUserTransactionsMock.mockResolvedValue([
      {
        id: 'tx-10',
        date: new Date('2026-02-10T00:00:00.000Z'),
        description: 'Old merchant',
        amount: 120,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        rawData: {},
      },
    ])

    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { default: App } = await import('./App')
    render(<App />)

    await waitFor(() =>
      expect(loadUserTransactionsMock).toHaveBeenCalledTimes(1)
    )

    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar Old merchant' })[0]
    )
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'New merchant' },
    })
    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.change(screen.getByLabelText('Nueva categoría'), {
      target: { value: 'services' },
    })
    fireEvent.click(screen.getByLabelText('Crear categoría'))
    fireEvent.click(screen.getByLabelText('Tags dropdown'))
    fireEvent.change(screen.getByLabelText('Nuevo tag'), {
      target: { value: 'monthly' },
    })
    fireEvent.click(screen.getByLabelText('Crear tag'))
    fireEvent.click(screen.getByLabelText('Tags dropdown'))
    fireEvent.change(screen.getByLabelText('Nuevo tag'), {
      target: { value: 'fixed' },
    })
    fireEvent.click(screen.getByLabelText('Crear tag'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(updateTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: 'user-1' }),
        }),
        'tx-10',
        {
          description: 'New merchant',
          category: 'services',
          tags: ['monthly', 'fixed'],
        }
      )
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Eliminar New merchant' })[0]
    )

    await waitFor(() =>
      expect(softDeleteTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: 'user-1' }),
        }),
        'tx-10'
      )
    )
    },
    15000
  )
})

import { MemoryRouter } from 'react-router-dom'
import { ROUTER_FUTURE } from './router-future'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { preloadViews } from './lazy-views'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { teardownWorkspace } from './stores/workspace-store'

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
  restoreTransactionsMock,
  updateTransactionMock,
  listCategoryOverridesMock,
  upsertCategoryOverrideMock,
  deleteCategoryOverrideMock,
  listDescriptionOverridesMock,
  upsertDescriptionOverrideMock,
  deleteDescriptionOverrideMock,
  listCustomCategoriesMock,
  upsertCustomCategoryMock,
  listCustomPatternsMock,
  loadUserPreferencesMock,
  saveUserPreferencesMock,
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
  restoreTransactionsMock: vi.fn(),
  updateTransactionMock: vi.fn(),
  listCategoryOverridesMock: vi.fn(),
  upsertCategoryOverrideMock: vi.fn(),
  deleteCategoryOverrideMock: vi.fn(),
  listDescriptionOverridesMock: vi.fn(),
  upsertDescriptionOverrideMock: vi.fn(),
  deleteDescriptionOverrideMock: vi.fn(),
  listCustomCategoriesMock: vi.fn(),
  upsertCustomCategoryMock: vi.fn(),
  listCustomPatternsMock: vi.fn(),
  loadUserPreferencesMock: vi.fn(),
  saveUserPreferencesMock: vi.fn(),
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
  setTransactionsDeleted: (
    session: unknown,
    ids: string[],
    deleted: boolean
  ) =>
    deleted
      ? softDeleteTransactionMock(session, ids)
      : restoreTransactionsMock(session, ids),
  updateTransactionsByIds: updateTransactionMock,
}))

vi.mock('./services/supabase/category-overrides', () => ({
  listCategoryOverrides: listCategoryOverridesMock,
  upsertCategoryOverride: upsertCategoryOverrideMock,
  deleteCategoryOverride: deleteCategoryOverrideMock,
}))

vi.mock('./services/supabase/description-overrides', () => ({
  listDescriptionOverrides: listDescriptionOverridesMock,
  upsertDescriptionOverride: upsertDescriptionOverrideMock,
  deleteDescriptionOverride: deleteDescriptionOverrideMock,
}))

vi.mock('./services/supabase/custom-categories', () => ({
  listCustomCategories: listCustomCategoriesMock,
  upsertCustomCategory: upsertCustomCategoryMock,
}))

vi.mock('./services/supabase/custom-patterns', () => ({
  listCustomPatterns: listCustomPatternsMock,
}))

vi.mock('./services/supabase/user-preferences', () => ({
  loadUserPreferences: loadUserPreferencesMock,
  saveUserPreferences: saveUserPreferencesMock,
}))

vi.mock('./services/supabase/import-runs', () => ({
  createImportRun: vi.fn(),
  completeImportRun: vi.fn(),
  failImportRun: vi.fn(),
  sha256Hex: vi.fn().mockResolvedValue('hash'),
}))

// Views are lazy chunks; load them up front so a test's first visit to a
// view doesn't spend its waitFor budget on module loading.
beforeAll(async () => {
  await preloadViews()
})

describe('App with supabase enabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
    localStorage.clear()
    // The workspace is module state: start every test signed out of it.
    teardownWorkspace()
    isSupabaseConfiguredMock.mockReturnValue(true)
    getCurrentSessionMock.mockReturnValue(null)
    loadUserTransactionsMock.mockResolvedValue([])
    persistTransactionsMock.mockResolvedValue(undefined)
    // The server confirms every id it was sent.
    softDeleteTransactionMock.mockImplementation(async (_s, ids) => ids)
    restoreTransactionsMock.mockImplementation(async (_s, ids) => ids)
    deleteCategoryOverrideMock.mockResolvedValue(undefined)
    deleteDescriptionOverrideMock.mockResolvedValue(undefined)
    updateTransactionMock.mockImplementation(async (_s, ids) => ids)
    listCategoryOverridesMock.mockResolvedValue([])
    upsertCategoryOverrideMock.mockResolvedValue(undefined)
    listDescriptionOverridesMock.mockResolvedValue([])
    upsertDescriptionOverrideMock.mockResolvedValue(undefined)
    listCustomCategoriesMock.mockResolvedValue([])
    upsertCustomCategoryMock.mockResolvedValue(undefined)
    listCustomPatternsMock.mockResolvedValue([])
    loadUserPreferencesMock.mockResolvedValue(null)
    saveUserPreferencesMock.mockResolvedValue(undefined)
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
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>
    )

    expect(
      screen.getByRole('heading', { name: 'Ingresar a Tatú' })
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('email@ejemplo.com')).toBeInTheDocument()
  })

  it('shows Spanish error when signin fails with Supabase credentials error', async () => {
    signInWithPasswordMock.mockRejectedValue(
      new Error('Invalid login credentials')
    )

    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByPlaceholderText('email@ejemplo.com'), {
      target: { value: 'test@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), {
      target: { value: 'wrongpass' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    await waitFor(() =>
      expect(
        screen.getByText('Email o contraseña incorrectos.')
      ).toBeInTheDocument()
    )
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
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>
    )

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
        screen.getByRole('heading', { name: /Bienvenido a Tatú/i })
      ).toBeInTheDocument()
    )
  })

  it('triggers password reset request', async () => {
    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByPlaceholderText('email@ejemplo.com'), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Restablecer contraseña' })
    )

    await waitFor(() =>
      expect(requestPasswordResetMock).toHaveBeenCalledWith('test@example.com')
    )
  })

  it('keeps "Restablecer contraseña" enabled and explains it needs the email (#204)', async () => {
    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>
    )

    const reset = screen.getByRole('button', { name: 'Restablecer contraseña' })
    expect(reset).toBeEnabled()
    fireEvent.click(reset)

    expect(
      await screen.findByText('Ingresá tu email para restablecer la contraseña')
    ).toBeInTheDocument()
    expect(requestPasswordResetMock).not.toHaveBeenCalled()
  })

  it('updates password from recovery mode', async () => {
    window.history.replaceState({}, '', '/?mode=reset-password')

    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>
    )

    expect(
      screen.getByRole('heading', { name: 'Elegí una nueva contraseña' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Este cambio se aplica a tu cuenta de Tatú.')
    ).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Nueva contraseña'), {
      target: { value: 'new-secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    await waitFor(() =>
      expect(updatePasswordMock).toHaveBeenCalledWith('new-secret123')
    )
    await waitFor(() => expect(signOutMock).toHaveBeenCalledWith(null))
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
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>
    )

    expect(
      screen.getByRole('heading', { name: 'Elegí una nueva contraseña' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Bienvenido a Tatú' })
    ).not.toBeInTheDocument()
    expect(loadUserTransactionsMock).not.toHaveBeenCalled()
  })

  it('starts in reset mode for hash recovery links without query mode', async () => {
    window.history.replaceState({}, '', '/#access_token=abc&type=recovery')
    getCurrentSessionMock.mockReturnValue({
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 9999,
      user: { id: 'user-1', email: 'test@example.com' },
    })

    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>
    )

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
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>
    )

    expect(
      screen.getByRole('heading', { name: 'Elegí una nueva contraseña' })
    ).toBeInTheDocument()
    expect(loadUserTransactionsMock).not.toHaveBeenCalled()
  })

  it('updates and soft-deletes transactions from transactions view', async () => {
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

    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() =>
      expect(loadUserTransactionsMock).toHaveBeenCalledTimes(1)
    )

    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Editar Old merchant' }))[0]
    )
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'New merchant' },
    })
    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.change(screen.getByLabelText('Nueva categoría'), {
      target: { value: 'services' },
    })
    fireEvent.click(screen.getByLabelText('Crear categoría'))
    // The new category is selected once it is saved.
    await waitFor(() => expect(upsertCustomCategoryMock).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('Etiquetas dropdown'))
    fireEvent.change(screen.getByLabelText('Nueva etiqueta'), {
      target: { value: 'monthly' },
    })
    fireEvent.click(screen.getByLabelText('Crear etiqueta'))
    fireEvent.click(screen.getByLabelText('Etiquetas dropdown'))
    fireEvent.change(screen.getByLabelText('Nueva etiqueta'), {
      target: { value: 'fixed' },
    })
    fireEvent.click(screen.getByLabelText('Crear etiqueta'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(updateTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: 'user-1' }),
        }),
        ['tx-10'],
        {
          displayDescription: 'New merchant',
          category: 'services',
          categoryConfidence: 1,
          tags: ['monthly', 'fixed'],
        }
      )
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Eliminar New merchant' })[0]
    )

    // Soft delete: no confirmation, an undo instead.
    await waitFor(() =>
      expect(softDeleteTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: 'user-1' }),
        }),
        ['tx-10']
      )
    )
    await waitFor(() =>
      expect(screen.queryByText('New merchant')).not.toBeInTheDocument()
    )

    // The undo is wired through App to the real restore handler.
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }))
    await waitFor(() =>
      expect(restoreTransactionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: 'user-1' }),
        }),
        ['tx-10']
      )
    )
    expect((await screen.findAllByText('New merchant')).length).toBeGreaterThan(
      0
    )
  })

  it('applies edit to future matching transactions only', async () => {
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
        description: 'AUT 998877 DEVOTO',
        amount: 120,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        rawData: {},
      },
      {
        id: 'tx-11',
        date: new Date('2026-02-11T00:00:00.000Z'),
        description: 'AUT 123456 DEVOTO',
        amount: 90,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        rawData: {},
      },
    ])

    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() =>
      expect(loadUserTransactionsMock).toHaveBeenCalledTimes(1)
    )

    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))
    fireEvent.click(
      (
        await screen.findAllByRole('button', {
          name: 'Editar AUT 998877 DEVOTO',
        })
      )[0]
    )
    fireEvent.click(
      screen.getByLabelText('Esta y las que importes en el futuro')
    )
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Devoto' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(updateTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: 'user-1' }),
        }),
        ['tx-10'],
        {
          displayDescription: 'Devoto',
          // The row had no category: 'Sin categoría' clears it (a no-op).
          category: null,
          categoryConfidence: null,
          tags: [],
        }
      )
    )

    expect(
      updateTransactionMock.mock.calls.filter((call) =>
        (call[1] as string[]).includes('tx-11')
      ).length
    ).toBe(0)
    expect(upsertDescriptionOverrideMock).toHaveBeenCalledTimes(1)
  })
})

// Cross-user regression tests for the per-user workspace lifecycle (#117,
// #123): whatever path ends user A's session, user B — signing in next on the
// same tab — must never see A's Claude API key, and nothing may ever be saved
// into B's preferences with A's key.
import { MemoryRouter } from 'react-router-dom'
import { ROUTER_FUTURE } from './router-future'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { preloadViews } from './lazy-views'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { SupabaseSession } from './services/supabase/client'
import type { UserPreferences } from './services/supabase/user-preferences'
import { getAiConfig } from './services/ai/ai-config'
import {
  PREFERENCE_FLUSH_TIMEOUT_MS,
  teardownWorkspace,
} from './stores/workspace-store'

const {
  getCurrentSessionMock,
  signInWithPasswordMock,
  signOutMock,
  subscribeToAuthChangesMock,
  updatePasswordMock,
  loadUserPreferencesMock,
  saveUserPreferencesMock,
  resetUserSupabaseDataMock,
} = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  signOutMock: vi.fn(),
  subscribeToAuthChangesMock: vi.fn(),
  updatePasswordMock: vi.fn(),
  loadUserPreferencesMock: vi.fn(),
  saveUserPreferencesMock: vi.fn(),
  resetUserSupabaseDataMock: vi.fn(),
}))

vi.mock('./services/supabase/client', () => ({
  isSupabaseConfigured: () => true,
}))

vi.mock('./services/supabase/auth', () => ({
  getCurrentSession: getCurrentSessionMock,
  requestPasswordReset: vi.fn().mockResolvedValue(undefined),
  signInWithPassword: signInWithPasswordMock,
  signOut: signOutMock,
  signUpWithPassword: vi.fn(),
  subscribeToAuthChanges: subscribeToAuthChangesMock,
  updatePassword: updatePasswordMock,
}))

vi.mock('./services/supabase/transactions', () => ({
  loadUserTransactions: vi.fn().mockResolvedValue([]),
  persistTransactions: vi.fn().mockResolvedValue(undefined),
  setTransactionsDeleted: vi.fn(async (_s: unknown, ids: string[]) => ids),
  updateTransactionsByIds: vi.fn(async (_s: unknown, ids: string[]) => ids),
}))

vi.mock('./services/supabase/category-overrides', () => ({
  listCategoryOverrides: vi.fn().mockResolvedValue([]),
  upsertCategoryOverride: vi.fn().mockResolvedValue(undefined),
  deleteCategoryOverride: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./services/supabase/description-overrides', () => ({
  listDescriptionOverrides: vi.fn().mockResolvedValue([]),
  upsertDescriptionOverride: vi.fn().mockResolvedValue(undefined),
  deleteDescriptionOverride: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./services/supabase/custom-categories', () => ({
  listCustomCategories: vi.fn().mockResolvedValue([]),
  upsertCustomCategory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./services/supabase/custom-patterns', () => ({
  listCustomPatterns: vi.fn().mockResolvedValue([]),
}))

vi.mock('./services/supabase/user-preferences', () => ({
  loadUserPreferences: loadUserPreferencesMock,
  saveUserPreferences: saveUserPreferencesMock,
}))

vi.mock('./services/supabase/reset', () => ({
  resetUserSupabaseData: resetUserSupabaseDataMock,
}))

const A_KEY = 'sk-ant-user-a-secret'

function makeSession(id: string): SupabaseSession {
  return {
    access_token: `access-${id}`,
    refresh_token: `refresh-${id}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 9999,
    user: { id, email: `${id}@example.com` },
  } as SupabaseSession
}

const userA = makeSession('user-a')
const userB = makeSession('user-b')

// The callbacks App registered with Supabase's auth listener, so a test can
// raise SIGNED_OUT / PASSWORD_RECOVERY the way Supabase would.
let authListener: {
  onSession: (session: SupabaseSession | null) => void
  onRecovery: () => void
}

type SaveCall = [SupabaseSession, UserPreferences]
const saves = () => saveUserPreferencesMock.mock.calls as SaveCall[]
const savesFor = (userId: string) =>
  saves()
    .filter(([session]) => session.user.id === userId)
    .map(([, prefs]) => prefs)

beforeAll(async () => {
  await preloadViews()
})

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/')
  localStorage.clear()
  teardownWorkspace()
  getCurrentSessionMock.mockReturnValue(null)
  signOutMock.mockResolvedValue(undefined)
  updatePasswordMock.mockResolvedValue(undefined)
  resetUserSupabaseDataMock.mockResolvedValue(undefined)
  saveUserPreferencesMock.mockResolvedValue(undefined)
  // Neither user has a preferences row.
  loadUserPreferencesMock.mockResolvedValue(null)
  subscribeToAuthChangesMock.mockImplementation((onSession, onRecovery) => {
    authListener = { onSession, onRecovery }
    return () => undefined
  })
})

async function renderApp() {
  const { default: App } = await import('./App')
  render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <App />
    </MemoryRouter>
  )
}

async function signInAs(session: SupabaseSession) {
  signInWithPasswordMock.mockResolvedValue(session)
  fireEvent.change(screen.getByPlaceholderText('email@ejemplo.com'), {
    target: { value: session.user.email },
  })
  fireEvent.change(screen.getByPlaceholderText('Contraseña'), {
    target: { value: 'secret123' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
  // Poll with a text query: a role query over the whole App costs ~1s under
  // full-suite load and starves the render it waits for (#191).
  await screen.findAllByText('Configuración')
  screen.getByRole('button', { name: 'Configuración' })
}

async function openSettings() {
  fireEvent.click(screen.getByRole('button', { name: 'Configuración' }))
  return screen.findByPlaceholderText('sk-ant-...')
}

// A turns AI on and types a key in Configuración; it is saved to A's row.
async function userASetsKey() {
  await renderApp()
  await signInAs(userA)
  const keyInput = await openSettings()
  fireEvent.click(screen.getByRole('switch'))
  fireEvent.change(keyInput, { target: { value: A_KEY } })
  await waitFor(() =>
    expect(savesFor('user-a')).toContainEqual(
      expect.objectContaining({ claudeApiKey: A_KEY, aiEnabled: true })
    )
  )
  expect(getAiConfig()).toEqual(expect.objectContaining({ apiKey: A_KEY }))
}

async function showSignInScreen() {
  await screen.findByRole('heading', { name: 'Ingresar a Tatú' })
}

// B (no preferences row) signs in: no key, AI off, and a preference edit
// saves B's own values — never A's key.
async function expectUserBIsClean() {
  await signInAs(userB)
  const keyInput = await openSettings()
  await waitFor(() => expect(keyInput).toHaveValue(''))
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  expect(getAiConfig()).toBeNull()

  fireEvent.click(
    within(screen.getByRole('radiogroup', { name: 'Tema' })).getByRole(
      'radio',
      {
        name: 'Oscuro',
      }
    )
  )
  await waitFor(() =>
    expect(savesFor('user-b')).toContainEqual(
      expect.objectContaining({ theme: 'dark' })
    )
  )
  for (const prefs of savesFor('user-b')) {
    expect(prefs.claudeApiKey).toBe('')
    expect(prefs.aiEnabled).toBe(false)
  }
  // Nothing anywhere carried A's key except A's own row.
  for (const [session, prefs] of saves()) {
    if (prefs.claudeApiKey === A_KEY) expect(session.user.id).toBe('user-a')
  }
}

describe('switching users on the same tab (#117, #123)', () => {
  it('signing out from the sidebar leaves nothing of A for B', async () => {
    await userASetsKey()

    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Cerrar sesión' })[0]
      )
    })
    await showSignInScreen()

    await expectUserBIsClean()
  })

  describe('when a preference save hangs', () => {
    // A's last keystroke is saved by a request that never answers.
    async function userAHasAHungSave() {
      await userASetsKey()
      saveUserPreferencesMock.mockImplementationOnce(
        () => new Promise(() => {})
      )
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), {
        target: { value: `${A_KEY}-2` },
      })
      await waitFor(() =>
        expect(savesFor('user-a')).toContainEqual(
          expect.objectContaining({ claudeApiKey: `${A_KEY}-2` })
        )
      )
    }

    it('signing out still completes and tears down', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        await userAHasAHungSave()

        fireEvent.click(
          screen.getAllByRole('button', { name: 'Cerrar sesión' })[0]
        )
        await act(async () => {
          await vi.advanceTimersByTimeAsync(PREFERENCE_FLUSH_TIMEOUT_MS)
        })
        await showSignInScreen()
        expect(signOutMock).toHaveBeenCalled()
        expect(getAiConfig()).toBeNull()
      } finally {
        vi.useRealTimers()
      }
      await expectUserBIsClean()
    })

    it('resetting all data still completes and clears the key', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        await userAHasAHungSave()

        fireEvent.click(screen.getByRole('button', { name: 'Resetear' }))
        fireEvent.click(
          await screen.findByRole('button', { name: 'Eliminar todo' })
        )
        await act(async () => {
          await vi.advanceTimersByTimeAsync(PREFERENCE_FLUSH_TIMEOUT_MS)
        })
        await waitFor(() =>
          expect(resetUserSupabaseDataMock).toHaveBeenCalledTimes(1)
        )
        await waitFor(() =>
          expect(screen.getByPlaceholderText('sk-ant-...')).toHaveValue('')
        )
        expect(getAiConfig()).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  it('a SIGNED_OUT event from Supabase leaves nothing of A for B', async () => {
    await userASetsKey()

    act(() => authListener.onSession(null))
    await showSignInScreen()

    await expectUserBIsClean()
  })

  it('updating the password after recovery leaves nothing of A for B', async () => {
    await userASetsKey()

    act(() => {
      authListener.onSession(userA)
      authListener.onRecovery()
    })
    fireEvent.change(await screen.findByPlaceholderText('Nueva contraseña'), {
      target: { value: 'new-secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    await showSignInScreen()

    await expectUserBIsClean()
  })

  it('going back to sign-in from recovery leaves nothing of A for B', async () => {
    await userASetsKey()

    act(() => {
      authListener.onSession(userA)
      authListener.onRecovery()
    })
    await screen.findByRole('heading', { name: 'Elegí una nueva contraseña' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Volver a iniciar sesión' })
    )
    await showSignInScreen()

    await expectUserBIsClean()
  })

  it('resetting all data clears A’s key, and B then signs in clean', async () => {
    await userASetsKey()

    fireEvent.click(screen.getByRole('button', { name: 'Resetear' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Eliminar todo' })
    )
    await waitFor(() =>
      expect(resetUserSupabaseDataMock).toHaveBeenCalledTimes(1)
    )

    // A is still signed in, but the key and the AI switch are gone.
    const keyInput = await screen.findByPlaceholderText('sk-ant-...')
    await waitFor(() => expect(keyInput).toHaveValue(''))
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(getAiConfig()).toBeNull()

    // Then the tab's session switches to B (e.g. B signed in from another tab).
    act(() => authListener.onSession(null))
    await showSignInScreen()
    await expectUserBIsClean()
  })

  it('never saves B’s preferences before B’s own preferences have loaded', async () => {
    await userASetsKey()
    act(() => authListener.onSession(null))
    await showSignInScreen()

    // B has a real row; its load is slow.
    let resolveB: (prefs: UserPreferences) => void = () => {}
    loadUserPreferencesMock.mockImplementation((session: SupabaseSession) =>
      session.user.id === 'user-b'
        ? new Promise<UserPreferences>((resolve) => {
            resolveB = resolve
          })
        : Promise.resolve(null)
    )
    signInWithPasswordMock.mockResolvedValue(userB)
    fireEvent.change(screen.getByPlaceholderText('email@ejemplo.com'), {
      target: { value: 'user-b@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    await waitFor(() =>
      expect(loadUserPreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({ user: userB.user })
      )
    )
    expect(savesFor('user-b')).toEqual([])

    await act(async () => {
      resolveB({
        theme: 'light',
        currency: 'UYU',
        fxRate: 41,
        claudeApiKey: 'sk-ant-user-b-own',
        aiEnabled: true,
        aiModel: 'claude-haiku-4-5',
      })
    })
    const keyInput = await openSettings()
    await waitFor(() => expect(keyInput).toHaveValue('sk-ant-user-b-own'))

    // Loading B's row is not an edit: B's row is never rewritten by it.
    expect(savesFor('user-b')).toEqual([])
  })
})

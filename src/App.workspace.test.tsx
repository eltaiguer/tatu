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
import type { AuthSession } from './services/auth/auth-port'
import type { UserPreferences } from './services/supabase/user-preferences'
import type { Repository } from './services/repository/repository'
import { getAiConfig } from './services/ai/ai-config'
import {
  PREFERENCE_FLUSH_TIMEOUT_MS,
  teardownWorkspace,
} from './stores/workspace-store'
import { makeSession } from './services/auth/in-memory-auth'
import { createFakeBackend, type FakeBackend } from './test/fake-backend'

const A_KEY = 'sk-ant-user-a-secret'

const userA = makeSession('user-a')
const userB = makeSession('user-b')

// Nobody signed in; A and B have accounts and nothing stored. A test raises
// SIGNED_OUT / PASSWORD_RECOVERY with `backend.auth.emit` / `recover`.
let backend: FakeBackend

// Every preference save App sends, in order, by user (logged when sent).
type SaveCall = [userId: string, preferences: UserPreferences]
let saveLog: SaveCall[]
const logged = new WeakSet<Repository>()
function createRepository(userId: string) {
  const repo = backend.createRepository(userId)
  if (!logged.has(repo)) {
    logged.add(repo)
    const save = repo.savePreferences
    repo.savePreferences = (preferences) => {
      saveLog.push([repo.userId, preferences])
      return save(preferences)
    }
  }
  return repo
}
const saves = () => saveLog
const savesFor = (userId: string) =>
  saveLog.filter(([id]) => id === userId).map(([, prefs]) => prefs)

beforeAll(async () => {
  await preloadViews()
})

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  localStorage.clear()
  teardownWorkspace()
  saveLog = []
  // Neither user has a preferences row.
  backend = createFakeBackend()
  for (const user of [userA, userB]) {
    backend.auth.addAccount(user.user.email!, 'secret123', user)
  }
})

async function renderApp() {
  const { default: App } = await import('./App')
  render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <App auth={backend.auth} createRepository={createRepository} />
    </MemoryRouter>
  )
}

async function signInAs(session: AuthSession) {
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
  for (const [userId, prefs] of saves()) {
    if (prefs.claudeApiKey === A_KEY) expect(userId).toBe('user-a')
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
      // Never released.
      backend.repo('user-a').hold('savePreferences')
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
        expect(backend.auth.signOuts).toBe(1)
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
          expect(backend.repo('user-a').requests.resetAll).toBeGreaterThan(0)
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

    act(() => backend.auth.emit(null))
    await showSignInScreen()

    await expectUserBIsClean()
  })

  it('updating the password after recovery leaves nothing of A for B', async () => {
    await userASetsKey()

    act(() => backend.auth.recover(userA))
    fireEvent.change(await screen.findByPlaceholderText('Nueva contraseña'), {
      target: { value: 'new-secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    await showSignInScreen()

    await expectUserBIsClean()
  })

  it('going back to sign-in from recovery leaves nothing of A for B', async () => {
    await userASetsKey()

    act(() => backend.auth.recover(userA))
    await screen.findByRole('heading', { name: 'Elegí una nueva contraseña' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Volver a iniciar sesión' })
    )
    await showSignInScreen()

    await expectUserBIsClean()
  })

  it('going back to sign-in lets A’s queued preference save land before signing out', async () => {
    await userASetsKey()
    // One save in flight (held), the next queued behind it.
    const inFlight = backend.repo('user-a').hold('savePreferences')
    const keyInput = screen.getByPlaceholderText('sk-ant-...')
    fireEvent.change(keyInput, { target: { value: `${A_KEY}-2` } })
    fireEvent.change(keyInput, { target: { value: `${A_KEY}-3` } })
    act(() => backend.auth.recover(userA))

    fireEvent.click(
      await screen.findByRole('button', { name: 'Volver a iniciar sesión' })
    )

    // The screen switches at once; the session ends after the saves.
    expect(
      screen.getByRole('heading', { name: 'Ingresar a Tatú' })
    ).toBeInTheDocument()
    expect(backend.auth.signOuts).toBe(0)
    inFlight.release()
    await waitFor(() => expect(backend.auth.signOuts).toBe(1))
    expect(backend.repo('user-a').preferences?.claudeApiKey).toBe(`${A_KEY}-3`)
    expect(getAiConfig()).toBeNull()

    await expectUserBIsClean()
  })

  it('cannot sign in while going back to sign-in is still ending A’s session (the pending sign-out would end it)', async () => {
    await userASetsKey()
    const inFlight = backend.repo('user-a').hold('savePreferences')
    fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), {
      target: { value: `${A_KEY}-2` },
    })
    act(() => backend.auth.recover(userA))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Volver a iniciar sesión' })
    )

    // The flush is waiting on A's save: B tries to sign in meanwhile.
    fireEvent.change(screen.getByPlaceholderText('email@ejemplo.com'), {
      target: { value: userB.user.email },
    })
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), {
      target: { value: 'secret123' },
    })
    expect(screen.getByRole('button', { name: 'Procesando...' })).toBeDisabled()
    fireEvent.submit(
      screen.getByPlaceholderText('email@ejemplo.com').closest('form')!
    )

    inFlight.release()
    await waitFor(() => expect(backend.auth.signOuts).toBe(1))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Iniciar sesión' })
      ).toBeEnabled()
    )
    // B's attempt never reached the server, so nothing of it was ended.
    expect(backend.auth.getSession()).toBeNull()

    await expectUserBIsClean()
  })

  it('resetting all data clears A’s key, and B then signs in clean', async () => {
    await userASetsKey()

    fireEvent.click(screen.getByRole('button', { name: 'Resetear' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Eliminar todo' })
    )
    await waitFor(() => expect(backend.repo('user-a').preferences).toBeNull())
    expect(backend.repo('user-a').requests.resetAll).toBeGreaterThan(0)

    // A is still signed in, but the key and the AI switch are gone.
    const keyInput = await screen.findByPlaceholderText('sk-ant-...')
    await waitFor(() => expect(keyInput).toHaveValue(''))
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(getAiConfig()).toBeNull()

    // Then the tab's session switches to B (e.g. B signed in from another tab).
    act(() => backend.auth.emit(null))
    await showSignInScreen()
    await expectUserBIsClean()
  })

  it('never saves B’s preferences before B’s own preferences have loaded', async () => {
    await userASetsKey()
    act(() => backend.auth.emit(null))
    await showSignInScreen()

    // B has a real row; its load is slow.
    backend.seed(
      {
        preferences: {
          theme: 'light',
          currency: 'UYU',
          fxRate: 41,
          claudeApiKey: 'sk-ant-user-b-own',
          aiEnabled: true,
          aiModel: 'claude-haiku-4-5',
        },
      },
      'user-b'
    )
    const loadB = backend.repo('user-b').hold('load')
    fireEvent.change(screen.getByPlaceholderText('email@ejemplo.com'), {
      target: { value: 'user-b@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    await waitFor(() => expect(backend.repo('user-b').requests.load).toBe(1))
    expect(savesFor('user-b')).toEqual([])

    await act(async () => {
      loadB.release()
    })
    const keyInput = await openSettings()
    await waitFor(() => expect(keyInput).toHaveValue('sk-ant-user-b-own'))

    // Loading B's row is not an edit: B's row is never rewritten by it.
    expect(savesFor('user-b')).toEqual([])
  })
})

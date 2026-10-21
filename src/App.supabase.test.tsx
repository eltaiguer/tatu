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
import { teardownWorkspace } from './stores/workspace-store'
import { makeSession, type InMemoryAuth } from './services/auth/in-memory-auth'
import type { AuthPort } from './services/auth/auth-port'
import { transactionStore } from './stores/transaction-store'
import { listCustomCategories } from './services/categories/category-store'
import { createFakeBackend, type FakeBackend } from './test/fake-backend'

const reporting = vi.hoisted(() => ({ captureError: vi.fn() }))
vi.mock('./services/monitoring/error-reporting', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('./services/monitoring/error-reporting')
  >()),
  captureError: reporting.captureError,
}))

// The backend: nobody signed in and nothing stored, unless a test says so.
let backend: FakeBackend
const USER_1 = makeSession('user-1', 'test@example.com')
const signedInAsUser1 = () => {
  backend = createFakeBackend({ session: USER_1 })
}

// Views are lazy chunks; load them up front so a test's first visit to a
// view doesn't spend its waitFor budget on module loading.
beforeAll(async () => {
  await preloadViews()
})

describe('App with supabase enabled', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    localStorage.clear()
    // The workspace is module state: start every test signed out of it.
    teardownWorkspace()
    backend = createFakeBackend()
    reporting.captureError.mockClear()
  })

  it('renders authentication form when no session exists', async () => {
    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
      </MemoryRouter>
    )

    expect(
      screen.getByRole('heading', { name: 'Ingresar a Tatú' })
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('email@ejemplo.com')).toBeInTheDocument()
  })

  it('gives the sign-in screen a main landmark and an h1 (#203)', async () => {
    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
      </MemoryRouter>
    )

    const main = screen.getByRole('main')
    expect(
      within(main).getByRole('heading', { level: 1, name: 'Ingresar a Tatú' })
    ).toBeInTheDocument()
  })

  it('shows Spanish error when signin fails with Supabase credentials error', async () => {
    // No such account: Supabase answers "Invalid login credentials".
    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
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
    backend.auth.addAccount('test@example.com', 'secret123', USER_1)

    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
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
      expect(
        screen.getByRole('heading', { name: /Bienvenido a Tatú/i })
      ).toBeInTheDocument()
    )
  })

  it('triggers password reset request', async () => {
    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByPlaceholderText('email@ejemplo.com'), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Restablecer contraseña' })
    )

    await waitFor(() =>
      expect(backend.auth.resetRequests).toEqual(['test@example.com'])
    )
  })

  it('keeps "Restablecer contraseña" enabled and explains it needs the email (#204)', async () => {
    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
      </MemoryRouter>
    )

    const reset = screen.getByRole('button', { name: 'Restablecer contraseña' })
    expect(reset).toBeEnabled()
    fireEvent.click(reset)

    expect(
      await screen.findByText('Ingresá tu email para restablecer la contraseña')
    ).toBeInTheDocument()
    expect(backend.auth.resetRequests).toEqual([])
  })

  it('updates password from recovery mode', async () => {
    window.history.replaceState({}, '', '/?mode=reset-password')

    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
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
      expect(backend.auth.passwordUpdates).toEqual(['new-secret123'])
    )
    await waitFor(() => expect(backend.auth.signOuts).toBe(1))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Ingresar a Tatú' })
      ).toBeInTheDocument()
    )
  })

  it('keeps user in reset screen during recovery even with active session', async () => {
    window.history.replaceState({}, '', '/?mode=reset-password')
    signedInAsUser1()

    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
      </MemoryRouter>
    )

    expect(
      screen.getByRole('heading', { name: 'Elegí una nueva contraseña' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Bienvenido a Tatú' })
    ).not.toBeInTheDocument()
    expect(backend.repo().requests.load).toBeUndefined()
  })

  it('starts in reset mode for hash recovery links without query mode', async () => {
    window.history.replaceState({}, '', '/#access_token=abc&type=recovery')
    signedInAsUser1()

    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
      </MemoryRouter>
    )

    expect(
      screen.getByRole('heading', { name: 'Elegí una nueva contraseña' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Bienvenido a Tatú' })
    ).not.toBeInTheDocument()
    expect(backend.repo().requests.load).toBeUndefined()
  })

  it('switches to reset mode when recovery event is raised', async () => {
    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
      </MemoryRouter>
    )

    // The recovery link opens on an already rendered sign-in screen.
    act(() => backend.auth.recover(USER_1))

    expect(
      screen.getByRole('heading', { name: 'Elegí una nueva contraseña' })
    ).toBeInTheDocument()
    expect(backend.repo().requests.load).toBeUndefined()
  })

  it('going back to sign-in from recovery signs out, even if that request fails', async () => {
    backend.auth.failOn('signOut', new Error('network down'))
    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
      </MemoryRouter>
    )
    act(() => backend.auth.recover(USER_1))

    fireEvent.click(
      screen.getByRole('button', { name: 'Volver a iniciar sesión' })
    )

    // At once: the sign-out runs in the background.
    expect(
      screen.getByRole('heading', { name: 'Ingresar a Tatú' })
    ).toBeInTheDocument()
    await waitFor(() => expect(backend.auth.signOuts).toBe(1))
    expect(backend.auth.getSession()).toBeNull()
  })

  it('signs out through an auth adapter whose methods need their object (a class)', async () => {
    signedInAsUser1()
    const inner = backend.auth
    class ClassAuth implements AuthPort {
      constructor(private readonly delegate: InMemoryAuth) {}
      getSession() {
        return this.delegate.getSession()
      }
      onAuthChange(...args: Parameters<AuthPort['onAuthChange']>) {
        return this.delegate.onAuthChange(...args)
      }
      signIn(email: string, password: string) {
        return this.delegate.signIn(email, password)
      }
      signUp(email: string, password: string) {
        return this.delegate.signUp(email, password)
      }
      requestPasswordReset(email: string) {
        return this.delegate.requestPasswordReset(email)
      }
      updatePassword(password: string) {
        return this.delegate.updatePassword(password)
      }
      signOut() {
        return this.delegate.signOut()
      }
    }
    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App
          auth={new ClassAuth(inner)}
          createRepository={backend.createRepository}
        />
      </MemoryRouter>
    )
    await screen.findAllByText('Configuración')

    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar sesión' })[0])

    await screen.findByRole('heading', { name: 'Ingresar a Tatú' })
    expect(inner.signOuts).toBe(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a failed sign-out whose session is gone here still leaves, says so in Spanish and reports it', async () => {
    signedInAsUser1()
    backend.seed({
      transactions: [
        {
          id: 'tx-1',
          date: new Date('2026-02-10T00:00:00.000Z'),
          description: 'Comercio',
          amount: 10,
          currency: 'UYU',
          type: 'debit',
          source: 'bank_account',
          rawData: {},
        },
      ],
    })
    // A network failure of the global sign-out; the local one worked.
    const failure = new TypeError('Failed to fetch')
    backend.auth.failOn('signOut', failure)
    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
      </MemoryRouter>
    )
    await waitFor(() => expect(backend.repo().requests.load).toBe(1))

    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar sesión' })[0])

    await screen.findByRole('heading', { name: 'Ingresar a Tatú' })
    expect(
      screen.getByText(
        'No se pudo cerrar la sesión en el servidor; en este dispositivo ya está cerrada.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument()
    expect(transactionStore.getState().transactions).toEqual([])
    expect(reporting.captureError).toHaveBeenCalledWith(failure, 'auth')
  })

  it('when the session cannot be removed at all (offline), stays signed in, says so, and a retry signs out', async () => {
    signedInAsUser1()
    backend.auth.failOn('signOut', new TypeError('Failed to fetch'))
    backend.auth.failOn('signOutLocal', new TypeError('Failed to fetch'))
    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
      </MemoryRouter>
    )
    await waitFor(() => expect(backend.repo().requests.load).toBe(1))

    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar sesión' })[0])

    expect(
      await screen.findByText(
        'No se pudo cerrar sesión. Revisá tu conexión e intentá de nuevo.'
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Ingresar a Tatú' })
    ).not.toBeInTheDocument()
    expect(backend.auth.getSession()).toBe(USER_1)

    backend.auth.heal()
    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar sesión' })[0])

    await screen.findByRole('heading', { name: 'Ingresar a Tatú' })
    expect(backend.auth.signOuts).toBe(2)
  })

  it('when reset all data fails part-way, reloads what remains and explains it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    signedInAsUser1()
    backend.seed({
      transactions: [
        {
          id: 'tx-1',
          date: new Date('2026-02-10T00:00:00.000Z'),
          description: 'Comercio',
          amount: 10,
          currency: 'UYU',
          type: 'debit',
          source: 'bank_account',
          rawData: {},
        },
      ],
      customCategories: [
        {
          id: 'mine',
          label: 'Mía',
          color: '#f00',
          isIgnored: false,
          isArchived: false,
          createdAt: '',
          updatedAt: '',
        },
      ],
    })
    backend
      .repo()
      .failOn('resetAll', { when: ([table]) => table === 'custom_categories' })
    window.history.replaceState({}, '', '/configuracion')
    const { default: App } = await import('./App')
    render(
      <MemoryRouter initialEntries={['/configuracion']} future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
      </MemoryRouter>
    )
    await waitFor(() => expect(backend.repo().requests.load).toBe(1))

    fireEvent.click(await screen.findByRole('button', { name: 'Resetear' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Eliminar todo' })
    )

    expect(
      await screen.findByText(
        'No se pudieron borrar todos los datos. Recargamos lo que quedó guardado; intentá de nuevo.'
      )
    ).toBeInTheDocument()
    // Reloaded through the workspace hook: what remains is shown.
    await waitFor(() => expect(backend.repo().requests.load).toBe(2))
    await waitFor(() =>
      expect(transactionStore.getState().transactions).toEqual([])
    )
    expect(listCustomCategories().map((c) => c.id)).toEqual(['mine'])
  })

  it('updates and soft-deletes transactions from transactions view', async () => {
    signedInAsUser1()
    backend.seed({
      transactions: [
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
      ],
    })

    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
      </MemoryRouter>
    )

    await waitFor(() => expect(backend.repo().requests.load).toBe(1))

    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))
    fireEvent.click((await screen.findAllByLabelText('Editar Old merchant'))[0])
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'New merchant' },
    })
    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.change(screen.getByLabelText('Nueva categoría'), {
      target: { value: 'services' },
    })
    fireEvent.click(screen.getByLabelText('Crear categoría'))
    // The new category is selected once it is saved.
    await waitFor(() =>
      expect(backend.repo().requests.upsertCustomCategory).toBe(1)
    )
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
      expect(backend.repo().row('tx-10')).toMatchObject({
        displayDescription: 'New merchant',
        category: 'services',
        categoryConfidence: 1,
        tags: ['monthly', 'fixed'],
      })
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Eliminar New merchant' })[0]
    )

    // Soft delete: no confirmation, an undo instead.
    await waitFor(() => expect(backend.repo().isDeleted('tx-10')).toBe(true))
    await waitFor(() =>
      expect(screen.queryByText('New merchant')).not.toBeInTheDocument()
    )

    // The undo is wired through App to the real restore handler.
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(backend.repo().isDeleted('tx-10')).toBe(false))
    expect((await screen.findAllByText('New merchant')).length).toBeGreaterThan(
      0
    )
  })

  it('applies edit to future matching transactions only', async () => {
    signedInAsUser1()
    backend.seed({
      transactions: [
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
      ],
    })

    const { default: App } = await import('./App')
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <App auth={backend.auth} createRepository={backend.createRepository} />
      </MemoryRouter>
    )

    await waitFor(() => expect(backend.repo().requests.load).toBe(1))

    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))
    fireEvent.click(
      (await screen.findAllByLabelText('Editar AUT 998877 DEVOTO'))[0]
    )
    fireEvent.click(
      screen.getByLabelText('Esta y las que importes en el futuro')
    )
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Devoto' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(backend.repo().row('tx-10')).toMatchObject({
        displayDescription: 'Devoto',
        tags: [],
      })
    )
    // The row had no category: 'Sin categoría' clears it (a no-op).
    expect(backend.repo().row('tx-10')?.category).toBeUndefined()

    // Only future imports: the past matching row is untouched.
    expect(backend.repo().row('tx-11')?.displayDescription).toBeUndefined()
    expect(backend.repo().requests.upsertDescriptionOverride).toBe(1)
    expect(backend.repo().descriptionOverrides.size).toBe(1)
  })
})

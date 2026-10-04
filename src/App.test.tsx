import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { ROUTER_FUTURE } from './router-future'
import App from './App'
import { preloadViews } from './lazy-views'
import { transactionStore } from './stores/transaction-store'
import { teardownWorkspace } from './stores/workspace-store'
import { listCustomCategories } from './services/categories/category-store'

const MOCK_SESSION = {
  access_token: 'access',
  refresh_token: 'refresh',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 9999,
  user: { id: 'user-1', email: 'test@example.com' },
}

const {
  getCurrentSessionMock,
  subscribeToAuthChangesMock,
  loadUserTransactionsMock,
  listCategoryOverridesMock,
  listDescriptionOverridesMock,
  listCustomCategoriesMock,
  listCustomPatternsMock,
  loadUserPreferencesMock,
  updateTransactionMock,
  softDeleteTransactionMock,
} = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
  subscribeToAuthChangesMock: vi.fn(),
  loadUserTransactionsMock: vi.fn(),
  listCategoryOverridesMock: vi.fn(),
  listDescriptionOverridesMock: vi.fn(),
  listCustomCategoriesMock: vi.fn(),
  listCustomPatternsMock: vi.fn(),
  loadUserPreferencesMock: vi.fn(),
  updateTransactionMock: vi.fn(),
  softDeleteTransactionMock: vi.fn(),
}))

vi.mock('./services/supabase/client', () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: vi.fn(),
}))

vi.mock('./services/supabase/auth', () => ({
  getCurrentSession: getCurrentSessionMock,
  subscribeToAuthChanges: subscribeToAuthChangesMock,
  signOut: vi.fn().mockResolvedValue(undefined),
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
}))

vi.mock('./services/supabase/transactions', () => ({
  loadUserTransactions: loadUserTransactionsMock,
  persistTransactions: vi.fn().mockResolvedValue(undefined),
  setTransactionsDeleted: softDeleteTransactionMock,
  updateTransactionsByIds: updateTransactionMock,
}))

vi.mock('./services/supabase/category-overrides', () => ({
  listCategoryOverrides: listCategoryOverridesMock,
  upsertCategoryOverride: vi.fn().mockResolvedValue(undefined),
  deleteCategoryOverride: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./services/supabase/description-overrides', () => ({
  listDescriptionOverrides: listDescriptionOverridesMock,
  upsertDescriptionOverride: vi.fn().mockResolvedValue(undefined),
  deleteDescriptionOverride: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./services/supabase/custom-categories', () => ({
  listCustomCategories: listCustomCategoriesMock,
  upsertCustomCategory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./services/supabase/custom-patterns', () => ({
  listCustomPatterns: listCustomPatternsMock,
}))

vi.mock('./services/supabase/user-preferences', () => ({
  loadUserPreferences: loadUserPreferencesMock,
  saveUserPreferences: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./services/supabase/import-runs', () => ({
  createImportRun: vi.fn().mockResolvedValue('run-1'),
  completeImportRun: vi.fn().mockResolvedValue(undefined),
  failImportRun: vi.fn().mockResolvedValue(undefined),
  sha256Hex: vi.fn().mockResolvedValue('hash'),
}))

// Exposes the router's location and a back button, so tests can observe the
// URL and history the way a user would.
function RouterProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="location">
        {location.pathname + location.search}
      </output>
      <button type="button" onClick={() => navigate(-1)}>
        test-back
      </button>
    </>
  )
}

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <App />
      <RouterProbe />
    </MemoryRouter>
  )
}

const currentUrl = () => screen.getByTestId('location').textContent

function tx(
  id: string,
  isoDate: string,
  description: string,
  category: string
) {
  return {
    id,
    date: new Date(isoDate),
    description,
    amount: 100,
    currency: 'UYU' as const,
    type: 'debit' as const,
    source: 'credit_card' as const,
    category,
    rawData: {},
  }
}

// Views are lazy chunks; load them up front so a test's first visit to a
// view doesn't spend its waitFor budget on module loading.
beforeAll(async () => {
  await preloadViews()
})

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The workspace is module state: start every test signed out of it.
    teardownWorkspace()
    localStorage.clear()
    window.history.replaceState({}, '', '/')

    getCurrentSessionMock.mockReturnValue(MOCK_SESSION)
    subscribeToAuthChangesMock.mockReturnValue(() => undefined)
    loadUserTransactionsMock.mockResolvedValue([])
    listCategoryOverridesMock.mockResolvedValue([])
    listDescriptionOverridesMock.mockResolvedValue([])
    listCustomCategoriesMock.mockResolvedValue([])
    listCustomPatternsMock.mockResolvedValue([])
    loadUserPreferencesMock.mockResolvedValue(null)
    // The server confirms every id it was sent.
    updateTransactionMock.mockImplementation(async (_s, ids: string[]) => ids)
    softDeleteTransactionMock.mockImplementation(
      async (_s, ids: string[]) => ids
    )
  })

  it('renders overview (dashboard) view by default', async () => {
    renderApp()

    // With no transactions, Onboarding is shown after sync completes
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Bienvenido a Tatú/i })
      ).toBeInTheDocument()
    )
  })

  it('has no floating theme button covering content and toasts', async () => {
    // Theme lives in Configuración; the old fixed bottom-right toggle sat on
    // top of row actions and the toast corner.
    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Bienvenido a Tatú/i })
      ).toBeInTheDocument()
    )

    expect(
      screen.queryByRole('button', {
        name: /modo (claro|oscuro)|Tema automático/,
      })
    ).not.toBeInTheDocument()
  })

  it('opens import view when clicking the sidebar Importar button', async () => {
    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Importar' })
      ).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    expect(
      screen.getByRole('heading', { name: 'Importar transacciones' })
    ).toBeInTheDocument()
    expect(screen.getByText('Arrastrá tu archivo CSV aquí')).toBeInTheDocument()
  })

  it('shows supported file types on import view', async () => {
    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Importar' })
      ).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    expect(screen.getByText('Tarjeta de crédito')).toBeInTheDocument()
    expect(screen.getByText('Cuenta USD')).toBeInTheDocument()
    expect(screen.getByText('Cuenta $U')).toBeInTheDocument()
    expect(
      screen.getByText(/Extracto de tarjeta Santander/)
    ).toBeInTheDocument()
  })

  it('switches to transactions view from sidebar navigation', async () => {
    loadUserTransactionsMock.mockResolvedValue([
      {
        id: 'tx-nav',
        date: new Date('2026-01-10T00:00:00.000Z'),
        description: 'Comercio Nav',
        amount: 100,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        rawData: {},
      },
    ])
    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Transacciones' })
      ).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Transacciones' })
      ).toBeInTheDocument()
    )
    expect(screen.getByText(/movimiento.*·/)).toBeInTheDocument()
  })

  it('auto-categorizes selected transactions from the transactions view', async () => {
    loadUserTransactionsMock.mockResolvedValue([
      {
        id: 'tx-1',
        date: new Date('2026-01-10T00:00:00.000Z'),
        description: 'Devoto Supermercado',
        amount: 100,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        rawData: {},
      },
    ])

    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Transacciones' })
      ).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))
    const checkbox = (
      await screen.findAllByRole('checkbox', {
        name: 'Seleccionar Devoto Supermercado',
      })
    )[0]
    await act(async () => {
      fireEvent.click(checkbox)
    })

    const autoCategorizeButton = screen.getByRole('button', {
      name: /Auto-categorizar/,
    })
    await waitFor(() => expect(autoCategorizeButton).not.toBeDisabled())

    await act(async () => {
      fireEvent.click(autoCategorizeButton)
    })

    await waitFor(() =>
      expect(transactionStore.getState().transactions[0].category).toBe(
        'groceries'
      )
    )
    expect(
      transactionStore.getState().transactions[0].categoryConfidence
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('Alimentación').length).toBeGreaterThan(0)
    expect(
      await screen.findByText('1 transacción categorizada')
    ).toBeInTheDocument()
  })

  it('shows a notice when auto-categorization finds no category matches', async () => {
    loadUserTransactionsMock.mockResolvedValue([
      {
        id: 'tx-1',
        date: new Date('2026-01-10T00:00:00.000Z'),
        description: 'Comercio Inventado XYZ',
        amount: 100,
        currency: 'UYU',
        type: 'credit',
        source: 'bank_account',
        rawData: {},
      },
    ])

    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Transacciones' })
      ).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    const checkbox = (
      await screen.findAllByRole('checkbox', {
        name: 'Seleccionar Comercio Inventado XYZ',
      })
    )[0]
    await act(async () => {
      fireEvent.click(checkbox)
    })

    const autoCategorizeButton = screen.getByRole('button', {
      name: /Auto-categorizar/,
    })
    await waitFor(() => expect(autoCategorizeButton).not.toBeDisabled())

    await act(async () => {
      fireEvent.click(autoCategorizeButton)
    })

    await waitFor(() =>
      expect(
        screen.getByText(
          'No se encontraron categorías automáticas para las transacciones seleccionadas'
        )
      ).toBeInTheDocument()
    )
    // Category must not be overwritten when nothing matched — previously a bug
    // where 'uncategorized' would be written over any existing user-set category
    expect(transactionStore.getState().transactions[0].category).toBeUndefined()
  })

  it('switches to categorías view from sidebar navigation', async () => {
    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Categorías' })
      ).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Categorías' }))

    expect(
      await screen.findByRole('heading', { name: 'Categorías y reglas' })
    ).toBeInTheDocument()
  })

  it('filters Transacciones by category when deep-linking from Resumen', async () => {
    loadUserTransactionsMock.mockResolvedValue([
      {
        id: 'tx-cat',
        date: new Date('2026-01-10T00:00:00.000Z'),
        description: 'Devoto Supermercado',
        amount: 100,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        category: 'groceries',
        rawData: {},
      },
      {
        id: 'tx-other',
        date: new Date('2026-01-11T00:00:00.000Z'),
        description: 'Café Bacacay',
        amount: 50,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        category: 'restaurants',
        rawData: {},
      },
    ])

    renderApp()
    await waitFor(() =>
      expect(screen.getAllByText('Alimentación').length).toBeGreaterThan(0)
    )
    // Click the category row in the breakdown list (last occurrence, list is clickable)
    const allAlimentacion = screen.getAllByText('Alimentación')
    const topCategoryLink = allAlimentacion[allAlimentacion.length - 1]
    fireEvent.click(topCategoryLink)

    expect(
      screen.getByRole('heading', { name: 'Transacciones' })
    ).toBeInTheDocument()
  })

  it('opens import as a dialog overlay without navigating away from current view', async () => {
    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Importar' })
      ).toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: 'Importar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    expect(
      screen.getByRole('heading', { name: 'Importar transacciones' })
    ).toBeInTheDocument()
    expect(screen.getByText('Arrastrá tu archivo CSV aquí')).toBeInTheDocument()
  })

  it('applies dark theme when user preferences return dark', async () => {
    loadUserPreferencesMock.mockResolvedValue({
      theme: 'dark',
      currency: 'USD',
      fxRate: 40.5,
    })

    renderApp()

    await waitFor(() =>
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    )
  })

  it('sidebar nav items are visible and functional', async () => {
    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Resumen' })
      ).toBeInTheDocument()
    )

    expect(screen.getByRole('button', { name: 'Resumen' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Transacciones' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Análisis' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Categorías' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Configuración' })
    ).toBeInTheDocument()
  })

  it('bulk categorizes selected transactions and updates the store', async () => {
    loadUserTransactionsMock.mockResolvedValue([
      {
        id: 'tx-1',
        date: new Date('2026-01-10T00:00:00.000Z'),
        description: 'Comercio A',
        amount: 100,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        rawData: {},
      },
      {
        id: 'tx-2',
        date: new Date('2026-01-11T00:00:00.000Z'),
        description: 'Comercio B',
        amount: 50,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        rawData: {},
      },
    ])

    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Transacciones' })
      ).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    fireEvent.click(
      (
        await screen.findAllByRole('checkbox', {
          name: 'Seleccionar Comercio A',
        })
      )[0]
    )
    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Comercio B' })[0]
    )

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Editar/ })[0])
    })

    fireEvent.click(screen.getByLabelText('Categoría bulk dropdown'))
    fireEvent.change(screen.getByLabelText('Buscar categoría'), {
      target: { value: 'entretenimiento' },
    })
    const popoverButtons = screen.getAllByText('Entretenimiento')
    fireEvent.click(popoverButtons[popoverButtons.length - 1])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    })

    await waitFor(() => {
      const txs = transactionStore.getState().transactions
      expect(txs.find((t) => t.id === 'tx-1')?.category).toBe('entertainment')
      expect(txs.find((t) => t.id === 'tx-2')?.category).toBe('entertainment')
    })
    // One request for the whole selection (#60).
    expect(updateTransactionMock).toHaveBeenCalledTimes(1)
    expect(updateTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      ['tx-1', 'tx-2'],
      { category: 'entertainment', categoryConfidence: 1 }
    )
  })

  it('bulk deletes selected transactions and removes them from the store', async () => {
    loadUserTransactionsMock.mockResolvedValue([
      {
        id: 'tx-1',
        date: new Date('2026-01-10T00:00:00.000Z'),
        description: 'Comercio A',
        amount: 100,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        rawData: {},
      },
      {
        id: 'tx-2',
        date: new Date('2026-01-11T00:00:00.000Z'),
        description: 'Comercio B',
        amount: 50,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        rawData: {},
      },
    ])
    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Transacciones' })
      ).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    fireEvent.click(
      (
        await screen.findAllByRole('checkbox', {
          name: 'Seleccionar Comercio A',
        })
      )[0]
    )
    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Comercio B' })[0]
    )

    // Reversible, so no confirmation — the toast offers undo instead.
    fireEvent.click(screen.getByRole('button', { name: /^Eliminar$/ }))

    await waitFor(() => {
      expect(transactionStore.getState().transactions).toHaveLength(0)
    })
    expect(softDeleteTransactionMock).toHaveBeenCalledTimes(1)
    expect(softDeleteTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      ['tx-1', 'tx-2'],
      true
    )
    expect(
      await screen.findByText('2 transacciones eliminadas')
    ).toBeInTheDocument()
  })

  it('bulk tags selected transactions and updates the store', async () => {
    loadUserTransactionsMock.mockResolvedValue([
      {
        id: 'tx-1',
        date: new Date('2026-01-10T00:00:00.000Z'),
        description: 'Comercio A',
        amount: 100,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        rawData: {},
      },
    ])

    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Transacciones' })
      ).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    fireEvent.click(
      (
        await screen.findAllByRole('checkbox', {
          name: 'Seleccionar Comercio A',
        })
      )[0]
    )

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Editar/ })[0])
    })

    fireEvent.click(screen.getByLabelText('Etiquetas bulk dropdown'))
    fireEvent.change(screen.getByLabelText('Buscar o crear etiqueta'), {
      target: { value: 'recurrente' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /Crear etiqueta "recurrente"/ })
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    })

    await waitFor(() => {
      const tx = transactionStore
        .getState()
        .transactions.find((t) => t.id === 'tx-1')
      expect(tx?.tags).toContain('recurrente')
    })
    expect(updateTransactionMock).toHaveBeenCalledTimes(1)
  })

  it('bulk action buttons are disabled when no transactions are selected', async () => {
    loadUserTransactionsMock.mockResolvedValue([
      {
        id: 'tx-1',
        date: new Date('2026-01-10T00:00:00.000Z'),
        description: 'Comercio A',
        amount: 100,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        rawData: {},
      },
    ])

    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Transacciones' })
      ).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    await waitFor(() =>
      expect(screen.getAllByText('Comercio A').length).toBeGreaterThan(0)
    )

    // No checkboxes selected — the bulk selection toolbar should not be visible
    // (the toolbar is identified by its selection count status span)
    expect(
      screen.queryByRole('status', { name: /seleccionada/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Eliminar$/ })
    ).not.toBeInTheDocument()
  })

  it('mobile hamburger opens nav sheet and closes on nav item click', async () => {
    loadUserTransactionsMock.mockResolvedValue([
      {
        id: 'tx-mobile',
        date: new Date('2026-01-10T00:00:00.000Z'),
        description: 'Comercio Mobile',
        amount: 200,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        rawData: {},
      },
    ])
    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /abrir menú/i })
      ).toBeInTheDocument()
    )

    const hamburger = screen.getByRole('button', { name: /abrir menú/i })
    expect(hamburger).toBeInTheDocument()
    expect(hamburger).toHaveAttribute('aria-expanded', 'false')

    await act(async () => {
      fireEvent.click(hamburger)
    })

    expect(hamburger).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('dialog', { name: /menú de navegación/i })
    ).toBeInTheDocument()

    const dialogNavButtons = screen
      .getByRole('dialog', { name: /menú de navegación/i })
      .querySelectorAll('button')
    const transaccionesBtn = Array.from(dialogNavButtons).find((b) =>
      b.textContent?.includes('Transacciones')
    )
    await act(async () => {
      fireEvent.click(transaccionesBtn!)
    })

    expect(hamburger).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.getByRole('heading', { name: 'Transacciones' })
    ).toBeInTheDocument()
  })

  it('clears custom categories from memory on sign out', async () => {
    listCustomCategoriesMock.mockResolvedValue([
      {
        id: 'mi-cat',
        label: 'Mi Categoría',
        color: '#ff0000',
        isIgnored: false,
        isArchived: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])

    renderApp()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Categorías' })
      ).toBeInTheDocument()
    )

    // After sync, the custom category is in memory
    expect(listCustomCategories().map((c) => c.id)).toContain('mi-cat')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    })

    // After sign out, the in-memory store must be empty
    expect(listCustomCategories()).toHaveLength(0)
  })

  describe('URLs', () => {
    it('opens the view named by the URL on a direct load', async () => {
      renderApp('/categorias')
      expect(
        await screen.findByRole('heading', { name: 'Categorías y reglas' })
      ).toBeInTheDocument()
    })

    it('tolerates a trailing slash and capitals in shared links', async () => {
      renderApp('/Categorias/')
      expect(
        await screen.findByRole('heading', { name: 'Categorías y reglas' })
      ).toBeInTheDocument()
    })

    it('changes the URL on navigation and goes back with the browser', async () => {
      renderApp('/')
      fireEvent.click(
        await screen.findByRole('button', { name: 'Configuración' })
      )
      // Navigation runs in a transition (v7_startTransition): the URL commits
      // once the lazily loaded view is ready, as in the app.
      await waitFor(() => expect(currentUrl()).toBe('/configuracion'))

      fireEvent.click(screen.getByRole('button', { name: 'test-back' }))
      await waitFor(() => expect(currentUrl()).toBe('/'))
    })

    it('does not stack history when re-clicking the current view', async () => {
      renderApp('/')
      const settings = await screen.findByRole('button', {
        name: 'Configuración',
      })
      fireEvent.click(settings)
      fireEvent.click(settings)
      fireEvent.click(screen.getByRole('button', { name: 'test-back' }))

      await waitFor(() => expect(currentUrl()).toBe('/'))
    })

    it('shows an unknown path as Resumen without redirecting', async () => {
      renderApp('/no-existe')
      expect(
        await screen.findByRole('heading', { name: /Bienvenido a Tatú/i })
      ).toBeInTheDocument()
      expect(currentUrl()).toBe('/no-existe')
    })

    it('resets scroll and the tab title when the view changes', async () => {
      renderApp('/')
      fireEvent.click(
        await screen.findByRole('button', { name: 'Configuración' })
      )
      await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith(0, 0))
      expect(document.title).toBe('Configuración · Tatú')
    })

    it('deep-links to "Restaurantes en marzo"', async () => {
      loadUserTransactionsMock.mockResolvedValue([
        tx(
          'mar-rest',
          '2026-03-10T12:00:00.000Z',
          'Cantina marzo',
          'restaurants'
        ),
        tx('mar-food', '2026-03-11T12:00:00.000Z', 'Devoto marzo', 'groceries'),
        tx(
          'apr-rest',
          '2026-04-10T12:00:00.000Z',
          'Cantina abril',
          'restaurants'
        ),
      ])
      renderApp('/transacciones?categoria=restaurants&periodo=2026-03')

      expect(
        (await screen.findAllByText('Cantina marzo')).length
      ).toBeGreaterThan(0)
      expect(screen.queryByText('Devoto marzo')).not.toBeInTheDocument()
      expect(screen.queryByText('Cantina abril')).not.toBeInTheDocument()
    })

    it('keeps the filters when re-clicking Transacciones', async () => {
      loadUserTransactionsMock.mockResolvedValue([
        tx('a', '2026-03-10T12:00:00.000Z', 'Cantina', 'restaurants'),
      ])
      renderApp('/transacciones?q=cantina&periodo=todo')
      await screen.findAllByText('Cantina')

      fireEvent.click(screen.getByRole('button', { name: /Transacciones/ }))

      expect(currentUrl()).toBe('/transacciones?q=cantina&periodo=todo')
      expect(screen.getByPlaceholderText(/Buscar por comercio/)).toHaveValue(
        'cantina'
      )
    })

    it('drops the period from the URL when filters are cleared', async () => {
      loadUserTransactionsMock.mockResolvedValue([
        tx('a', '2026-03-10T12:00:00.000Z', 'Cantina', 'restaurants'),
      ])
      renderApp('/transacciones?categoria=restaurants&periodo=2026-03')
      await screen.findAllByText('Cantina')

      fireEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }))

      await waitFor(() =>
        expect(currentUrl()).toBe('/transacciones?periodo=todo')
      )
    })

    it('keeps filter edits in the URL without adding history entries', async () => {
      loadUserTransactionsMock.mockResolvedValue([
        tx('a', '2026-03-10T12:00:00.000Z', 'Cantina', 'restaurants'),
      ])
      renderApp('/')
      fireEvent.click(
        await screen.findByRole('button', { name: /Transacciones/ })
      )
      fireEvent.change(
        await screen.findByPlaceholderText(/Buscar por comercio/),
        { target: { value: 'cantina' } }
      )

      await waitFor(() => expect(currentUrl()).toContain('q=cantina'))
      expect(currentUrl()).toMatch(/^\/transacciones\?/)

      // Back leaves Transacciones instead of undoing the keystroke.
      fireEvent.click(screen.getByRole('button', { name: 'test-back' }))
      await waitFor(() => expect(currentUrl()).toBe('/'))
    })
  })

  it('applies an edit to as many similar transactions as the dialog said', async () => {
    const row = (id: string, day: string) => ({
      id,
      date: new Date(`2026-03-${day}T12:00:00.000Z`),
      description: 'CANTINA 25',
      amount: 100,
      currency: 'UYU' as const,
      type: 'debit' as const,
      source: 'credit_card' as const,
      category: 'restaurants',
      rawData: {},
    })
    loadUserTransactionsMock.mockResolvedValue([
      row('a', '10'),
      row('b', '11'),
      row('c', '12'),
    ])
    renderApp()

    fireEvent.click(
      await screen.findByRole('button', { name: /Transacciones/ })
    )
    fireEvent.click(
      (await screen.findAllByRole('button', { name: /^Editar/ }))[0]
    )
    const option = screen.getByLabelText(/se aplica a 3 transacciones/)
    fireEvent.click(option)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('Cambios aplicados a 3 transacciones')
    ).toBeInTheDocument()
  })

  it('opens exactly a merchant\'s rows from "Mayores comercios"', async () => {
    loadUserTransactionsMock.mockResolvedValue([
      tx('a', '2026-03-10T12:00:00.000Z', 'UBER', 'transport'),
      tx('b', '2026-03-11T12:00:00.000Z', 'UBER', 'transport'),
      tx('c', '2026-03-12T12:00:00.000Z', 'UBER EATS', 'restaurants'),
    ])
    renderApp('/')

    fireEvent.click(
      await screen.findByRole('button', { name: 'Ver los gastos en UBER' })
    )

    await waitFor(() =>
      expect(currentUrl()).toBe(
        '/transacciones?comercio=UBER&tipo=debit&periodo=todo'
      )
    )
    expect(
      await screen.findByRole('button', {
        name: 'Quitar filtro de comercio UBER',
      })
    ).toBeInTheDocument()
    expect(screen.queryByText('UBER EATS')).not.toBeInTheDocument()
    expect(screen.getAllByText(/^2 movimientos/).length).toBeGreaterThan(0)
  })

  it('badges Transacciones with how many have no category', async () => {
    loadUserTransactionsMock.mockResolvedValue([
      tx('a', '2026-03-10T12:00:00.000Z', 'Sin cat 1', ''),
      tx('b', '2026-03-11T12:00:00.000Z', 'Sin cat 2', 'uncategorized'),
      tx('c', '2026-03-12T12:00:00.000Z', 'Devoto', 'groceries'),
    ])
    renderApp('/')

    expect(
      (await screen.findAllByTitle('2 sin categoría')).length
    ).toBeGreaterThan(0)
  })

  it('opens the mobile menu without React ref warnings', async () => {
    // Installed before the first open: React reports this warning once per
    // component, so a later spy would pass vacuously.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderApp('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir menú' }))
    await screen.findByRole('dialog')

    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes('Function components cannot be given refs')
      )
    ).toBe(false)
    errorSpy.mockRestore()
  })

  it('opens exactly the rows behind a "what changed" amount', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T12:00:00.000Z'))
    const months = ['2026-06', '2026-07', '2026-08', '2026-09']
    loadUserTransactionsMock.mockResolvedValue(
      months.flatMap((m, i) => [
        tx(`a${i}`, `${m}-01T12:00:00.000Z`, 'Borde', 'fees'),
        tx(`b${i}`, `${m}-28T12:00:00.000Z`, 'Borde', 'fees'),
        tx(`r${i}`, `${m}-10T12:00:00.000Z`, 'Cantina', 'restaurants'),
        ...(m === '2026-09'
          ? [
              {
                ...tx(
                  'r-extra-1',
                  `${m}-11T12:00:00.000Z`,
                  'Cantina',
                  'restaurants'
                ),
                amount: 2000,
              },
              {
                ...tx(
                  'r-extra-2',
                  `${m}-12T12:00:00.000Z`,
                  'Cantina',
                  'restaurants'
                ),
                amount: 1500,
              },
            ]
          : []),
      ])
    )
    try {
      renderApp('/')
      const link = await screen.findByRole('button', {
        name: /Ver los gastos en Restaurantes de (setiembre|septiembre)/,
      })
      const amount = link.textContent!.split(' en ')[0]

      fireEvent.click(link)

      await waitFor(() => expect(currentUrl()).toMatch(/^\/transacciones\?/))
      // The summed amount only appears in the expense total, never on a row.
      expect((await screen.findAllByText(amount)).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/^3 movimientos/).length).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

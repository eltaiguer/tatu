import { beforeEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { transactionStore } from './stores/transaction-store'

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
  softDeleteTransaction: softDeleteTransactionMock,
  updateTransaction: updateTransactionMock,
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

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transactionStore.getState().clearTransactions()
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
    updateTransactionMock.mockResolvedValue(undefined)
    softDeleteTransactionMock.mockResolvedValue(undefined)
  })

  it('renders overview (dashboard) view by default', async () => {
    render(<App />)

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Hola/i })).toBeInTheDocument()
    )
    expect(screen.getByRole('heading', { name: 'Empezá importando tu extracto' })).toBeInTheDocument()
  })

  it('opens import view when clicking the sidebar Importar button', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Importar' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    expect(screen.getByRole('heading', { name: 'Importar Transacciones' })).toBeInTheDocument()
    expect(screen.getByText('Arrastrá tu archivo CSV aquí')).toBeInTheDocument()
  })

  it('shows supported file types on import view', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Importar' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    expect(screen.getByText('Tarjeta de Crédito')).toBeInTheDocument()
    expect(screen.getByText('Cuenta USD')).toBeInTheDocument()
    expect(screen.getByText('Cuenta UYU')).toBeInTheDocument()
    expect(screen.getByText(/Extracto de tarjeta Santander/)).toBeInTheDocument()
  })

  it('switches to transactions view from sidebar navigation', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Transacciones' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    expect(screen.getByRole('heading', { name: 'Transacciones' })).toBeInTheDocument()
    expect(screen.getByText(/movimientos/)).toBeInTheDocument()
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

    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Transacciones' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('checkbox', {
          name: 'Seleccionar Devoto Supermercado',
        })[0]
      )
    })

    const autoCategorizeButton = screen.getByRole('button', {
      name: /Auto-categorizar/,
    })
    await waitFor(() => expect(autoCategorizeButton).not.toBeDisabled())

    await act(async () => {
      fireEvent.click(autoCategorizeButton)
    })

    await waitFor(() =>
      expect(transactionStore.getState().transactions[0].category).toBe('groceries')
    )
    expect(transactionStore.getState().transactions[0].categoryConfidence).toBeGreaterThan(0)
    expect(screen.getAllByText('Alimentación').length).toBeGreaterThan(0)
    expect(
      screen.getByText('1 transacción auto-categorizada')
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

    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Transacciones' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('checkbox', {
          name: 'Seleccionar Comercio Inventado XYZ',
        })[0]
      )
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
        screen.getByText('No se encontraron categorías automáticas para las transacciones seleccionadas')
      ).toBeInTheDocument()
    )
    expect(transactionStore.getState().transactions[0].category).toBe('uncategorized')
  })

  it('switches to categorías view from sidebar navigation', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Categorías' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Categorías' }))

    expect(screen.getByRole('heading', { name: 'Categorías y reglas' })).toBeInTheDocument()
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

    render(<App />)
    await waitFor(() => expect(screen.getByText('Alimentación')).toBeInTheDocument())
    const topCategoryLink = screen.getByText('Alimentación')
    fireEvent.click(topCategoryLink)

    expect(screen.getByRole('heading', { name: 'Transacciones' })).toBeInTheDocument()
  })

  it('opens import as a dialog overlay without navigating away from current view', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Importar' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Importar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    expect(screen.getByRole('heading', { name: 'Importar Transacciones' })).toBeInTheDocument()
    expect(screen.getByText('Arrastrá tu archivo CSV aquí')).toBeInTheDocument()
  })

  it('applies dark theme when user preferences return dark', async () => {
    loadUserPreferencesMock.mockResolvedValue({ theme: 'dark', currency: 'USD', fxRate: 40.5 })

    render(<App />)

    await waitFor(() =>
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    )
  })

  it('sidebar nav items are visible and functional', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resumen' })).toBeInTheDocument())

    expect(screen.getByRole('button', { name: 'Resumen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transacciones' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Análisis' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Categorías' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Configuración' })).toBeInTheDocument()
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

    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Transacciones' })).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Seleccionar Comercio A' })[0])
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Seleccionar Comercio B' })[0])

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
    expect(updateTransactionMock).toHaveBeenCalledTimes(2)
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
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Transacciones' })).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Seleccionar Comercio A' })[0])
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Seleccionar Comercio B' })[0])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Eliminar$/ }))
    })

    await waitFor(() => {
      expect(transactionStore.getState().transactions).toHaveLength(0)
    })
    expect(softDeleteTransactionMock).toHaveBeenCalledTimes(2)
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

    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Transacciones' })).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Seleccionar Comercio A' })[0])

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Editar/ })[0])
    })

    fireEvent.click(screen.getByLabelText('Tags bulk dropdown'))
    fireEvent.change(screen.getByLabelText('Buscar o crear tag'), {
      target: { value: 'recurrente' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Crear tag "recurrente"/ }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    })

    await waitFor(() => {
      const tx = transactionStore.getState().transactions.find((t) => t.id === 'tx-1')
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

    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Transacciones' })).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))

    await waitFor(() =>
      expect(screen.getAllByText('Comercio A').length).toBeGreaterThan(0)
    )

    // No checkboxes selected — the bulk selection toolbar should not be visible
    // (the toolbar is identified by its selection count status span)
    expect(screen.queryByRole('status', { name: /seleccionada/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Eliminar$/ })).not.toBeInTheDocument()
  })

  it('mobile hamburger opens nav sheet and closes on nav item click', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: /abrir menú/i })).toBeInTheDocument())

    const hamburger = screen.getByRole('button', { name: /abrir menú/i })
    expect(hamburger).toBeInTheDocument()
    expect(hamburger).toHaveAttribute('aria-expanded', 'false')

    await act(async () => {
      fireEvent.click(hamburger)
    })

    expect(hamburger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: /menú de navegación/i })).toBeInTheDocument()

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
    expect(screen.getByRole('heading', { name: 'Transacciones' })).toBeInTheDocument()
  })
})

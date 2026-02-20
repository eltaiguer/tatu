// Tatu - Uruguayan Expense Tracker
// A modern, trustworthy fintech app for managing Santander Uruguay statements

import { useState, useEffect } from 'react'
import { TatuLogo } from './components/TatuLogo'
import { Dashboard } from './components/Dashboard'
import { Transactions } from './components/Transactions'
import { Charts } from './components/Charts'
import { Tools } from './components/Tools'
import { ImportCSV } from './components/ImportCSV'
import { AuthCard } from './components/AuthCard'
import { Button } from './components/ui/button'
import {
  Sun,
  Moon,
  Menu,
  X,
  Upload,
  ChartPie,
  ListFilter,
  Package,
  ChartBar,
} from 'lucide-react'
import { useStore } from 'zustand'
import {
  getPersistedTransactionsSnapshot,
  transactionStore,
} from './stores/transaction-store'
import {
  getCurrentSession,
  requestPasswordReset,
  signInWithPassword,
  signOut,
  signUpWithPassword,
} from './services/supabase/auth'
import {
  isSupabaseConfigured,
  type SupabaseSession,
} from './services/supabase/client'
import {
  loadUserTransactions,
  persistTransactions,
} from './services/supabase/transactions'
import type { Transaction } from './models'

type View = 'dashboard' | 'transactions' | 'charts' | 'tools' | 'import'

function App() {
  const supabaseEnabled = isSupabaseConfigured()

  // Initialize theme from localStorage
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark'
  })
  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [session, setSession] = useState<SupabaseSession | null>(() =>
    supabaseEnabled ? getCurrentSession() : null
  )
  const [authLoading, setAuthLoading] = useState(supabaseEnabled)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Get transactions from store
  const transactions = useStore(transactionStore, (state) => state.transactions)

  // Handle theme toggle and persist to localStorage
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  useEffect(() => {
    let cancelled = false

    async function syncTransactions() {
      if (!supabaseEnabled) {
        setAuthLoading(false)
        return
      }

      if (!session) {
        setAuthLoading(false)
        return
      }

      setAuthLoading(true)
      setAuthError('')
      setAuthNotice('')

      try {
        const remoteTransactions = await loadUserTransactions(session)
        const localTransactions = getPersistedTransactionsSnapshot()
        const remoteIds = new Set(remoteTransactions.map((tx) => tx.id))
        const transactionsToMigrate = localTransactions.filter(
          (tx) => !remoteIds.has(tx.id)
        )

        if (transactionsToMigrate.length > 0) {
          await persistTransactions(session, transactionsToMigrate)
          setAuthNotice(
            `${transactionsToMigrate.length} transacciones locales migradas`
          )
        }

        const mergedTransactions = [
          ...remoteTransactions,
          ...transactionsToMigrate,
        ].sort((a, b) => b.date.getTime() - a.date.getTime())

        if (!cancelled) {
          transactionStore.getState().setTransactions(mergedTransactions)
        }
      } catch (error) {
        if (!cancelled) {
          setAuthError(
            error instanceof Error
              ? error.message
              : 'No se pudieron cargar las transacciones'
          )
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false)
        }
      }
    }

    void syncTransactions()

    return () => {
      cancelled = true
    }
  }, [session, supabaseEnabled])

  async function handleAuth(action: 'signin' | 'signup') {
    setAuthSubmitting(true)
    setAuthError('')
    setAuthNotice('')

    try {
      const nextSession =
        action === 'signin'
          ? await signInWithPassword(email, password)
          : await signUpWithPassword(email, password)
      setSession(nextSession)
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Error de autenticación'
      )
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function handleSignOut() {
    setAuthSubmitting(true)
    try {
      await signOut(session)
      setSession(null)
      transactionStore.getState().clearTransactions()
      setCurrentView('dashboard')
      setMobileMenuOpen(false)
      setAuthError('')
      setAuthNotice('')
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'No se pudo cerrar sesión'
      )
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function handleTransactionsImported(transactionsToImport: Transaction[]) {
    if (!supabaseEnabled || !session) {
      return transactionStore.getState().addTransactions(transactionsToImport)
    }

    const state = transactionStore.getState()
    const duplicateIds = new Set(state.findDuplicateIds(transactionsToImport))
    const added = transactionsToImport.filter((tx) => !duplicateIds.has(tx.id))
    const duplicates = transactionsToImport.filter((tx) =>
      duplicateIds.has(tx.id)
    )

    await persistTransactions(session, added)
    state.addTransactions(added)

    return { added, duplicates }
  }

  async function handlePasswordReset() {
    setAuthSubmitting(true)
    setAuthError('')
    setAuthNotice('')

    try {
      await requestPasswordReset(email)
      setAuthNotice('Te enviamos un email para restablecer tu contraseña')
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'No se pudo enviar el email de recuperación'
      )
    } finally {
      setAuthSubmitting(false)
    }
  }

  const navItems = [
    { id: 'dashboard' as View, label: 'Dashboard', icon: ChartBar },
    { id: 'transactions' as View, label: 'Transacciones', icon: ListFilter },
    { id: 'charts' as View, label: 'Insights', icon: ChartPie },
    { id: 'tools' as View, label: 'Herramientas', icon: Package },
    { id: 'import' as View, label: 'Importar', icon: Upload },
  ]

  if (supabaseEnabled && !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <TatuLogo size="md" />
            <h2 className="mt-4 mb-1">Ingresar a Tatú</h2>
            <p className="text-sm text-muted-foreground">
              Tu información se guarda de forma segura en tu cuenta.
            </p>
          </div>
          <AuthCard
            email={email}
            password={password}
            authError={authError}
            authNotice={authNotice}
            authSubmitting={authSubmitting}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSignIn={() => {
              void handleAuth('signin')
            }}
            onSignUp={() => {
              void handleAuth('signup')
            }}
            onResetPassword={() => {
              void handlePasswordReset()
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <TatuLogo size="md" />

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    currentView === item.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              {supabaseEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void handleSignOut()
                  }}
                  disabled={authSubmitting}
                  className="hidden sm:flex"
                >
                  Salir
                </Button>
              )}
              {/* Theme Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsDark(!isDark)}
                className="hidden sm:flex"
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </Button>

              {/* Mobile Menu Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden"
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-card">
            <nav className="px-4 py-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentView(item.id)
                      setMobileMenuOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      currentView === item.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
              <button
                onClick={() => setIsDark(!isDark)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
                <span>{isDark ? 'Modo claro' : 'Modo oscuro'}</span>
              </button>
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {authLoading && (
          <p className="text-sm text-muted-foreground mb-4">
            Cargando transacciones...
          </p>
        )}
        {authError && (
          <p className="text-sm text-destructive mb-4" role="alert">
            {authError}
          </p>
        )}
        {authNotice && (
          <p className="text-sm text-muted-foreground mb-4" role="status">
            {authNotice}
          </p>
        )}
        {currentView === 'dashboard' && (
          <Dashboard transactions={transactions} />
        )}
        {currentView === 'transactions' && (
          <Transactions transactions={transactions} />
        )}
        {currentView === 'charts' && <Charts transactions={transactions} />}
        {currentView === 'tools' && <Tools transactions={transactions} />}
        {currentView === 'import' && (
          <ImportCSV
            onImportComplete={() => setCurrentView('transactions')}
            onTransactionsImported={handleTransactionsImported}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-20">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <TatuLogo size="sm" />
              <p className="text-sm text-muted-foreground mt-3">
                Gestión inteligente de gastos para Uruguay. Privado, seguro y
                fácil de usar.
              </p>
            </div>
            <div>
              <h4 className="mb-3">Enlaces</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Cómo funciona
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Privacidad
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Términos de uso
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Soporte
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3">Contacto</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>hola@tatu.uy</li>
                <li>Montevideo, Uruguay</li>
                <li className="pt-2">
                  <a href="#" className="text-primary hover:underline">
                    Ver en GitHub →
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            <p>© 2025 Tatú. Hecho con ❤️ en Uruguay.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App

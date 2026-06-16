import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Toaster } from './components/ui/sonner'
import { TatuLogo } from './components/TatuLogo'
import { AppSidebar, SidebarInner } from './components/AppSidebar'
import type { View } from './components/AppSidebar'
import { Dashboard } from './components/Dashboard'
import { Transactions } from './components/Transactions'
import { Charts } from './components/Charts'
import { Categories } from './components/Categories'
import { Settings } from './components/Settings'
import { ImportCSV } from './components/ImportCSV'
import { AuthCard } from './components/AuthCard'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from './components/ui/sheet'
import { Sun, Moon, Menu, Monitor } from 'lucide-react'
import { useStore } from 'zustand'
import { transactionStore } from './stores/transaction-store'
import { signOut } from './services/supabase/auth'
import { loadUserTransactions } from './services/supabase/transactions'
import {
  clearAllCategoryOverrides,
  replaceMerchantCategoryOverrides,
} from './services/categorizer/category-overrides'
import {
  clearAllDescriptionOverrides,
  replaceDescriptionOverrides,
} from './services/descriptions/description-overrides'
import { replaceCustomCategories } from './services/categories/category-store'
import { replaceCustomPatterns } from './services/categorizer/custom-patterns'
import { listCategoryOverrides } from './services/supabase/category-overrides'
import { listDescriptionOverrides as listRemoteDescriptionOverrides } from './services/supabase/description-overrides'
import { listCustomCategories } from './services/supabase/custom-categories'
import { listCustomPatterns as listSupabaseCustomPatterns } from './services/supabase/custom-patterns'
import { loadUserPreferences } from './services/supabase/user-preferences'
import { resetUserSupabaseData } from './services/supabase/reset'
import { useUserPreferences } from './hooks/useUserPreferences'
import { useAuthSession } from './hooks/useAuthSession'
import { useTransactionHandlers } from './hooks/useTransactionHandlers'

function App() {
  const [currentView, setCurrentView] = useState<View>('overview')
  const [importOpen, setImportOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [pendingTxFilter, setPendingTxFilter] = useState<import('./models').TransactionsFilter | null>(null)
  const {
    session,
    setSession,
    authSubmitting,
    setAuthSubmitting,
    authError,
    setAuthError,
    authNotice,
    setAuthNotice,
    email,
    setEmail,
    password,
    setPassword,
    authMode,
    setAuthMode,
    handleAuth,
    handlePasswordReset,
    handlePasswordUpdate,
    clearPasswordResetModeFromUrl,
  } = useAuthSession()

  // Get transactions from store
  const transactions = useStore(transactionStore, (state) => state.transactions)

  // True once remote prefs have been loaded — prevents overwriting Supabase prefs
  // with local defaults on first mount before syncTransactions completes.
  const prefsLoadedRef = useRef(false)

  const {
    theme,
    setTheme,
    isDark,
    cycleTheme,
    preferredCurrency,
    setPreferredCurrency,
    fxRate,
    setFxRate,
  } = useUserPreferences(session, prefsLoadedRef)

  useEffect(() => {
    let cancelled = false

    async function syncTransactions() {
      if (authMode === 'reset') return
      if (!session) return

      setAuthError('')
      setAuthNotice('')

      try {
        const [
          remoteTransactions,
          remoteOverrides,
          remoteDescriptionOverrides,
          remoteCustomPatterns,
          remoteCustomCategories,
          userPrefs,
        ] = await Promise.all([
          loadUserTransactions(session),
          listCategoryOverrides(session),
          listRemoteDescriptionOverrides(session),
          listSupabaseCustomPatterns(session),
          listCustomCategories(session),
          loadUserPreferences(session),
        ])

        replaceMerchantCategoryOverrides(
          remoteOverrides.reduce(
            (acc, override) => {
              acc[override.merchantNormalized] = {
                merchantName: override.merchantOriginal,
                category: override.category,
                updatedAt: override.updatedAt,
              }
              return acc
            },
            {} as Record<
              string,
              { merchantName?: string; category: string; updatedAt: string }
            >
          )
        )

        replaceDescriptionOverrides(
          remoteDescriptionOverrides.reduce(
            (acc, override) => {
              acc[override.descriptionNormalized] = {
                descriptionOriginal: override.descriptionOriginal,
                friendlyDescription: override.friendlyDescription,
                category: override.category,
                updatedAt: override.updatedAt,
              }
              return acc
            },
            {} as Record<
              string,
              {
                descriptionOriginal?: string
                friendlyDescription: string
                category?: string
                updatedAt: string
              }
            >
          )
        )

        replaceCustomPatterns(remoteCustomPatterns)
        replaceCustomCategories(
          remoteCustomCategories.map((category) => ({
            id: category.id,
            label: category.label,
            color: category.color,
            icon: category.icon,
            isIgnored: category.isIgnored,
          }))
        )

        if (userPrefs) {
          setTheme(userPrefs.theme)
          setPreferredCurrency(userPrefs.currency)
          setFxRate(userPrefs.fxRate)
        }
        // Allow preference saves now that remote values are applied.
        prefsLoadedRef.current = true

        if (!cancelled) {
          transactionStore.getState().setTransactions(remoteTransactions)
        }
      } catch (error) {
        if (!cancelled) {
          setAuthError(
            error instanceof Error
              ? error.message
              : 'No se pudieron cargar las transacciones'
          )
        }
      }
    }

    void syncTransactions()

    return () => {
      cancelled = true
    }
  }, [authMode, session])

  async function handleSignOut() {
    setAuthSubmitting(true)
    try {
      await signOut(session)
      setSession(null)
      setAuthMode('signin')
      toast('Sesión cerrada')
      transactionStore.getState().clearTransactions()
      clearAllCategoryOverrides()
      clearAllDescriptionOverrides()
      replaceCustomPatterns([])
      setTheme('auto')
      setPreferredCurrency('USD')
      setFxRate(40.5)
      prefsLoadedRef.current = false
      setCurrentView('overview')
      setImportOpen(false)
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

  async function handleResetAllData() {
    transactionStore.getState().clearTransactions()
    clearAllCategoryOverrides()
    clearAllDescriptionOverrides()
    replaceCustomPatterns([])
    replaceCustomCategories([])
    setTheme('auto')
    setPreferredCurrency('USD')
    setFxRate(40.5)
    prefsLoadedRef.current = false

    if (session) {
      await resetUserSupabaseData(session)
    }

    setAuthNotice('Datos eliminados correctamente')
  }

  function navigateToTransactions(filter: import('./models').TransactionsFilter) {
    setPendingTxFilter(filter)
    setCurrentView('transactions')
  }

  const {
    handleTransactionsImported,
    handleUpdateTransaction,
    handleDeleteTransaction,
    handleBulkCategorizeTransactions,
    handleBulkDeleteTransactions,
    handleBulkTagTransactions,
    handleAutoCategorizeTransactions,
  } = useTransactionHandlers(session, setAuthError, setAuthNotice)

  if (!session || authMode === 'reset') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <TatuLogo size="md" />
            <h2 className="mt-4 mb-1">
              {authMode === 'reset'
                ? 'Elegí una nueva contraseña'
                : 'Ingresar a Tatú'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {authMode === 'reset'
                ? 'Este cambio se aplica a tu cuenta de Supabase.'
                : 'Tu información se guarda de forma segura en tu cuenta.'}
            </p>
          </div>
          <AuthCard
            mode={authMode}
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
            onUpdatePassword={() => {
              void handlePasswordUpdate()
            }}
            onBackToSignIn={() => {
              setAuthMode('signin')
              setPassword('')
              setAuthError('')
              setAuthNotice('')
              clearPasswordResetModeFromUrl()
              void signOut(session)
              setSession(null)
              transactionStore.getState().clearTransactions()
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}
    >
      {/* Sidebar (desktop only — hidden on mobile via CSS) */}
      <AppSidebar
        view={currentView}
        onNavigate={(v) => {
          if (v === 'transactions') setPendingTxFilter(null)
          setCurrentView(v)
        }}
        onImport={() => setImportOpen(true)}
        onSignOut={() => {
          void handleSignOut()
        }}
        session={session}
        txCount={transactions.length}
        supabaseEnabled={true}
      />

      {/* Mobile nav sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent
          side="left"
          style={{
            padding: 0,
            width: 'min(288px, 85vw)',
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
          }}
        >
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SheetDescription className="sr-only">
            Navegación principal de la aplicación
          </SheetDescription>
          <SidebarInner
            view={currentView}
            onNavigate={(v) => {
              if (v === 'transactions') setPendingTxFilter(null)
              setCurrentView(v)
              setMobileMenuOpen(false)
            }}
            onImport={() => {
              setImportOpen(true)
              setMobileMenuOpen(false)
            }}
            onSignOut={() => {
              void handleSignOut()
              setMobileMenuOpen(false)
            }}
            session={session}
            txCount={transactions.length}
            supabaseEnabled={true}
          />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          marginLeft: 'var(--sidebar-w, 252px)',
        }}
      >
        {/* Mobile sticky header */}
        <header
          className="md:hidden sticky top-0 z-40 flex items-center gap-3"
          style={{
            height: 56,
            padding: '0 16px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <button
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={mobileMenuOpen}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'grid',
              placeItems: 'center',
              padding: 8,
              borderRadius: 8,
              flexShrink: 0,
            }}
          >
            <Menu size={20} />
          </button>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            Tatú
          </span>
        </header>

        <div
          className="px-4 pt-5 pb-20 md:px-11 md:pt-10"
          style={{
            maxWidth: 1180,
            margin: '0 auto',
          }}
        >
          {authError && (
            <p
              className="text-sm mb-4"
              style={{ color: 'var(--neg)' }}
              role="alert"
            >
              {authError}
            </p>
          )}
          {authNotice && (
            <p
              className="text-sm mb-4"
              style={{ color: 'var(--text-muted)' }}
              role="status"
            >
              {authNotice}
            </p>
          )}

          {currentView === 'overview' && (
              <Dashboard
                transactions={transactions}
                userName={session?.user?.email ?? undefined}
                onNavigateToImport={() => setImportOpen(true)}
                onNavigateToTransactions={navigateToTransactions}
                onNavigateToAnalysis={() => setCurrentView('analysis')}
                homeCurrency={preferredCurrency}
                fxRate={fxRate}
                onSetHomeCurrency={setPreferredCurrency}
                onSetFxRate={setFxRate}
              />
            )}
            {currentView === 'transactions' && (
              <Transactions
                transactions={transactions}
                initialFilter={pendingTxFilter ?? undefined}
                onUpdateTransaction={handleUpdateTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onAutoCategorizeTransactions={handleAutoCategorizeTransactions}
                onBulkCategorize={handleBulkCategorizeTransactions}
                onBulkDelete={handleBulkDeleteTransactions}
                onBulkTag={handleBulkTagTransactions}
              />
            )}
            {currentView === 'analysis' && (
              <Charts
                transactions={transactions}
                onNavigateToTransactions={navigateToTransactions}
                homeCurrency={preferredCurrency}
                fxRate={fxRate}
                onSetHomeCurrency={setPreferredCurrency}
                onSetFxRate={setFxRate}
              />
            )}
            {currentView === 'categories' && (
              <Categories transactions={transactions} />
            )}
            {currentView === 'settings' && (
              <Settings
                theme={theme}
                onSetTheme={setTheme}
                preferredCurrency={preferredCurrency}
                onSetCurrency={setPreferredCurrency}
                fxRate={fxRate}
                onSetFxRate={setFxRate}
                session={session}
                supabaseEnabled={true}
                onSignOut={() => {
                  void handleSignOut()
                }}
                transactions={transactions}
                onResetAllData={handleResetAllData}
              />
            )}
        </div>
      </main>

      {/* Import Dialog */}
      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          if (!open) setImportOpen(false)
        }}
      >
        <DialogContent
          style={{
            maxWidth: 680,
            padding: 0,
            overflow: 'hidden',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <DialogTitle className="sr-only">Importar archivo CSV</DialogTitle>
          <DialogDescription className="sr-only">
            Arrastrá o seleccioná un archivo CSV de Santander Uruguay para
            importar tus movimientos.
          </DialogDescription>
          <ImportCSV
            onImportComplete={() => {
              setImportOpen(false)
              setCurrentView('transactions')
            }}
            onTransactionsImported={handleTransactionsImported}
          />
        </DialogContent>
      </Dialog>

      {/* Floating theme toggle */}
      <button
        onClick={cycleTheme}
        aria-label={
          theme === 'auto'
            ? 'Tema automático (según sistema)'
            : isDark
              ? 'Cambiar a modo claro'
              : 'Cambiar a modo oscuro'
        }
        style={{
          position: 'fixed',
          bottom: 22,
          right: 22,
          zIndex: 60,
          width: 42,
          height: 42,
          borderRadius: 999,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text-muted)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-md)',
          transition: 'background 0.13s, color 0.13s',
        }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            'var(--surface-2)'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'
        }}
        onMouseOut={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            'var(--surface)'
          ;(e.currentTarget as HTMLButtonElement).style.color =
            'var(--text-muted)'
        }}
      >
        {theme === 'auto' ? (
          <Monitor size={18} />
        ) : isDark ? (
          <Sun size={18} />
        ) : (
          <Moon size={18} />
        )}
      </button>

      <Toaster />
    </div>
  )
}

export default App

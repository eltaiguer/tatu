import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { pathForView, titleForView, viewFromPath } from './routes'
import { normalizeCategoryId } from './services/categories/category-aliases'
import {
  filterToSearch,
  parseFilterParams,
} from './services/filters/url-filters'
import {
  DashboardSkeleton,
  TransactionTableSkeleton,
} from './components/StateSkeletons'
import { ConnectionLostState } from './components/ConnectionLostState'
import { Onboarding } from './components/Onboarding'
import { toast } from 'sonner'
import { Toaster } from './components/ui/sonner'
import { TatuLogo } from './components/TatuLogo'
import { AppSidebar, SidebarInner } from './components/AppSidebar'
import type { View } from './components/AppSidebar'
import {
  Dashboard,
  Transactions,
  Insights,
  Categories,
  Settings,
  preloadViews,
} from './lazy-views'
import { ViewErrorBoundary } from './components/ViewErrorBoundary'
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
import { Menu, Upload } from 'lucide-react'
import { Button } from './components/ui/button'
import { useStore } from 'zustand'
import { transactionStore } from './stores/transaction-store'
import { signOut } from './services/supabase/auth'
import { clearAllCategoryOverrides } from './services/categorizer/category-overrides'
import { clearAllDescriptionOverrides } from './services/descriptions/description-overrides'
import { replaceCustomCategories } from './services/categories/category-store'
import { replaceCustomPatterns } from './services/categorizer/custom-patterns'
import { resetUserSupabaseData } from './services/supabase/reset'
import { useUserPreferences } from './hooks/useUserPreferences'
import { setAiConfig } from './services/ai/ai-config'
import { useAuthSession } from './hooks/useAuthSession'
import { useTransactionSync } from './hooks/useTransactionSync'
import { useTransactionHandlers } from './hooks/useTransactionHandlers'
import { getFriendlyName } from './utils/user-display'
import { UserFacingError } from './utils/user-error'

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  // The URL is the source of truth for the view (refresh, back/forward and
  // links all work).
  const currentView = viewFromPath(location.pathname)
  const [importOpen, setImportOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Navigates unless already there, so re-clicking the current view doesn't
  // stack duplicate history entries. A plain nav (no query) to the current
  // view keeps its query too: Transacciones always carries its filters in
  // the URL, and re-clicking it must not wipe them.
  function go(view: View, search = '') {
    if (view === currentView && (!search || `?${search}` === location.search)) {
      return
    }
    navigate(pathForView(view) + (search ? `?${search}` : ''))
  }

  // Transacciones writes its filters into the URL with REPLACE; only other
  // navigations (links from other views, back/forward) remount it so it
  // re-reads the filters from the URL.
  const transactionsKeyRef = useRef(location.key)
  if (navigationType !== 'REPLACE') {
    transactionsKeyRef.current = location.key
  }

  const handleTransactionFiltersChange = useCallback(
    (search: string) => {
      const next = search ? `?${search}` : ''
      if (next === location.search) return
      navigate({ pathname: location.pathname, search: next }, { replace: true })
    },
    [location.pathname, location.search, navigate]
  )

  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = titleForView(currentView)
  }, [currentView])
  const [syncStatus, setSyncStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  )
  const [syncKey, setSyncKey] = useState(0)

  function refetch() {
    setSyncKey((k) => k + 1)
  }
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

  // Signed in: fetch every view's chunk now, while the first sync runs, so
  // switching views never waits on the network. A failure here is retried
  // by the view itself when it renders.
  const signedIn = Boolean(session)
  useEffect(() => {
    if (signedIn) preloadViews().catch(() => {})
  }, [signedIn])

  // Get transactions from store
  const transactions = useStore(transactionStore, (state) => state.transactions)

  // Same rows Categorías' "Sin categoría" counts and its link opens.
  const uncategorizedCount = useMemo(
    () =>
      transactions.filter(
        (tx) =>
          !tx.isSplitParent &&
          normalizeCategoryId(tx.category) === 'uncategorized'
      ).length,
    [transactions]
  )

  const {
    theme,
    setTheme,
    preferredCurrency,
    setPreferredCurrency,
    fxRate,
    setFxRate,
    claudeApiKey,
    setClaudeApiKey,
    aiEnabled,
    setAiEnabled,
    aiModel,
    setAiModel,
    markPrefsLoaded,
    resetPrefsLoaded,
  } = useUserPreferences(session)

  useTransactionSync({
    session,
    authMode,
    syncKey,
    markPrefsLoaded,
    setError: setAuthError,
    setNotice: setAuthNotice,
    setSyncStatus,
    setTheme,
    setPreferredCurrency,
    setFxRate,
    setClaudeApiKey,
    setAiEnabled,
    setAiModel,
  })

  async function handleSignOut() {
    setAuthSubmitting(true)
    try {
      await signOut(session)
      clearPasswordResetModeFromUrl()
      setSession(null)
      setAuthMode('signin')
      toast('Sesión cerrada')
      transactionStore.getState().clearTransactions()
      clearAllCategoryOverrides()
      clearAllDescriptionOverrides()
      replaceCustomPatterns([])
      replaceCustomCategories([])
      setAiConfig(null)
      setTheme('auto')
      setPreferredCurrency('USD')
      setFxRate(40.5)
      resetPrefsLoaded()
      navigate('/', { replace: true })
      setImportOpen(false)
      setAuthError('')
      setAuthNotice('')
      setSyncStatus('loading')
      setSyncKey(0)
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'No se pudo cerrar sesión'
      )
    } finally {
      setAuthSubmitting(false)
    }
  }

  // Deletes on the server first and clears local state only once that
  // succeeded. The server delete is several requests; if one fails part-way,
  // local state is reloaded so it shows what actually remains.
  async function handleResetAllData() {
    if (session) {
      try {
        await resetUserSupabaseData(session)
      } catch (error) {
        console.error('reset failed:', error)
        refetch()
        throw new UserFacingError(
          'No se pudieron borrar todos los datos. Recargamos lo que quedó guardado; intentá de nuevo.'
        )
      }
    }

    transactionStore.getState().clearTransactions()
    clearAllCategoryOverrides()
    clearAllDescriptionOverrides()
    replaceCustomPatterns([])
    replaceCustomCategories([])
    setAiConfig(null)
    setTheme('auto')
    setPreferredCurrency('USD')
    setFxRate(40.5)
    resetPrefsLoaded()
  }

  function navigateToTransactions(
    filter: import('./models').TransactionsFilter
  ) {
    go('transactions', filterToSearch(filter))
  }

  const {
    handleTransactionsImported,
    handleUpdateTransaction,
    handleDeleteTransaction,
    handleRestoreTransactions,
    handleSplitTransaction,
    handleUnsplitTransaction,
    handleBulkCategorizeTransactions,
    handleBulkDeleteTransactions,
    handleBulkTagTransactions,
    handleAutoCategorizeTransactions,
    handleApplyPatternToPast,
  } = useTransactionHandlers({
    session,
    setError: setAuthError,
  })

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
        onNavigate={(v) => go(v)}
        onImport={() => setImportOpen(true)}
        onSignOut={() => {
          void handleSignOut()
        }}
        session={session}
        uncategorizedCount={uncategorizedCount}
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
              go(v)
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
            uncategorizedCount={uncategorizedCount}
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

          {syncStatus === 'loading' ? (
            currentView === 'transactions' ? (
              <TransactionTableSkeleton />
            ) : (
              <DashboardSkeleton />
            )
          ) : syncStatus === 'error' ? (
            <ConnectionLostState onRetry={refetch} />
          ) : (
            <ViewErrorBoundary resetKey={currentView}>
              <Suspense
                fallback={
                  currentView === 'transactions' ? (
                    <TransactionTableSkeleton />
                  ) : (
                    <DashboardSkeleton />
                  )
                }
              >
                {currentView === 'overview' && transactions.length === 0 && (
                  <Onboarding
                    onImport={() => setImportOpen(true)}
                    userName={getFriendlyName(session) || undefined}
                  />
                )}
                {currentView === 'overview' && transactions.length > 0 && (
                  <Dashboard
                    transactions={transactions}
                    userName={getFriendlyName(session) || undefined}
                    onNavigateToImport={() => setImportOpen(true)}
                    onNavigateToCategories={() => go('categories')}
                    onNavigateToTransactions={navigateToTransactions}
                    homeCurrency={preferredCurrency}
                    fxRate={fxRate}
                    onSetHomeCurrency={setPreferredCurrency}
                    onSetFxRate={setFxRate}
                  />
                )}
                {currentView === 'transactions' &&
                  transactions.length === 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 320,
                        gap: 16,
                        padding: '48px 24px',
                        textAlign: 'center',
                      }}
                    >
                      <Upload
                        size={40}
                        style={{ color: 'var(--text-faint)' }}
                      />
                      <div>
                        <p
                          style={{
                            fontSize: 16,
                            fontWeight: 600,
                            marginBottom: 6,
                          }}
                        >
                          No hay transacciones
                        </p>
                        <p
                          style={{
                            fontSize: 14,
                            color: 'var(--text-muted)',
                            maxWidth: 280,
                            margin: '0 auto',
                          }}
                        >
                          Importá tu primer extracto CSV de Santander para
                          empezar a ver tus movimientos.
                        </p>
                      </div>
                      <Button onClick={() => setImportOpen(true)}>
                        <Upload size={16} />
                        Importar CSV
                      </Button>
                    </div>
                  )}
                {currentView === 'transactions' && transactions.length > 0 && (
                  <Transactions
                    key={transactionsKeyRef.current}
                    transactions={transactions}
                    initialFilters={parseFilterParams(location.search)}
                    onFiltersChange={handleTransactionFiltersChange}
                    homeCurrency={preferredCurrency}
                    fxRate={fxRate}
                    onUpdateTransaction={handleUpdateTransaction}
                    onDeleteTransaction={handleDeleteTransaction}
                    onRestoreTransactions={handleRestoreTransactions}
                    onReload={refetch}
                    onAutoCategorizeTransactions={
                      handleAutoCategorizeTransactions
                    }
                    onBulkCategorize={handleBulkCategorizeTransactions}
                    onBulkDelete={handleBulkDeleteTransactions}
                    onBulkTag={handleBulkTagTransactions}
                    onSplitTransaction={handleSplitTransaction}
                    onUnsplitTransaction={handleUnsplitTransaction}
                  />
                )}
                {currentView === 'insights' && session && (
                  <Insights
                    transactions={transactions}
                    homeCurrency={preferredCurrency}
                    fxRate={fxRate}
                    session={session}
                    aiEnabled={aiEnabled}
                    claudeApiKey={claudeApiKey}
                    onNavigateToTransactions={navigateToTransactions}
                    onNavigateToSettings={() => go('settings')}
                    onNavigateToImport={() => setImportOpen(true)}
                  />
                )}
                {currentView === 'categories' && (
                  <Categories
                    transactions={transactions}
                    homeCurrency={preferredCurrency}
                    fxRate={fxRate}
                    onNavigateToTransactions={navigateToTransactions}
                    onApplyPatternToPast={handleApplyPatternToPast}
                  />
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
                    claudeApiKey={claudeApiKey}
                    onSetClaudeApiKey={setClaudeApiKey}
                    aiEnabled={aiEnabled}
                    onSetAiEnabled={setAiEnabled}
                    aiModel={aiModel}
                    onSetAiModel={setAiModel}
                  />
                )}
              </Suspense>
            </ViewErrorBoundary>
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
            overflowX: 'hidden',
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
              go('transactions')
            }}
            onTransactionsImported={handleTransactionsImported}
          />
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  )
}

export default App

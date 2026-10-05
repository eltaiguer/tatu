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
import { countsAsRow } from './services/spending/spending-rules'
import {
  filterToSearch,
  parseFilterParams,
} from './services/filters/url-filters'
import { ViewSkeleton } from './components/StateSkeletons'
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
  resetFailedViews,
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
import { resetUserSupabaseData } from './services/supabase/reset'
import {
  flushPreferenceSaves,
  startEmptyWorkspace,
  teardownWorkspace,
} from './stores/workspace-store'
import { useUserWorkspace } from './hooks/useUserWorkspace'
import { useAuthSession } from './hooks/useAuthSession'
import { useTransactionHandlers } from './hooks/useTransactionHandlers'
import { createSupabaseRepository } from './services/repository/supabase-repository'
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
          countsAsRow(tx) &&
          normalizeCategoryId(tx.category) === 'uncategorized'
      ).length,
    [transactions]
  )

  const {
    status: syncStatus,
    refetch,
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
  } = useUserWorkspace({
    session,
    authMode,
    onHydrateStart: () => {
      setAuthError('')
      setAuthNotice('')
    },
  })

  async function handleSignOut() {
    setAuthSubmitting(true)
    try {
      // Let the last preference edit reach the server while the token is
      // still valid.
      await flushPreferenceSaves()
      await signOut(session)
      clearPasswordResetModeFromUrl()
      setSession(null)
      teardownWorkspace()
      setAuthMode('signin')
      toast('Sesión cerrada')
      navigate('/', { replace: true })
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

  // Deletes on the server first and clears local state only once that
  // succeeded. The server delete is several requests; if one fails part-way,
  // local state is reloaded so it shows what actually remains.
  async function handleResetAllData() {
    if (session) {
      try {
        // A save still in flight could recreate the preferences row after
        // the delete.
        await flushPreferenceSaves()
        await resetUserSupabaseData(session)
      } catch (error) {
        console.error('reset failed:', error)
        refetch()
        throw new UserFacingError(
          'No se pudieron borrar todos los datos. Recargamos lo que quedó guardado; intentá de nuevo.'
        )
      }
    }

    // The server now holds nothing for this user: start them over empty,
    // with default preferences (no key, AI off), still signed in.
    if (session) startEmptyWorkspace(session)
    else teardownWorkspace()
  }

  function navigateToTransactions(
    filter: import('./models').TransactionsFilter
  ) {
    go('transactions', filterToSearch(filter))
  }

  // The signed-in user's repository (#119): every write goes through it.
  const repository = useMemo(
    () => (session ? createSupabaseRepository(session) : null),
    [session]
  )

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
    repository,
    setError: setAuthError,
  })

  if (!session || authMode === 'reset') {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <TatuLogo size="md" />
            {/* The page's h1, kept at the h2 size it always had. */}
            <h1 className="mt-4 mb-1 text-[length:var(--text-2xl)] leading-[1.3] tracking-[-0.01em]">
              {authMode === 'reset'
                ? 'Elegí una nueva contraseña'
                : 'Ingresar a Tatú'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {authMode === 'reset'
                ? 'Este cambio se aplica a tu cuenta de Tatú.'
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
              teardownWorkspace()
            }}
          />
        </div>
      </main>
    )
  }

  return (
    <div className="flex min-h-[100vh] bg-[var(--bg)]">
      {/* Skip link: the first Tab stop, so keyboard users can jump past the
          sidebar. Focus moves by hand — a "#main" href would put a hash in
          the URL, which the password-recovery flow reads. */}
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main')?.focus()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-[var(--radius-md)] focus:bg-[var(--surface)] focus:px-4 focus:py-2 focus:text-[14px] focus:font-semibold focus:text-[var(--text)] focus:shadow-[var(--shadow-lg)] focus:outline-2 focus:outline-[var(--brand)]"
      >
        Saltar al contenido
      </a>
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
          className="w-[min(288px,85vw)] border-r border-r-[var(--border)] bg-[var(--surface)] p-0"
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
        id="main"
        tabIndex={-1}
        className="ml-[var(--sidebar-w,252px)] min-w-0 flex-1 outline-none"
      >
        {/* Mobile sticky header */}
        <header className="md:hidden sticky top-0 z-40 flex items-center gap-3 h-[56px] px-[16px] py-0 bg-[var(--surface)] border-b border-b-[var(--border)]">
          <button
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={mobileMenuOpen}
            className="grid shrink-0 cursor-pointer place-items-center rounded-[8px] border-none bg-transparent bg-none p-[8px] text-[var(--text-muted)]"
          >
            <Menu size={20} />
          </button>
          <span className="font-[family-name:var(--font-display)] text-[20px] font-semibold tracking-[-0.02em]">
            Tatú
          </span>
        </header>

        <div className="px-4 pt-5 pb-20 md:px-11 md:pt-10 max-w-[1180px] mx-auto my-0">
          {authError && (
            <p className="text-sm mb-4 text-[var(--neg)]" role="alert">
              {authError}
            </p>
          )}
          {authNotice && (
            <p className="text-sm mb-4 text-[var(--text-muted)]" role="status">
              {authNotice}
            </p>
          )}

          {syncStatus === 'loading' ? (
            <ViewSkeleton view={currentView} />
          ) : syncStatus === 'error' ? (
            <ConnectionLostState onRetry={refetch} />
          ) : (
            <ViewErrorBoundary
              resetKey={currentView}
              onReset={resetFailedViews}
            >
              <Suspense fallback={<ViewSkeleton view={currentView} />}>
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
                    <div className="flex min-h-[320px] flex-col items-center justify-center gap-[16px] px-[24px] py-[48px] text-center">
                      <Upload size={40} className="text-[var(--text-faint)]" />
                      <div>
                        <p className="mb-[6px] text-[16px] font-semibold">
                          No hay transacciones
                        </p>
                        <p className="mx-auto my-0 max-w-[280px] text-[14px] text-[var(--text-muted)]">
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
                    repository={repository}
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
                    repository={repository}
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
                    onBulkDelete={handleBulkDeleteTransactions}
                    onRestoreTransactions={handleRestoreTransactions}
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
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[680px]! overflow-x-hidden overflow-y-auto rounded-[var(--radius-lg)]!">
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

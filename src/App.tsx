import { useState } from 'react'
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
import { Dashboard } from './components/Dashboard'
import { Transactions } from './components/Transactions'
import { Insights } from './components/Insights'
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
import { Sun, Moon, Menu, Monitor, Upload } from 'lucide-react'
import { Button } from './components/ui/button'
import { useStore } from 'zustand'
import { transactionStore } from './stores/transaction-store'
import { signOut } from './services/supabase/auth'
import {
  clearAllCategoryOverrides,
} from './services/categorizer/category-overrides'
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

function App() {
  const [currentView, setCurrentView] = useState<View>('overview')
  const [importOpen, setImportOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [pendingTxFilter, setPendingTxFilter] = useState<import('./models').TransactionsFilter | null>(null)
  const [syncStatus, setSyncStatus] = useState<'loading' | 'ready' | 'error'>('loading')
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

  // Get transactions from store
  const transactions = useStore(transactionStore, (state) => state.transactions)

  const {
    theme,
    setTheme,
    isDark,
    cycleTheme,
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
      setCurrentView('overview')
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

  async function handleResetAllData() {
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
    handleSplitTransaction,
    handleUnsplitTransaction,
    handleBulkCategorizeTransactions,
    handleBulkDeleteTransactions,
    handleBulkTagTransactions,
    handleAutoCategorizeTransactions,
  } = useTransactionHandlers({ session, setError: setAuthError, setNotice: setAuthNotice })

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

          {syncStatus === 'loading' ? (
            currentView === 'transactions' ? (
              <TransactionTableSkeleton />
            ) : (
              <DashboardSkeleton />
            )
          ) : syncStatus === 'error' ? (
            <ConnectionLostState onRetry={refetch} />
          ) : (
            <>
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
                  onNavigateToTransactions={navigateToTransactions}
                  homeCurrency={preferredCurrency}
                  fxRate={fxRate}
                  onSetHomeCurrency={setPreferredCurrency}
                  onSetFxRate={setFxRate}
                />
              )}
              {currentView === 'transactions' && transactions.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 16, padding: '48px 24px', textAlign: 'center' }}>
                  <Upload size={40} style={{ color: 'var(--text-faint)' }} />
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No hay transacciones</p>
                    <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 280, margin: '0 auto' }}>Importá tu primer extracto CSV de Santander para empezar a ver tus movimientos.</p>
                  </div>
                  <Button onClick={() => setImportOpen(true)}>
                    <Upload size={16} />
                    Importar CSV
                  </Button>
                </div>
              )}
              {currentView === 'transactions' && transactions.length > 0 && (
                <Transactions
                  transactions={transactions}
                  initialFilter={pendingTxFilter ?? undefined}
                  homeCurrency={preferredCurrency}
                  fxRate={fxRate}
                  onUpdateTransaction={handleUpdateTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                  onAutoCategorizeTransactions={handleAutoCategorizeTransactions}
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
                  onNavigateToSettings={() => setCurrentView('settings')}
                  onNavigateToImport={() => setImportOpen(true)}
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
                  claudeApiKey={claudeApiKey}
                  onSetClaudeApiKey={setClaudeApiKey}
                  aiEnabled={aiEnabled}
                  onSetAiEnabled={setAiEnabled}
                  aiModel={aiModel}
                  onSetAiModel={setAiModel}
                />
              )}
            </>
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

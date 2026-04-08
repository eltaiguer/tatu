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
  subscribeToAuthChanges,
  updatePassword,
} from './services/supabase/auth'
import {
  isSupabaseConfigured,
  type SupabaseSession,
} from './services/supabase/client'
import {
  loadUserTransactions,
  persistTransactions,
  softDeleteTransaction,
  updateTransaction as updateRemoteTransaction,
} from './services/supabase/transactions'
import type { Transaction } from './models'
import {
  listMerchantCategoryOverrides,
  clearAllCategoryOverrides,
  clearMerchantCategoryOverrideWithSync,
  replaceMerchantCategoryOverrides,
  setMerchantCategoryOverrideWithSync,
} from './services/categorizer/category-overrides'
import {
  clearAllDescriptionOverrides,
  clearDescriptionOverrideWithSync,
  listDescriptionOverrides as listLocalDescriptionOverrides,
  replaceDescriptionOverrides,
  setDescriptionOverrideWithSync,
} from './services/descriptions/description-overrides'
import { buildDescriptionOverrideKey } from './services/descriptions/normalization'
import {
  listCustomCategories as listLocalCustomCategories,
  replaceCustomCategories,
} from './services/categories/category-store'
import { listCategoryOverrides, upsertCategoryOverride } from './services/supabase/category-overrides'
import {
  listDescriptionOverrides as listRemoteDescriptionOverrides,
  upsertDescriptionOverride,
} from './services/supabase/description-overrides'
import { listCustomCategories, upsertCustomCategory } from './services/supabase/custom-categories'
import {
  completeImportRun,
  createImportRun,
  failImportRun,
  sha256Hex,
} from './services/supabase/import-runs'
import { setActiveSupabaseSession } from './services/supabase/runtime'
import { resetUserSupabaseData } from './services/supabase/reset'
import { categorizeTransaction } from './services/categorizer/transaction-categorizer'

type View = 'dashboard' | 'transactions' | 'charts' | 'tools' | 'import'
const CATEGORY_OVERRIDES_MIGRATION_KEY =
  'tatu:migration:category-overrides:v1'
const DESCRIPTION_OVERRIDES_MIGRATION_KEY =
  'tatu:migration:description-overrides:v1'
const CUSTOM_CATEGORIES_MIGRATION_KEY = 'tatu:migration:custom-categories:v1'

function isPasswordResetMode(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  const hashParams = new URLSearchParams(hash)
  const isRecoveryHash =
    hashParams.get('type') === 'recovery' &&
    hashParams.has('access_token')

  return (
    new URLSearchParams(window.location.search).get('mode') ===
      'reset-password' || isRecoveryHash
  )
}

function clearPasswordResetModeFromUrl(): void {
  if (typeof window === 'undefined') {
    return
  }

  const url = new URL(window.location.href)
  if (!url.searchParams.has('mode')) {
    return
  }

  url.searchParams.delete('mode')
  const nextQuery = url.searchParams.toString()
  window.history.replaceState(
    {},
    '',
    `${url.pathname}${nextQuery ? `?${nextQuery}` : ''}${url.hash}`
  )
}

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
  const [authMode, setAuthMode] = useState<'signin' | 'reset'>(() =>
    isPasswordResetMode() ? 'reset' : 'signin'
  )

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
    setActiveSupabaseSession(session)
  }, [session])

  useEffect(() => {
    if (!supabaseEnabled) {
      return
    }

    const unsubscribe = subscribeToAuthChanges(
      (nextSession) => {
        setSession(nextSession)
      },
      () => {
        setAuthMode('reset')
        setAuthError('')
        setAuthNotice('Ingresá una nueva contraseña para tu cuenta')
      }
    )

    return () => {
      unsubscribe()
    }
  }, [supabaseEnabled])

  useEffect(() => {
    let cancelled = false

    async function syncTransactions() {
      if (!supabaseEnabled) {
        setAuthLoading(false)
        return
      }

      if (authMode === 'reset') {
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
        const notices: string[] = []
        const remoteTransactions = await loadUserTransactions(session)
        const localTransactions = getPersistedTransactionsSnapshot()
        const remoteIds = new Set(remoteTransactions.map((tx) => tx.id))
        const transactionsToMigrate = localTransactions.filter(
          (tx) => !remoteIds.has(tx.id)
        )

        if (transactionsToMigrate.length > 0) {
          await persistTransactions(session, transactionsToMigrate)
          notices.push(
            `${transactionsToMigrate.length} transacciones locales migradas`
          )
        }

        const shouldMigrateOverrides =
          localStorage.getItem(CATEGORY_OVERRIDES_MIGRATION_KEY) !== 'done'
        if (shouldMigrateOverrides) {
          const localOverrides = listMerchantCategoryOverrides()
          for (const [merchantNormalized, override] of Object.entries(
            localOverrides
          )) {
            await upsertCategoryOverride(session, {
              merchantNormalized,
              merchantOriginal: override.merchantName,
              category: override.category,
            })
          }

          localStorage.setItem(CATEGORY_OVERRIDES_MIGRATION_KEY, 'done')
          if (Object.keys(localOverrides).length > 0) {
            notices.push('Reglas de categoría migradas a la nube')
          }
        }

        const remoteOverrides = await listCategoryOverrides(session)
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

        const shouldMigrateDescriptionOverrides =
          localStorage.getItem(DESCRIPTION_OVERRIDES_MIGRATION_KEY) !== 'done'
        if (shouldMigrateDescriptionOverrides) {
          const localDescriptionOverrides = listLocalDescriptionOverrides()
          for (const [descriptionNormalized, override] of Object.entries(
            localDescriptionOverrides
          )) {
            await upsertDescriptionOverride(session, {
              descriptionNormalized,
              descriptionOriginal: override.descriptionOriginal,
              friendlyDescription: override.friendlyDescription,
              category: override.category,
            })
          }

          localStorage.setItem(DESCRIPTION_OVERRIDES_MIGRATION_KEY, 'done')
          if (Object.keys(localDescriptionOverrides).length > 0) {
            notices.push('Reglas de descripción migradas a la nube')
          }
        }

        const remoteDescriptionOverrides =
          await listRemoteDescriptionOverrides(session)
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

        const shouldMigrateCustomCategories =
          localStorage.getItem(CUSTOM_CATEGORIES_MIGRATION_KEY) !== 'done'
        if (shouldMigrateCustomCategories) {
          const localCustomCategories = listLocalCustomCategories()
          for (const category of localCustomCategories) {
            await upsertCustomCategory(session, {
              id: category.id,
              label: category.label,
              color: category.color,
              icon: category.icon,
              isArchived: false,
            })
          }

          localStorage.setItem(CUSTOM_CATEGORIES_MIGRATION_KEY, 'done')
          if (localCustomCategories.length > 0) {
            notices.push('Categorías personalizadas migradas a la nube')
          }
        }

        const remoteCustomCategories = await listCustomCategories(session)
        replaceCustomCategories(
          remoteCustomCategories.map((category) => ({
            id: category.id,
            label: category.label,
            color: category.color,
            icon: category.icon,
          }))
        )

        if (notices.length > 0) {
          setAuthNotice(notices.join(' · '))
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
  }, [authMode, session, supabaseEnabled])

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
      setAuthMode('signin')
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

  async function handleTransactionsImported(
    transactionsToImport: Transaction[],
    context?: {
      parsedData: {
        fileType: 'credit_card' | 'bank_account_usd' | 'bank_account_uyu'
      }
      csvContent: string
      fileName: string
    }
  ) {
    if (!supabaseEnabled || !session) {
      return transactionStore.getState().addTransactions(transactionsToImport)
    }

    let importRunId: string | null = null
    if (context) {
      const fileChecksum = await sha256Hex(context.csvContent)
      importRunId = await createImportRun(session, {
        fileName: context.fileName,
        fileType: context.parsedData.fileType,
        fileChecksum,
      })
    }

    const state = transactionStore.getState()
    const duplicateIds = new Set(state.findDuplicateIds(transactionsToImport))
    const added = transactionsToImport.filter((tx) => !duplicateIds.has(tx.id))
    const duplicates = transactionsToImport.filter((tx) =>
      duplicateIds.has(tx.id)
    )

    try {
      await persistTransactions(session, added, {
        importId: importRunId ?? undefined,
      })
      state.addTransactions(added)

      if (importRunId) {
        await completeImportRun(session, importRunId, {
          totalRows: transactionsToImport.length,
          insertedRows: added.length,
          duplicateRows: duplicates.length,
        })
      }
    } catch (error) {
      if (importRunId) {
        await failImportRun(
          session,
          importRunId,
          error instanceof Error ? error.message : 'Error de importación'
        )
      }
      throw error
    }

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

  async function handlePasswordUpdate() {
    setAuthSubmitting(true)
    setAuthError('')
    setAuthNotice('')

    try {
      await updatePassword(password)
      try {
        await signOut(session)
      } catch {
        // Ignore sign-out errors after a successful password change.
      }
      setSession(null)
      transactionStore.getState().clearTransactions()
      setPassword('')
      setAuthMode('signin')
      clearPasswordResetModeFromUrl()
      setAuthNotice('Contraseña actualizada. Iniciá sesión nuevamente')
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar la contraseña'
      )
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function handleResetAllData() {
    transactionStore.getState().clearTransactions()
    clearAllCategoryOverrides()
    clearAllDescriptionOverrides()
    replaceCustomCategories([])
    localStorage.removeItem('tatu:transactions')
    localStorage.removeItem('tatu:customCategories')
    localStorage.removeItem('tatu:categoryOverrides')
    localStorage.removeItem('tatu:descriptionOverrides')
    localStorage.removeItem(CATEGORY_OVERRIDES_MIGRATION_KEY)
    localStorage.removeItem(DESCRIPTION_OVERRIDES_MIGRATION_KEY)
    localStorage.removeItem(CUSTOM_CATEGORIES_MIGRATION_KEY)

    if (supabaseEnabled && session) {
      await resetUserSupabaseData(session)
    }

    setAuthNotice('Datos eliminados correctamente')
  }

  async function handleUpdateTransaction(
    transactionId: string,
    updates: {
      displayDescription?: string
      category?: string
      tags?: string[]
      applyScope: 'single' | 'matching_past_and_future' | 'future_matching_only'
    }
  ) {
    const state = transactionStore.getState()
    const current = state.transactions.find((tx) => tx.id === transactionId)
    if (!current) {
      return
    }

    const trimmedDisplayDescription = updates.displayDescription?.trim()
    const applyToMatching = updates.applyScope === 'matching_past_and_future'
    const applyToFutureOnly = updates.applyScope === 'future_matching_only'
    const nextCategory = updates.category?.trim() || undefined
    const nextTags = updates.tags

    if (applyToMatching) {
      const targetKey = buildDescriptionOverrideKey(current.description)
      const matchingTransactions = state.transactions.filter(
        (tx) => {
          const key = buildDescriptionOverrideKey(tx.description)
          return key !== null && key === targetKey
        }
      )

      try {
        if (
          trimmedDisplayDescription &&
          trimmedDisplayDescription !== current.description
        ) {
          await setDescriptionOverrideWithSync({
            description: current.description,
            friendlyDescription: trimmedDisplayDescription,
            category: nextCategory,
          })
        } else {
          await clearDescriptionOverrideWithSync(current.description)
        }

        if (nextCategory) {
          await setMerchantCategoryOverrideWithSync(
            current.description,
            nextCategory
          )
        } else {
          await clearMerchantCategoryOverrideWithSync(current.description)
        }

        if (supabaseEnabled && session) {
          await Promise.all(
            matchingTransactions.map((tx) =>
              updateRemoteTransaction(session, tx.id, {
                category: nextCategory,
                displayDescription: undefined,
              })
            )
          )

          if (nextTags !== undefined) {
            await updateRemoteTransaction(session, transactionId, {
              tags: nextTags,
            })
          }
        }

        state.setTransactions(
          state.transactions.map((tx) => {
            if (
              buildDescriptionOverrideKey(tx.description) !== targetKey
            ) {
              return tx
            }

            const categoryUpdates = nextCategory ? { category: nextCategory } : {}
            const tagsUpdates =
              tx.id === transactionId && nextTags !== undefined
                ? { tags: nextTags }
                : {}

            return {
              ...tx,
              ...categoryUpdates,
              ...tagsUpdates,
              displayDescription: undefined,
            }
          })
        )
        setAuthError('')
      } catch (error) {
        setAuthError(
          error instanceof Error
            ? error.message
            : 'No se pudo actualizar la transacción'
        )
      }
      return
    }

    if (applyToFutureOnly) {
      try {
        if (
          trimmedDisplayDescription &&
          trimmedDisplayDescription !== current.description
        ) {
          await setDescriptionOverrideWithSync({
            description: current.description,
            friendlyDescription: trimmedDisplayDescription,
            category: nextCategory,
          })
        } else {
          await clearDescriptionOverrideWithSync(current.description)
        }

        if (nextCategory) {
          await setMerchantCategoryOverrideWithSync(
            current.description,
            nextCategory
          )
        } else {
          await clearMerchantCategoryOverrideWithSync(current.description)
        }

        if (supabaseEnabled && session) {
          await updateRemoteTransaction(session, transactionId, {
            displayDescription:
              trimmedDisplayDescription &&
              trimmedDisplayDescription !== current.description
                ? trimmedDisplayDescription
                : undefined,
            category: nextCategory,
            tags: nextTags,
          })
        }

        state.updateTransaction(transactionId, {
          displayDescription:
            trimmedDisplayDescription &&
            trimmedDisplayDescription !== current.description
              ? trimmedDisplayDescription
              : undefined,
          category: nextCategory,
          tags: nextTags,
        })
        setAuthError('')
      } catch (error) {
        setAuthError(
          error instanceof Error
            ? error.message
            : 'No se pudo actualizar la transacción'
        )
      }
      return
    }

    try {
      const singleDisplayDescription =
        trimmedDisplayDescription &&
        trimmedDisplayDescription !== current.description
          ? trimmedDisplayDescription
          : undefined

      if (supabaseEnabled && session) {
        await updateRemoteTransaction(session, transactionId, {
          displayDescription: singleDisplayDescription,
          category: nextCategory,
          tags: nextTags,
        })
      }

      state.updateTransaction(transactionId, {
        displayDescription: singleDisplayDescription,
        category: nextCategory,
        tags: nextTags,
      })
      setAuthError('')
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar la transacción'
      )
    }
  }

  async function handleDeleteTransaction(transactionId: string) {
    const state = transactionStore.getState()

    try {
      if (supabaseEnabled && session) {
        await softDeleteTransaction(session, transactionId)
      }

      state.removeTransaction(transactionId)
      setAuthError('')
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'No se pudo eliminar la transacción'
      )
    }
  }

  async function handleAutoCategorizeTransactions(transactionIds: string[]) {
    if (transactionIds.length === 0) {
      return
    }

    const state = transactionStore.getState()
    const targetIds = new Set(transactionIds)
    const categorizedTransactions = state.transactions
      .filter((transaction) => targetIds.has(transaction.id))
      .map((transaction) => {
        const result = categorizeTransaction(
          transaction.description,
          transaction.type
        )

        return {
          id: transaction.id,
          category: result.category,
          categoryConfidence: result.confidence,
        }
      })

    const matchedTransactions = categorizedTransactions.filter(
      (transaction) => transaction.category !== 'uncategorized'
    )

    if (categorizedTransactions.length === 0) {
      return
    }

    try {
      if (supabaseEnabled && session) {
        await Promise.all(
          categorizedTransactions.map((transaction) =>
            updateRemoteTransaction(session, transaction.id, {
              category: transaction.category,
              categoryConfidence: transaction.categoryConfidence,
            })
          )
        )
      }

      state.setTransactions(
        state.transactions.map((transaction) => {
          const categorized = categorizedTransactions.find(
            (entry) => entry.id === transaction.id
          )

          if (!categorized) {
            return transaction
          }

          return {
            ...transaction,
            category: categorized.category,
            categoryConfidence: categorized.categoryConfidence,
          }
        })
      )
      setAuthError('')
      if (matchedTransactions.length === 0) {
        setAuthNotice(
          'No se encontraron categorías automáticas para las transacciones seleccionadas'
        )
        return
      }

      setAuthNotice(
        `${matchedTransactions.length} transacción${matchedTransactions.length === 1 ? '' : 'es'} auto-categorizada${matchedTransactions.length === 1 ? '' : 's'}`
      )
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'No se pudieron auto-categorizar las transacciones'
      )
      setAuthNotice('')
    }
  }

  const navItems = [
    { id: 'dashboard' as View, label: 'Dashboard', icon: ChartBar },
    { id: 'transactions' as View, label: 'Transacciones', icon: ListFilter },
    { id: 'charts' as View, label: 'Insights', icon: ChartPie },
    { id: 'tools' as View, label: 'Herramientas', icon: Package },
    { id: 'import' as View, label: 'Importar', icon: Upload },
  ]

  if (supabaseEnabled && (!session || authMode === 'reset')) {
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
          <Transactions
            transactions={transactions}
            onUpdateTransaction={handleUpdateTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onAutoCategorizeTransactions={handleAutoCategorizeTransactions}
          />
        )}
        {currentView === 'charts' && <Charts transactions={transactions} />}
        {currentView === 'tools' && (
          <Tools
            transactions={transactions}
            onResetAllData={handleResetAllData}
          />
        )}
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

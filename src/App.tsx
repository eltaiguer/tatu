import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Toaster } from './components/ui/sonner'
import { TatuLogo } from './components/TatuLogo'
import { AppSidebar } from './components/AppSidebar'
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
import { Sun, Moon } from 'lucide-react'
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
import { replaceCustomCategories } from './services/categories/category-store'
import { listCategoryOverrides, upsertCategoryOverride } from './services/supabase/category-overrides'
import {
  listDescriptionOverrides as listRemoteDescriptionOverrides,
  upsertDescriptionOverride,
} from './services/supabase/description-overrides'
import { listCustomCategories } from './services/supabase/custom-categories'
import {
  completeImportRun,
  createImportRun,
  failImportRun,
  sha256Hex,
} from './services/supabase/import-runs'
import { setActiveSupabaseSession } from './services/supabase/runtime'
import { resetUserSupabaseData } from './services/supabase/reset'
import {
  categorizeTransaction,
  type CategorizationContext,
} from './services/categorizer/transaction-categorizer'
import { analyzeTemporalPatterns } from './services/categorizer/temporal-patterns'

const CATEGORY_OVERRIDES_MIGRATION_KEY =
  'tatu:migration:category-overrides:v1'
const DESCRIPTION_OVERRIDES_MIGRATION_KEY =
  'tatu:migration:description-overrides:v1'

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
  const [currentView, setCurrentView] = useState<View>('overview')
  const [importOpen, setImportOpen] = useState(false)
  const toggleTheme = () => setIsDark((d) => !d)
  const [pendingTxFilter, setPendingTxFilter] = useState<import('./models').TransactionsFilter | null>(null)
  const [session, setSession] = useState<SupabaseSession | null>(() =>
    supabaseEnabled ? getCurrentSession() : null
  )
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
        return
      }

      if (authMode === 'reset') {
        return
      }

      if (!session) {
        return
      }

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
        // sync complete
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
      toast.success('Sesión iniciada')
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
      toast('Sesión cerrada')
      transactionStore.getState().clearTransactions()
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

  function navigateToTransactions(filter: import('./models').TransactionsFilter) {
    setPendingTxFilter(filter)
    setCurrentView('transactions')
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
    localStorage.removeItem('tatu:categoryOverrides')
    localStorage.removeItem('tatu:descriptionOverrides')
    localStorage.removeItem(CATEGORY_OVERRIDES_MIGRATION_KEY)
    localStorage.removeItem(DESCRIPTION_OVERRIDES_MIGRATION_KEY)

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

  async function handleBulkCategorizeTransactions(
    transactionIds: string[],
    category: string
  ) {
    if (transactionIds.length === 0 || !category.trim()) {
      return
    }

    const state = transactionStore.getState()
    const targetIds = new Set(transactionIds)

    try {
      if (supabaseEnabled && session) {
        await Promise.all(
          transactionIds.map((id) =>
            updateRemoteTransaction(session, id, { category })
          )
        )
      }

      state.setTransactions(
        state.transactions.map((transaction) => {
          if (!targetIds.has(transaction.id)) {
            return transaction
          }
          return { ...transaction, category }
        })
      )
      setAuthError('')
      setAuthNotice(
        `${transactionIds.length} transacción${transactionIds.length === 1 ? '' : 'es'} categorizada${transactionIds.length === 1 ? '' : 's'}`
      )
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'No se pudieron categorizar las transacciones'
      )
      setAuthNotice('')
    }
  }

  async function handleBulkDeleteTransactions(transactionIds: string[]) {
    if (transactionIds.length === 0) {
      return
    }

    const state = transactionStore.getState()

    try {
      if (supabaseEnabled && session) {
        await Promise.all(
          transactionIds.map((id) => softDeleteTransaction(session, id))
        )
      }

      const targetIds = new Set(transactionIds)
      state.setTransactions(
        state.transactions.filter(
          (transaction) => !targetIds.has(transaction.id)
        )
      )
      setAuthError('')
      setAuthNotice(
        `${transactionIds.length} transacción${transactionIds.length === 1 ? '' : 'es'} eliminada${transactionIds.length === 1 ? '' : 's'}`
      )
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'No se pudieron eliminar las transacciones'
      )
      setAuthNotice('')
    }
  }

  async function handleBulkTagTransactions(
    transactionIds: string[],
    tag: string
  ) {
    if (transactionIds.length === 0 || !tag.trim()) {
      return
    }

    const trimmedTag = tag.trim()
    const state = transactionStore.getState()
    const targetIds = new Set(transactionIds)

    try {
      if (supabaseEnabled && session) {
        await Promise.all(
          transactionIds.map((id) => {
            const transaction = state.transactions.find((tx) => tx.id === id)
            const currentTags = transaction?.tags ?? []
            if (currentTags.includes(trimmedTag)) {
              return Promise.resolve()
            }
            return updateRemoteTransaction(session, id, {
              tags: [...currentTags, trimmedTag],
            })
          })
        )
      }

      state.setTransactions(
        state.transactions.map((transaction) => {
          if (!targetIds.has(transaction.id)) {
            return transaction
          }
          const currentTags = transaction.tags ?? []
          if (currentTags.includes(trimmedTag)) {
            return transaction
          }
          return { ...transaction, tags: [...currentTags, trimmedTag] }
        })
      )
      setAuthError('')
      setAuthNotice(
        `Tag "${trimmedTag}" agregado a ${transactionIds.length} transacción${transactionIds.length === 1 ? '' : 'es'}`
      )
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'No se pudo agregar el tag'
      )
      setAuthNotice('')
    }
  }

  async function handleAutoCategorizeTransactions(transactionIds: string[]) {
    if (transactionIds.length === 0) {
      return
    }

    const state = transactionStore.getState()
    const targetIds = new Set(transactionIds)

    // Build smart categorization context
    const overrides = listMerchantCategoryOverrides()
    const categorizedMerchants = [
      ...Object.entries(overrides).map(([name, o]) => ({
        name,
        category: o.category,
      })),
      ...state.transactions
        .filter(
          (t) =>
            t.category && t.category !== 'uncategorized'
        )
        .map((t) => ({ name: t.description, category: t.category! })),
    ]

    const temporalPatterns = analyzeTemporalPatterns(
      state.transactions.map((t) => ({
        description: t.description,
        amount: t.amount,
        currency: t.currency,
        date: t.date instanceof Date ? t.date : new Date(t.date),
      }))
    )

    const context: CategorizationContext = {
      categorizedMerchants,
      temporalPatterns,
    }

    const categorizedTransactions = state.transactions
      .filter((transaction) => targetIds.has(transaction.id))
      .map((transaction) => {
        const result = categorizeTransaction(
          transaction.description,
          transaction.type,
          {
            ...context,
            amount: transaction.amount,
            currency: transaction.currency,
          }
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
    <div
      style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}
    >
      {/* Sidebar */}
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
        supabaseEnabled={supabaseEnabled}
      />

      {/* Main content */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          marginLeft: 'var(--sidebar-w, 252px)',
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '40px 44px 80px',
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
              />
            )}
            {currentView === 'categories' && (
              <Categories transactions={transactions} />
            )}
            {currentView === 'settings' && (
              <Settings
                isDark={isDark}
                onToggleTheme={toggleTheme}
                session={session}
                supabaseEnabled={supabaseEnabled}
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
        onClick={toggleTheme}
        aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
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
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <Toaster />
    </div>
  )
}

export default App

import { useEffect } from 'react'
import type { SupabaseSession } from '../services/supabase/client'
import { transactionStore } from '../stores/transaction-store'
import { loadUserTransactions } from '../services/supabase/transactions'
import { replaceMerchantCategoryOverrides } from '../services/categorizer/category-overrides'
import { replaceDescriptionOverrides } from '../services/descriptions/description-overrides'
import { replaceCustomCategories } from '../services/categories/category-store'
import { replaceCustomPatterns } from '../services/categorizer/custom-patterns'
import { listCategoryOverrides } from '../services/supabase/category-overrides'
import { listDescriptionOverrides as listRemoteDescriptionOverrides } from '../services/supabase/description-overrides'
import { listCustomCategories } from '../services/supabase/custom-categories'
import { listCustomPatterns as listSupabaseCustomPatterns } from '../services/supabase/custom-patterns'
import { loadUserPreferences } from '../services/supabase/user-preferences'

export function useTransactionSync({
  session,
  authMode,
  syncKey,
  markPrefsLoaded,
  setError,
  setNotice,
  setSyncStatus,
  setTheme,
  setPreferredCurrency,
  setFxRate,
  setClaudeApiKey,
  setAiEnabled,
  setAiModel,
}: {
  session: SupabaseSession | null
  authMode: 'signin' | 'reset'
  syncKey: number
  markPrefsLoaded: () => void
  setError: (msg: string) => void
  setNotice: (msg: string) => void
  setSyncStatus: (s: 'loading' | 'ready' | 'error') => void
  setTheme: (t: 'light' | 'dark' | 'auto') => void
  setPreferredCurrency: (c: 'UYU' | 'USD') => void
  setFxRate: (r: number) => void
  setClaudeApiKey: (k: string) => void
  setAiEnabled: (e: boolean) => void
  setAiModel: (m: string) => void
}) {
  useEffect(() => {
    let cancelled = false

    async function syncTransactions() {
      if (authMode === 'reset') return
      if (!session) return

      setSyncStatus('loading')
      setError('')
      setNotice('')

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

        if (!cancelled) {
          if (userPrefs) {
            setTheme(userPrefs.theme)
            setPreferredCurrency(userPrefs.currency)
            setFxRate(userPrefs.fxRate)
            setClaudeApiKey(userPrefs.claudeApiKey)
            setAiEnabled(userPrefs.aiEnabled)
            setAiModel(userPrefs.aiModel)
          }
          // Allow preference saves now that remote values are applied.
          markPrefsLoaded()
          transactionStore.getState().setTransactions(remoteTransactions)
          setSyncStatus('ready')
        }
      } catch {
        if (!cancelled) {
          setSyncStatus('error')
        }
      }
    }

    void syncTransactions()

    return () => {
      cancelled = true
    }
    // Depend on the stable user id, not the whole session object. Supabase's
    // autoRefreshToken hands us a new session object on every window refocus
    // (TOKEN_REFRESHED); keying on session identity would refetch everything
    // each time the tab regains focus. The user id only changes on real
    // login/logout/user-switch, which are the only cases that need a re-sync.
  }, [authMode, session?.user?.id, syncKey]) // eslint-disable-line react-hooks/exhaustive-deps
}

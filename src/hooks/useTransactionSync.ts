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
  markPrefsLoaded,
  setError,
  setNotice,
  setTheme,
  setPreferredCurrency,
  setFxRate,
}: {
  session: SupabaseSession | null
  authMode: 'signin' | 'reset'
  markPrefsLoaded: () => void
  setError: (msg: string) => void
  setNotice: (msg: string) => void
  setTheme: (t: 'light' | 'dark' | 'auto') => void
  setPreferredCurrency: (c: 'UYU' | 'USD') => void
  setFxRate: (r: number) => void
}) {
  useEffect(() => {
    let cancelled = false

    async function syncTransactions() {
      if (authMode === 'reset') return
      if (!session) return

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
          }
          // Allow preference saves now that remote values are applied.
          markPrefsLoaded()
          transactionStore.getState().setTransactions(remoteTransactions)
        }
      } catch (error) {
        if (!cancelled) {
          setError(
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
  }, [authMode, session]) // eslint-disable-line react-hooks/exhaustive-deps
}

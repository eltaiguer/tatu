import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { SupabaseSession } from '../services/supabase/client'
import { saveUserPreferences } from '../services/supabase/user-preferences'
import { setAiConfig } from '../services/ai/ai-config'

export function useUserPreferences(session: SupabaseSession | null) {
  const prefsLoadedRef = useRef(false)
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('auto')
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const isDark = theme === 'dark' || (theme === 'auto' && systemDark)
  const [preferredCurrency, setPreferredCurrency] = useState<'UYU' | 'USD'>(
    'USD'
  )
  const [fxRate, setFxRate] = useState<number>(40.5)
  const [claudeApiKey, setClaudeApiKey] = useState<string>('')
  const [aiEnabled, setAiEnabled] = useState<boolean>(false)
  const [aiModel, setAiModel] = useState<string>('claude-haiku-4-5')

  const cycleTheme = () =>
    setTheme((t) => (t === 'light' ? 'dark' : t === 'dark' ? 'auto' : 'light'))

  // Listen for system color-scheme changes (used when theme === 'auto')
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Apply dark class
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  // Sync AI config singleton whenever AI settings change
  useEffect(() => {
    if (aiEnabled && claudeApiKey) {
      setAiConfig({ apiKey: claudeApiKey, enabled: true, model: aiModel })
    } else {
      setAiConfig(null)
    }
  }, [aiEnabled, claudeApiKey, aiModel])

  // Persist preferences to Supabase when they change.
  // Guard on prefsLoadedRef so initial defaults are never written before
  // syncTransactions has read the real values from Supabase.
  useEffect(() => {
    if (!session || !prefsLoadedRef.current) return
    saveUserPreferences(session, {
      theme,
      currency: preferredCurrency,
      fxRate,
      claudeApiKey,
      aiEnabled,
      aiModel,
    }).catch((err) => {
      console.error('preferences save failed:', err)
      toast.error('No se pudieron guardar las preferencias. Intentá de nuevo.')
    })
  }, [session, theme, preferredCurrency, fxRate, claudeApiKey, aiEnabled, aiModel])

  return {
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
    markPrefsLoaded: () => {
      prefsLoadedRef.current = true
    },
    resetPrefsLoaded: () => {
      prefsLoadedRef.current = false
    },
  }
}

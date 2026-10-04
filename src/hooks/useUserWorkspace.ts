import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { SupabaseSession } from '../services/supabase/client'
import {
  hydrateWorkspace,
  setPreference,
  teardownWorkspace,
  workspaceStore,
  type UserPreferences,
} from '../stores/workspace-store'

export type SyncStatus = 'loading' | 'ready' | 'error'

/**
 * React binding for the workspace store: hydrates the signed-in user's
 * workspace, and exposes their preferences, setters that save them, and the
 * load status. Teardown is `teardownWorkspace()` from the store.
 */
export function useUserWorkspace({
  session,
  authMode,
  onHydrateStart,
}: {
  session: SupabaseSession | null
  authMode: 'signin' | 'reset'
  /** Runs when a load starts (App clears stale auth messages). */
  onHydrateStart?: () => void
}) {
  const userId = session?.user?.id ?? null
  const [syncKey, setSyncKey] = useState(0)
  const refetch = useCallback(() => setSyncKey((k) => k + 1), [])

  const sessionRef = useRef(session)
  sessionRef.current = session
  const onHydrateStartRef = useRef(onHydrateStart)
  onHydrateStartRef.current = onHydrateStart

  // Keyed on the stable user id, not the session object: Supabase hands us a
  // new session object on every token refresh (tab refocus), which must not
  // reload everything.
  useEffect(() => {
    const loadedFor = workspaceStore.getState().userId
    // Safety net: a session that ended or switched without going through
    // teardown never leaves the previous user's data behind.
    if (loadedFor !== null && loadedFor !== userId) teardownWorkspace()

    const current = sessionRef.current
    if (!current || authMode === 'reset') return

    onHydrateStartRef.current?.()
    const hydration = hydrateWorkspace(current)
    return hydration.abandon
  }, [userId, authMode, syncKey])

  const workspace = useStore(workspaceStore)
  const { preferences } = workspace
  const status: SyncStatus =
    workspace.userId !== userId || workspace.status === 'idle'
      ? 'loading'
      : workspace.status === 'ready'
        ? 'ready'
        : workspace.status === 'error'
          ? 'error'
          : 'loading'

  const isDark = useIsDark(preferences.theme)

  const save = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      setPreference(sessionRef.current, key, value)
    },
    []
  )

  return {
    status,
    refetch,
    theme: preferences.theme,
    isDark,
    preferredCurrency: preferences.currency,
    fxRate: preferences.fxRate,
    claudeApiKey: preferences.claudeApiKey,
    aiEnabled: preferences.aiEnabled,
    aiModel: preferences.aiModel,
    setTheme: useCallback(
      (theme: UserPreferences['theme']) => save('theme', theme),
      [save]
    ),
    setPreferredCurrency: useCallback(
      (currency: UserPreferences['currency']) => save('currency', currency),
      [save]
    ),
    setFxRate: useCallback((fxRate: number) => save('fxRate', fxRate), [save]),
    setClaudeApiKey: useCallback(
      (key: string) => save('claudeApiKey', key),
      [save]
    ),
    setAiEnabled: useCallback(
      (enabled: boolean) => save('aiEnabled', enabled),
      [save]
    ),
    setAiModel: useCallback((model: string) => save('aiModel', model), [save]),
  }
}

// Follows the OS colour scheme when the theme is 'auto', and keeps the `dark`
// class on <html> in step.
function useIsDark(theme: UserPreferences['theme']): boolean {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const isDark = theme === 'dark' || (theme === 'auto' && systemDark)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])
  return isDark
}

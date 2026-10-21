// The signed-in user's workspace: everything Tatu holds in memory for one user
// (transactions, overrides, custom patterns, custom categories, preferences
// and the AI config derived from them). This module is the one owner of that
// lifecycle (#117):
//
//  - `hydrateWorkspace` is the only thing that fills it, through the user's
//    repository (the persistence port).
//  - `teardownWorkspace` is the only thing that empties it. Every path that
//    ends a session calls it (most through `endSession`); adding per-user
//    state means adding it here.
//  - `resetWorkspace` deletes everything the user stored and starts them
//    over empty.
//  - `setPreference` is the only thing that saves preferences, and only for
//    the user whose preferences are loaded — so one user's values (e.g. their
//    Claude API key, #123) can never be written into another user's row.
//
// Races: every hydrate takes a generation number. A teardown, a newer hydrate
// or an abandoned effect bumps the generation, and a load that resolves under
// a stale generation applies nothing.
import { toast } from 'sonner'
import {
  isWorkspaceOwner,
  workspaceStore,
  type WorkspaceState,
  type WorkspaceStatus,
} from './workspace-state'
import type { UserPreferences } from '../services/supabase/user-preferences'
import type {
  Repository,
  WorkspaceSnapshot,
} from '../services/repository/repository'
import {
  clearAllCategoryOverrides,
  replaceMerchantCategoryOverrides,
} from '../services/categorizer/category-overrides'
import {
  clearAllDescriptionOverrides,
  replaceDescriptionOverrides,
} from '../services/descriptions/description-overrides'
import { replaceCustomPatterns } from '../services/categorizer/custom-patterns'
import { replaceCustomCategories } from '../services/categories/category-store'
import { setAiConfig } from '../services/ai/ai-config'
import { DEFAULT_PREFERENCES } from '../services/preferences/defaults'
import { transactionStore } from './transaction-store'
import { captureError } from '../services/monitoring/error-reporting'
import { UserFacingError } from '../utils/user-error'
import type { AuthPort } from '../services/auth/auth-port'

export type { UserPreferences }
export { DEFAULT_PREFERENCES }
export { workspaceStore, isWorkspaceOwner }
export type { WorkspaceState, WorkspaceStatus }

let generation = 0

function applyPreferences(preferences: UserPreferences): void {
  // The AI config singleton is derived here and nowhere else, so it can never
  // disagree with what Configuración shows.
  setAiConfig(
    preferences.aiEnabled && preferences.claudeApiKey
      ? {
          apiKey: preferences.claudeApiKey,
          enabled: true,
          model: preferences.aiModel,
        }
      : null
  )
  workspaceStore.setState({ preferences })
}

/**
 * Empties every piece of per-user state and cancels any in-flight hydrate.
 * Idempotent. Call it from every path that ends a session.
 */
export function teardownWorkspace(): void {
  generation += 1
  transactionStore.getState().clearTransactions()
  clearAllCategoryOverrides()
  clearAllDescriptionOverrides()
  replaceCustomPatterns([])
  replaceCustomCategories([])
  applyPreferences({ ...DEFAULT_PREFERENCES })
  // A save not yet sent belongs to the user who is leaving: drop it. One
  // already in flight finishes against that user's own row, but nothing
  // waits on it any more (a hung request can't block the next user's saves).
  detachSaves()
  preferenceRepository = null
  workspaceStore.setState({ userId: null, status: 'idle' })
}

/**
 * How ending a session went:
 * - `ok`: signed out.
 * - `local-only`: the sign-out request failed but the session is gone from
 *   this device (the server may not know).
 * - `still-signed-in`: even the local sign-out failed (e.g. offline); the
 *   user is still signed in and the workspace was kept.
 */
export type SessionEnd = 'ok' | 'local-only' | 'still-signed-in'

/**
 * Ends the signed-in user's session: lets a pending preference save reach
 * the server while the token is still valid (bounded by
 * PREFERENCE_FLUSH_TIMEOUT_MS), signs out, then tears the workspace down —
 * only for the user who was leaving (one who signed in meanwhile is kept).
 * A failed sign-out is reported (`captureError(error, 'auth')`) and decided
 * here, once, for every caller: see `SessionEnd`. Never rejects.
 */
export async function endSession(
  auth: Pick<AuthPort, 'signOut' | 'getSession'>
): Promise<SessionEnd> {
  const leaving = workspaceStore.getState().userId
  const teardownIfStillLeaving = () => {
    if (workspaceStore.getState().userId === leaving) teardownWorkspace()
  }
  await flushPreferenceSaves()
  try {
    await auth.signOut()
  } catch (error) {
    captureError(error, 'auth')
    if (auth.getSession() !== null) return 'still-signed-in'
    teardownIfStillLeaving()
    return 'local-only'
  }
  teardownIfStillLeaving()
  return 'ok'
}

export const RESET_FAILED_MESSAGE =
  'No se pudieron borrar todos los datos. Recargamos lo que quedó guardado; intentá de nuevo.'

/**
 * Deletes everything the user has stored, then starts them over empty and
 * ready, still signed in, with default preferences (no key, AI off). Waits
 * for pending preference saves first, so a late save can't recreate the
 * row it deletes. The delete is several requests: if one fails, `reload()`
 * is asked to show what remains (the workspace hook's refetch, which owns
 * the load) and a UserFacingError carrying the failure as `cause` is thrown.
 * If another user's workspace was loaded meanwhile, it is left alone.
 */
export async function resetWorkspace(
  repository: Repository,
  reload: () => void
): Promise<void> {
  // No preference edit is accepted from here to the end: a save landing
  // after the delete would recreate the row, API key included.
  resettingUserId = repository.userId
  // A save still in flight when the bounded flush gives up (a hung request
  // must not block the reset) could land after the delete and recreate the
  // row, API key included: once it settles, the row is overwritten below.
  const inFlight = saving
  let settled = !inFlight
  void inFlight?.finally(() => {
    settled = true
  })
  try {
    await flushPreferenceSaves()
    await repository.resetAll()
  } catch (error) {
    console.error('reset failed:', error)
    if (isWorkspaceOwner(repository.userId)) reload()
    throw new UserFacingError(RESET_FAILED_MESSAGE, { cause: error })
  } finally {
    resettingUserId = null
  }
  if (!isWorkspaceOwner(repository.userId)) return
  // The server now holds nothing for this user: nothing to load.
  teardownWorkspace()
  preferenceRepository = repository
  workspaceStore.setState({ userId: repository.userId, status: 'ready' })
  if (inFlight && !settled) {
    void inFlight.finally(() => {
      // Whatever that late save wrote is replaced by what this user has now
      // (the defaults, or edits made since the reset) — never the old key.
      if (preferenceRepository !== repository) return
      enqueueSave(repository, workspaceStore.getState().preferences)
    })
  }
}

export interface Hydration {
  /** Settles once the load is applied, discarded or failed. Never rejects. */
  done: Promise<void>
  /** Discards this load if it hasn't landed yet. */
  abandon: () => void
}

/**
 * Loads `repository`'s user and replaces the workspace with it. Switching to
 * a different user tears the previous one down first. Nothing is applied
 * unless this is still the latest hydrate when the load resolves.
 */
export function hydrateWorkspace(repository: Repository): Hydration {
  const userId = repository.userId
  const current = workspaceStore.getState().userId
  if (current !== null && current !== userId) {
    teardownWorkspace()
  }

  generation += 1
  const myGeneration = generation
  const isCurrent = () => generation === myGeneration
  workspaceStore.setState({ userId, status: 'loading' })
  preferenceRepository = repository

  // A reload while an edit is still being saved would read the old row and
  // revert the edit in memory: let pending saves land first.
  const done = flushPreferenceSaves()
    .then(() => (isCurrent() ? repository.loadWorkspace() : null))
    .then(
      (loaded) => {
        if (!loaded || !isCurrent()) return
        applyLoaded(loaded)
        workspaceStore.setState({ status: 'ready' })
      },
      (error: unknown) => {
        if (!isCurrent()) return
        captureError(error, 'workspace')
        workspaceStore.setState({ status: 'error' })
      }
    )

  return {
    done,
    abandon: () => {
      if (isCurrent()) generation += 1
    },
  }
}

// Applies a whole load synchronously, so no render ever sees half a user.
function applyLoaded(loaded: WorkspaceSnapshot) {
  replaceMerchantCategoryOverrides(
    Object.fromEntries(
      loaded.categoryOverrides.map((override) => [
        override.merchantNormalized,
        {
          merchantName: override.merchantOriginal,
          category: override.category,
          updatedAt: override.updatedAt,
        },
      ])
    )
  )
  replaceDescriptionOverrides(
    Object.fromEntries(
      loaded.descriptionOverrides.map((override) => [
        override.descriptionNormalized,
        {
          descriptionOriginal: override.descriptionOriginal,
          friendlyDescription: override.friendlyDescription,
          category: override.category,
          updatedAt: override.updatedAt,
        },
      ])
    )
  )
  replaceCustomPatterns(loaded.customPatterns)
  replaceCustomCategories(
    loaded.customCategories.map((category) => ({
      id: category.id,
      label: category.label,
      color: category.color,
      icon: category.icon,
      isIgnored: category.isIgnored,
    }))
  )
  // No row: this user has never saved preferences — defaults, never whatever
  // was in memory before.
  applyPreferences({ ...(loaded.preferences ?? DEFAULT_PREFERENCES) })
  transactionStore.getState().setTransactions(loaded.transactions)
}

/**
 * Changes one preference and saves all of them to `forUserId`'s row, through
 * the repository the workspace was loaded with. Returns false and changes
 * nothing unless `forUserId` is the user whose workspace is loaded and ready
 * — so nothing is saved before a user's own preferences have been read, or
 * into anyone else's row.
 */
export function setPreference<K extends keyof UserPreferences>(
  forUserId: string | null,
  key: K,
  value: UserPreferences[K]
): boolean {
  const { userId, status, preferences } = workspaceStore.getState()
  const repository = preferenceRepository
  if (
    forUserId === null ||
    forUserId === resettingUserId ||
    status !== 'ready' ||
    forUserId !== userId ||
    repository?.userId !== forUserId
  ) {
    return false
  }
  if (Object.is(preferences[key], value)) return true
  const next = { ...preferences, [key]: value }
  applyPreferences(next)
  enqueueSave(repository, next)
  return true
}

// Saves go out one at a time, coalesced to the latest values: Configuración
// saves on every keystroke, and parallel full-row upserts could land out of
// order (an older key overwriting a newer one).
// The repository the current workspace was loaded through; preference saves
// go to the same place.
let preferenceRepository: Repository | null = null
// The user whose data is being deleted: their preference edits are refused.
let resettingUserId: string | null = null
let queuedSave: {
  repository: Repository
  preferences: UserPreferences
} | null = null
let saving: Promise<void> | null = null
let saveEpoch = 0

function detachSaves(): void {
  saveEpoch += 1
  queuedSave = null
  saving = null
}

function enqueueSave(
  repository: Repository,
  preferences: UserPreferences
): void {
  queuedSave = { repository, preferences }
  if (!saving) {
    const drain: Promise<void> = drainSaves(saveEpoch).finally(() => {
      if (saving === drain) saving = null
    })
    saving = drain
  }
}

async function drainSaves(epoch: number): Promise<void> {
  while (queuedSave && epoch === saveEpoch) {
    const { repository, preferences } = queuedSave
    queuedSave = null
    try {
      await repository.savePreferences(preferences)
    } catch (err) {
      console.error('preferences save failed:', err)
      captureError(err, 'preferences')
      toast.error('No se pudieron guardar las preferencias. Intentá de nuevo.')
    }
  }
}

/** How long sign-out, reset and reloads wait for a pending preference save. */
export const PREFERENCE_FLUSH_TIMEOUT_MS = 3000

/**
 * Settles once every pending preference save has finished, or after
 * `timeoutMs` — a hung request must never block sign-out or reset. Await it
 * before signing out or deleting the user's data, so a late save can't
 * recreate a row that was just deleted. Never rejects.
 */
export function flushPreferenceSaves(
  timeoutMs = PREFERENCE_FLUSH_TIMEOUT_MS
): Promise<void> {
  if (!saving) return Promise.resolve()
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    saving,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs)
    }),
  ]).finally(() => clearTimeout(timer))
}

// Whose workspace is loaded (#117). Split out of workspace-store.ts so that
// writers holding a repository — the mutation module, the rule stores — can
// check the owner without importing the module that hydrates them (a cycle).
// The lifecycle itself (hydrate / teardown / preferences) lives in
// workspace-store.ts.
import { createStore } from 'zustand/vanilla'
import type { UserPreferences } from '../services/supabase/user-preferences'
import { DEFAULT_PREFERENCES } from '../services/preferences/defaults'

/**
 * - `idle`: nobody's data is loaded.
 * - `loading` / `error`: `userId`'s data is being (or failed to be) loaded.
 * - `ready`: `userId`'s data is loaded; preference edits are saved.
 */
export type WorkspaceStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface WorkspaceState {
  /** Whose workspace this is, or null when nobody's is loaded. */
  userId: string | null
  status: WorkspaceStatus
  preferences: UserPreferences
}

export const workspaceStore = createStore<WorkspaceState>()(() => ({
  userId: null,
  status: 'idle',
  preferences: { ...DEFAULT_PREFERENCES },
}))

/**
 * True while `userId`'s workspace is the one in memory. A write that started
 * for one user checks this after every await: if someone else signed in
 * meanwhile, nothing it learned may land in their in-memory state.
 */
export function isWorkspaceOwner(userId: string): boolean {
  return workspaceStore.getState().userId === userId
}

// The authentication port: who is signed in, and the actions that change it.
// Two adapters implement it: `supabase-auth.ts` (production, wired in
// `main.tsx`) and `in-memory-auth.ts` (tests). App receives it as a prop and
// hands it to `useAuthSession`; nothing else talks to Supabase Auth.
// Callers always call methods on the port (`auth.signOut()`), never pass them
// detached, so an adapter may be a class whose methods use `this`.
import type { SupabaseSession } from '../supabase/client'

export type AuthSession = SupabaseSession

export interface AuthPort {
  /** The session restored from storage, or null. Synchronous: first render. */
  getSession(): AuthSession | null
  /**
   * Listens for session changes from the auth server, in this tab or another:
   * a session (signed in, token refreshed) or null (signed out). A password
   * recovery link first reports its session, then calls `onPasswordRecovery`.
   * As Supabase does, `signIn` / `signUp` / `signOut` report their own change
   * here too, before they resolve. Returns the unsubscribe function.
   */
  onAuthChange(
    onSession: (session: AuthSession | null) => void,
    onPasswordRecovery?: () => void
  ): () => void
  /** Rejects with the server's (English) message; map it for the UI. */
  signIn(email: string, password: string): Promise<AuthSession>
  signUp(email: string, password: string): Promise<AuthSession>
  /** Emails a recovery link that opens the app in password-reset mode. */
  requestPasswordReset(email: string): Promise<void>
  /** Sets the signed-in (recovery) session's password. */
  updatePassword(password: string): Promise<void>
  /**
   * Ends the session everywhere. If that fails, falls back to ending it on
   * this device only, and still rejects with the first failure (for
   * reporting). After a rejection `getSession()` says which happened: null
   * — the session is gone here (SIGNED_OUT was reported), only the server
   * may not know; a session — even the local sign-out failed (e.g.
   * offline), the user is still signed in and can retry.
   */
  signOut(): Promise<void>
}

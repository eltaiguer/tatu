// The in-memory adapter of the auth port, for tests: accounts in a map, and
// events raised the way Supabase raises them — `signIn` / `signUp` /
// `signOut` notify listeners before they resolve, a recovery link reports
// its session and then the recovery. `emit` and `recover` raise events from
// "outside" (another tab signing out, an email link).
import type { AuthPort, AuthSession } from './auth-port'

export type InMemoryAuthOp =
  | 'signIn'
  | 'signUp'
  | 'requestPasswordReset'
  | 'updatePassword'
  /** The global sign-out request. */
  | 'signOut'
  /** The local-scope fallback a failed global sign-out tries. */
  | 'signOutLocal'

export interface InMemoryAuth extends AuthPort {
  /** Registers an account; signing in with it returns `session`. */
  addAccount(
    email: string,
    password: string,
    session?: AuthSession
  ): AuthSession
  /** A session change from the server (null: SIGNED_OUT, e.g. another tab). */
  emit(session: AuthSession | null): void
  /** A password recovery link was opened: its session, then the recovery. */
  recover(session: AuthSession): void
  /** Makes every later call of `op` reject with `error`. */
  failOn(op: InMemoryAuthOp, error?: Error): void
  /** Removes every failure set with `failOn`. */
  heal(): void
  resetRequests: string[]
  passwordUpdates: string[]
  signOuts: number
}

/** A session for user `id` (email `<id>@example.com` unless given). */
export function makeSession(id: string, email = `${id}@example.com`) {
  return {
    access_token: `access-${id}`,
    refresh_token: `refresh-${id}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 9999999999,
    user: { id, email },
  } as AuthSession
}

export function createInMemoryAuth(
  seed: { session?: AuthSession | null } = {}
): InMemoryAuth {
  let current = seed.session ?? null
  const accounts = new Map<string, { password: string; session: AuthSession }>()
  const listeners = new Set<{
    onSession: (session: AuthSession | null) => void
    onRecovery?: () => void
  }>()
  const faults = new Map<InMemoryAuthOp, Error>()

  function check(op: InMemoryAuthOp) {
    const error = faults.get(op)
    if (error) throw error
  }

  function emit(session: AuthSession | null) {
    current = session
    for (const listener of [...listeners]) listener.onSession(session)
  }

  const auth: InMemoryAuth = {
    resetRequests: [],
    passwordUpdates: [],
    signOuts: 0,

    getSession: () => current,
    onAuthChange(onSession, onRecovery) {
      const listener = { onSession, onRecovery }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    async signIn(email, password) {
      check('signIn')
      const account = accounts.get(email)
      if (!account || account.password !== password) {
        throw new Error('Invalid login credentials')
      }
      emit(account.session)
      return account.session
    },
    async signUp(email, password) {
      check('signUp')
      if (accounts.has(email)) throw new Error('User already registered')
      const session = auth.addAccount(email, password)
      emit(session)
      return session
    },
    async requestPasswordReset(email) {
      check('requestPasswordReset')
      auth.resetRequests.push(email)
    },
    async updatePassword(password) {
      check('updatePassword')
      auth.passwordUpdates.push(password)
    },
    // As the Supabase adapter: a failed global sign-out falls back to the
    // local scope (session removed, SIGNED_OUT reported) and still rejects;
    // if that fails too, the session is kept and nothing is reported.
    async signOut() {
      auth.signOuts += 1
      const failure = faults.get('signOut')
      if (!failure) {
        emit(null)
        return
      }
      if (!faults.has('signOutLocal')) emit(null)
      throw failure
    },

    addAccount(email, password, session = makeSession(email, email)) {
      accounts.set(email, { password, session })
      return session
    },
    emit,
    recover(session) {
      emit(session)
      for (const listener of [...listeners]) listener.onRecovery?.()
    },
    failOn(op, error = new Error(`${op} failed`)) {
      faults.set(op, error)
    },
    heal() {
      faults.clear()
    },
  }
  return auth
}

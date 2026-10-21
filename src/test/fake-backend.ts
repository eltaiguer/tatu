// The whole backend of the App suites, in memory: Supabase Auth (the auth
// port's in-memory adapter) plus every user's stored data (one in-memory
// repository per user id). Pass `auth` and `createRepository` to <App />;
// arrange with `seed` / `repo(...)` and assert on what the repositories hold.
import type { AuthSession } from '../services/auth/auth-port'
import {
  createInMemoryAuth,
  type InMemoryAuth,
} from '../services/auth/in-memory-auth'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../services/repository/in-memory-repository'

type Seed = Omit<
  NonNullable<Parameters<typeof createInMemoryRepository>[0]>,
  'userId'
>

export interface FakeBackend {
  auth: InMemoryAuth
  /** What `userId` has stored (an empty account until seeded). */
  repo(userId?: string): InMemoryRepository
  /**
   * Adds to what `userId` has stored (each key replaces that kind of data).
   * Call before the user's workspace loads: it builds a fresh repository.
   */
  seed(seed: Seed, userId?: string): InMemoryRepository
  createRepository: (session: AuthSession) => InMemoryRepository
}

export function createFakeBackend(
  options: { session?: AuthSession | null } = {}
): FakeBackend {
  const repos = new Map<string, InMemoryRepository>()
  const seeds = new Map<string, Seed>()
  const backend: FakeBackend = {
    auth: createInMemoryAuth({ session: options.session ?? null }),
    repo(userId = 'user-1') {
      if (!repos.has(userId)) {
        repos.set(userId, createInMemoryRepository({ userId }))
      }
      return repos.get(userId)!
    },
    seed(seed, userId = 'user-1') {
      const merged = { ...seeds.get(userId), ...seed }
      seeds.set(userId, merged)
      const repo = createInMemoryRepository({ ...merged, userId })
      repos.set(userId, repo)
      return repo
    },
    createRepository: (session) => backend.repo(session.user.id),
  }
  return backend
}

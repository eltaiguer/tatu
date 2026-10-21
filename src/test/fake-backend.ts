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
   * Only before anything used that user's repository (`repo`,
   * `createRepository`): it builds a fresh one, so it throws rather than
   * leave App or the test holding a stale instance.
   */
  seed(seed: Seed, userId?: string): InMemoryRepository
  /** A new view per call onto `userId`'s repository. */
  createRepository: (userId: string) => InMemoryRepository
}

export function createFakeBackend(
  options: { session?: AuthSession | null } = {}
): FakeBackend {
  const repos = new Map<string, InMemoryRepository>()
  const seeds = new Map<string, Seed>()
  const inUse = new Set<string>()
  const backend: FakeBackend = {
    auth: createInMemoryAuth({ session: options.session ?? null }),
    repo(userId = 'user-1') {
      inUse.add(userId)
      if (!repos.has(userId)) {
        repos.set(userId, createInMemoryRepository({ userId }))
      }
      return repos.get(userId)!
    },
    seed(seed, userId = 'user-1') {
      if (inUse.has(userId)) {
        throw new Error(
          `${userId}'s repository is already in use: seed before using it`
        )
      }
      const merged = { ...seeds.get(userId), ...seed }
      seeds.set(userId, merged)
      const repo = createInMemoryRepository({ ...merged, userId })
      repos.set(userId, repo)
      return repo
    },
    // A new object per call, as the Supabase adapter builds one per call: a
    // caller that rebuilds it needlessly, or keys anything on its identity,
    // is caught. It reads and writes the user's one store.
    createRepository: (userId) =>
      Object.create(backend.repo(userId)) as InMemoryRepository,
  }
  return backend
}

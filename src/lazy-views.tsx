import { lazy, type ComponentType } from 'react'

// The five views load as separate chunks so the login screen doesn't download
// charts, the transactions table and the dev panels (#62). Each loader is
// memoized and shared by `lazy()` and `preloadViews()`, so a prefetch and a
// render never fetch the same chunk twice.
// A failed load is forgotten, so the next attempt fetches again.
function memoizedLoader<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = null
      throw error
    })
    return pending
  }
}

const loadDashboard = memoizedLoader(() => import('./components/Dashboard'))
const loadTransactions = memoizedLoader(
  () => import('./components/Transactions')
)
const loadInsights = memoizedLoader(() => import('./components/Insights'))
const loadCategories = memoizedLoader(() => import('./components/Categories'))
const loadSettings = memoizedLoader(() => import('./components/Settings'))

// React.lazy remembers a failed load and rethrows it on every later render.
// A failed view is swapped for a fresh lazy() only when the error boundary
// resets (`resetFailedViews`) — swapping right in the rejection handler would
// let React's own retry pick up the fresh one and refetch in a loop while the
// chunk is unreachable.
const resetters: Array<() => void> = []

export function retryableLazy<P extends object>(
  load: () => Promise<ComponentType<P>>
): ComponentType<P> {
  let failed = false
  const create = () =>
    lazy(() =>
      load().then(
        (component) => ({ default: component }),
        (error: unknown) => {
          failed = true
          throw error
        }
      )
    )
  let current = create()
  resetters.push(() => {
    if (!failed) return
    failed = false
    current = create()
  })
  return function RetryableView(props: P) {
    // A lazy component takes its target's props; TS can't see that through
    // the generic, hence the cast.
    const View = current as unknown as ComponentType<P>
    return <View {...props} />
  }
}

/** Lets views whose chunk failed to load try again on their next render. */
export function resetFailedViews(): void {
  resetters.forEach((reset) => reset())
}

export const Dashboard = retryableLazy(() =>
  loadDashboard().then((m) => m.Dashboard)
)
export const Transactions = retryableLazy(() =>
  loadTransactions().then((m) => m.Transactions)
)
export const Insights = retryableLazy(() =>
  loadInsights().then((m) => m.Insights)
)
export const Categories = retryableLazy(() =>
  loadCategories().then((m) => m.Categories)
)
export const Settings = retryableLazy(() =>
  loadSettings().then((m) => m.Settings)
)

/** Fetches every view chunk; resolves once all of them are loaded. */
export async function preloadViews(): Promise<void> {
  await Promise.all([
    loadDashboard(),
    loadTransactions(),
    loadInsights(),
    loadCategories(),
    loadSettings(),
  ])
}

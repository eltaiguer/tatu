import { lazy } from 'react'

// The five views load as separate chunks so the login screen doesn't download
// charts, the transactions table and the dev panels (#62). Each loader is
// memoized and shared by `lazy()` and `preloadViews()`, so a prefetch and a
// render never fetch the same chunk twice. A failed load is forgotten, so a
// later attempt retries instead of replaying the rejection.
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

export const Dashboard = lazy(() =>
  loadDashboard().then((m) => ({ default: m.Dashboard }))
)
export const Transactions = lazy(() =>
  loadTransactions().then((m) => ({ default: m.Transactions }))
)
export const Insights = lazy(() =>
  loadInsights().then((m) => ({ default: m.Insights }))
)
export const Categories = lazy(() =>
  loadCategories().then((m) => ({ default: m.Categories }))
)
export const Settings = lazy(() =>
  loadSettings().then((m) => ({ default: m.Settings }))
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

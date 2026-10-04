import type { FutureConfig } from 'react-router-dom'

// Opt in to React Router's v7 behavior now. Shared by the app's BrowserRouter
// and the test MemoryRouters so tests run the same router semantics as prod.
export const ROUTER_FUTURE: Partial<FutureConfig> = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
}

import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

interface LayoutProps {
  title: string
  subtitle?: string
  children: ReactNode
}

const NAV_ITEMS = [
  { label: 'Import', path: '/' },
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Transactions', path: '/transactions' },
  { label: 'Insights', path: '/insights' },
]

export function Layout({ title, subtitle, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur">
        <div className="container mx-auto max-w-7xl px-4 py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {title}
              </h1>
              {subtitle ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {subtitle}
                </p>
              ) : null}
            </div>
            <nav className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="inline-flex items-center rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 md:hidden"
              >
                Menu
              </button>
              <div
                className="hidden md:flex items-center gap-2 text-sm"
                data-testid="layout-desktop-nav"
              >
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      `rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                        isActive
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  )
}

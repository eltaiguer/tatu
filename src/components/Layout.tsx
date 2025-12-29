import { useEffect, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { Logo } from './Logo'

interface LayoutProps {
  subtitle?: string
  children: ReactNode
}

const NAV_ITEMS = [
  { label: 'Import', id: 'import' },
  { label: 'Dashboard', id: 'dashboard' },
  { label: 'Transactions', id: 'transactions' },
  { label: 'Insights', id: 'insights' },
]

export function Layout({ subtitle, children }: LayoutProps) {
  const [activeSection, setActiveSection] = useState('import')

  useEffect(() => {
    const updateFromHash = () => {
      if (typeof window === 'undefined') {
        return
      }
      const hash = window.location.hash.replace('#', '')
      if (hash) {
        setActiveSection(hash)
      }
    }

    updateFromHash()
    window.addEventListener('hashchange', updateFromHash)
    return () => window.removeEventListener('hashchange', updateFromHash)
  }, [])

  const handleNavigate =
    (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()

    if (typeof window === 'undefined') {
      return
    }

    const target = document.getElementById(id)
    if (target?.scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    window.history.replaceState(null, '', `#${id}`)
    setActiveSection(id)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur">
        <div className="container mx-auto max-w-7xl px-4 py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <Logo size="lg" variant="default" />
              {subtitle ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
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
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                      activeSection === item.id
                        ? 'bg-brand-primary text-white'
                        : 'text-gray-600 hover:text-brand-primary dark:text-gray-300 dark:hover:text-white'
                    }`}
                    onClick={handleNavigate(item.id)}
                    aria-current={activeSection === item.id ? 'page' : undefined}
                  >
                    {item.label}
                  </a>
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

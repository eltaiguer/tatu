import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Palette } from 'lucide-react'
import { Navigation } from './Navigation'
import { TatuLogo } from './TatuLogo'
import { ThemeToggle } from './ThemeToggle'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 backdrop-blur-sm">
        <div className="mx-auto max-w-[1400px] px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <TatuLogo />
            <Navigation className="hidden md:flex" />
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link
                to="/design-system"
                className="hidden lg:inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/30 px-3 py-1.5 text-sm font-medium text-neutral-900 dark:text-neutral-50 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <Palette className="h-4 w-4" />
                Design System
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}

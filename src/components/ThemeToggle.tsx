import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-pressed={theme === 'dark'}
    >
      {theme === 'light' ? (
        <Moon className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
      ) : (
        <Sun className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
      )}
    </button>
  )
}

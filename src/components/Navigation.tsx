import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/' },
  { label: 'Transacciones', path: '/transactions' },
  { label: 'Insights', path: '/insights' },
  { label: 'Herramientas', path: '/tools' },
  { label: 'Importar', path: '/import' },
]

interface NavigationProps {
  className?: string
}

export function Navigation({ className }: NavigationProps) {
  return (
    <nav
      className={`items-center gap-1 text-base font-medium ${className ?? ''}`.trim()}
      aria-label="Main"
    >
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            `rounded-xl px-4 py-2 transition-colors ${
              isActive
                ? 'bg-primary-600 text-white dark:bg-primary-400 dark:text-neutral-900'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

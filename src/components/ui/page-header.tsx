import type { ReactNode } from 'react'
import { cn } from './utils'

// The one page-title treatment for every view: display font at the page
// size, a muted subtitle, optional extra content under it (e.g. a filter
// chip) and actions on the right that wrap below on narrow screens. No
// outer margin — the view's own layout spaces it.
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  children,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-6 gap-y-3',
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="m-0 flex items-center gap-2.5 font-display text-page leading-tight font-semibold tracking-[-0.02em]">
          {icon}
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-body text-muted-foreground">{subtitle}</p>
        )}
        {children}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
      )}
    </header>
  )
}

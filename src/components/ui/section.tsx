import { useId, type ReactNode } from 'react'
import { cn } from './utils'

// A titled part of a page: a display-font h2 above its content, as a named
// region, so the outline runs page h1 → section h2 and a screen reader can
// jump between sections. `aside` sits on the heading's baseline (e.g. the
// period a section's numbers cover). Spacing between sections is the page's
// job (space-y), not the section's.
export function Section({
  title,
  aside,
  size = 'subhead',
  children,
  className,
}: {
  title: string
  aside?: ReactNode
  // Gestión pages stack several sections (subhead); Resumen has three big
  // questions (heading-lg).
  size?: 'subhead' | 'heading-lg'
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          id={id}
          className={cn(
            'm-0 font-display leading-tight font-semibold tracking-[-0.01em]',
            size === 'heading-lg' ? 'text-heading-lg' : 'text-subhead'
          )}
        >
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

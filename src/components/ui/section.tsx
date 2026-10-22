import { useId, type ReactNode } from 'react'
import { cn } from './utils'

// A titled part of a Gestión page (Configuración, Categorías): a
// display-font h2 above its content, as a named region, so the outline runs
// page h1 → section h2 and a screen reader can jump between sections.
// Smaller than Resumen's section headings — these pages stack several.
export function Section({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('mb-8', className)}>
      <h2
        id={id}
        className="m-0 mb-3 font-display text-subhead leading-tight font-semibold tracking-[-0.01em]"
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

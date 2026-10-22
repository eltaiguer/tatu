import { useId, type ReactNode } from 'react'

// One of Resumen's questions: a display-font heading with the period its
// numbers cover, then the cards that answer it. A named region, so a screen
// reader can jump between the three.
export function ResumenSection({
  title,
  period,
  children,
}: {
  title: string
  period?: string | null
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          id={id}
          className="m-0 font-display text-heading-lg leading-tight font-semibold tracking-[-0.01em]"
        >
          {title}
        </h2>
        {period && (
          <span className="text-small text-[var(--text-faint)]">{period}</span>
        )}
      </div>
      {children}
    </section>
  )
}

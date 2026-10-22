import type { ReactNode } from 'react'
import { Section } from '../ui/section'

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
  return (
    <Section
      title={title}
      size="heading-lg"
      className="space-y-4"
      aside={
        period && (
          <span className="text-small text-[var(--text-faint)]">{period}</span>
        )
      }
    >
      {children}
    </Section>
  )
}

import type { ReactNode } from 'react'

// Wraps a number so it opens the transactions behind it. A real button
// (keyboard + screen reader), visually the content itself; a plain block
// when there is nowhere to navigate.

export function DrillTarget({
  onOpen,
  label,
  children,
  className = '',
}: {
  onOpen?: () => void
  label: string
  children: ReactNode
  className?: string
}) {
  if (!onOpen) return <div className={className}>{children}</div>
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      className={`block w-full rounded-md text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      {children}
    </button>
  )
}

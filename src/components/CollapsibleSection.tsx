import type { ReactNode } from 'react'

interface CollapsibleSectionProps {
  id: string
  title: string
  subtitle?: string
  isOpen: boolean
  onToggle?: (nextOpen: boolean) => void
  children: ReactNode
}

export function CollapsibleSection({
  id,
  title,
  subtitle,
  isOpen,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  const contentId = `${id}-content`

  return (
    <section
      id={id}
      className="rounded-2xl border border-gray-200/70 dark:border-gray-700/70 bg-white dark:bg-gray-900 shadow-sm"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
        aria-expanded={isOpen}
        aria-controls={contentId}
        aria-label={title}
        onClick={() => onToggle?.(!isOpen)}
      >
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gray-400 dark:text-gray-500">
            Section
          </p>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          ) : null}
        </div>
        <span
          className={`text-sm font-semibold text-gray-500 dark:text-gray-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {isOpen ? (
        <div id={contentId} className="border-t border-gray-200/70 dark:border-gray-700/70 px-6 py-6">
          {children}
        </div>
      ) : null}
    </section>
  )
}

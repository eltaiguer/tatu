import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type Tone = 'default' | 'success' | 'error' | 'neutral'

interface EmptyStateProps {
  icon: LucideIcon
  tone?: Tone
  title: string
  description?: ReactNode
  action?: ReactNode
  secondary?: ReactNode
  compact?: boolean
}

const toneClasses: Record<Tone, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-success-100 text-success-600 dark:bg-success-900/20',
  error: 'bg-destructive/10 text-destructive',
  neutral: 'bg-muted text-muted-foreground',
}

/**
 * Reusable empty / zero-data state.
 * Pass any lucide icon component, e.g. <EmptyState icon={Search} ... />
 */
export function EmptyState({
  icon: Icon,
  tone = 'default',
  title,
  description,
  action,
  secondary,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center text-center ${
        compact ? 'px-7 py-10' : 'px-8 py-16'
      }`}
    >
      <span
        className={`relative grid h-[62px] w-[62px] place-items-center rounded-[18px] ${toneClasses[tone]}`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-[-8px] rounded-[24px] border border-dashed border-current opacity-30"
        />
        <Icon size={27} strokeWidth={1.7} />
      </span>
      <h3
        className={`font-display font-semibold tracking-tight mt-5 ${
          compact ? 'text-[17px]' : 'text-[20px]'
        }`}
      >
        {title}
      </h3>
      {description && (
        <p className="text-muted-foreground text-sm mt-2 leading-relaxed text-pretty max-w-[360px]">
          {description}
        </p>
      )}
      {(action || secondary) && (
        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
          {action}
          {secondary}
        </div>
      )}
    </div>
  )
}

import type { ReactNode } from 'react'
import { cn } from './utils'

export interface RadioOption<T extends string> {
  value: T
  label: ReactNode
  // Shown under the option while it is selected.
  hint?: ReactNode
}

// A labelled group of native radios (fieldset + legend): native keyboard
// behaviour and screen-reader semantics, system rendering in forced-colors
// mode. `list` stacks plain radios tinted with the brand; `segmented` draws
// the same radios as a joined control (inputs visually hidden, labels
// styled from their checked state).
export function RadioGroup<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
  variant = 'list',
  className,
}: {
  legend: ReactNode
  name: string
  value: T
  onChange: (value: T) => void
  options: RadioOption<T>[]
  variant?: 'list' | 'segmented'
  className?: string
}) {
  if (variant === 'segmented') {
    return (
      <fieldset className={cn('min-w-0', className)}>
        <legend className="mb-1.5 text-label font-medium text-muted-foreground">
          {legend}
        </legend>
        <div className="flex h-10 overflow-hidden rounded-[var(--radius-sm)] border border-border">
          {options.map((option, i) => (
            <label
              key={option.value}
              className={cn(
                'relative flex cursor-pointer items-center whitespace-nowrap',
                i > 0 && 'border-l border-border'
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <span className="flex h-full items-center bg-[var(--surface)] px-3 text-small text-[var(--text)] peer-checked:bg-[var(--brand)] peer-checked:font-semibold peer-checked:text-[var(--primary-foreground)] peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-inset forced-colors:peer-checked:underline">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    )
  }

  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="text-small font-medium">{legend}</legend>
      <div className="mt-2 space-y-2">
        {options.map((option) => (
          <div key={option.value}>
            <label className="flex items-center gap-2 text-small">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="size-4 accent-[var(--brand)]"
              />
              {option.label}
            </label>
            {option.hint && value === option.value && (
              <p className="pl-6 text-label text-muted-foreground">
                {option.hint}
              </p>
            )}
          </div>
        ))}
      </div>
    </fieldset>
  )
}

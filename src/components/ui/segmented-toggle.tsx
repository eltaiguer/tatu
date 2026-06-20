import { useRef } from 'react'

interface SegmentedToggleProps<T extends string> {
  options: ReadonlyArray<{ label: string; value: T }>
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  'aria-label'?: string
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  'aria-label': ariaLabel,
}: SegmentedToggleProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    const count = options.length
    let next = index
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = (index + 1) % count
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = (index - 1 + count) % count
    } else {
      return
    }
    e.preventDefault()
    onChange(options[next].value)
    const buttons = containerRef.current?.querySelectorAll('button')
    buttons?.[next]?.focus()
  }

  const padding = size === 'sm' ? '4px 10px' : '6px 14px'
  const fontSize = size === 'sm' ? 12 : 13

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        background: 'var(--surface-2)',
        borderRadius: 'var(--radius-sm)',
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((opt, index) => {
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-pressed={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            style={{
              padding,
              borderRadius: 7,
              border: 'none',
              cursor: 'pointer',
              fontSize,
              fontWeight: isActive ? 600 : 500,
              background: isActive ? 'var(--surface)' : 'transparent',
              color: isActive ? 'var(--text)' : 'var(--text-faint)',
              boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

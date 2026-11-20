import { useEffect, useRef, useState } from 'react'

interface FxChipProps {
  fxRate: number
  onSetFxRate?: (r: number) => void
}

// The draft as a rate, or null when it isn't one: digits with an optional
// decimal part (comma or point). Not bare `Number`/`parseFloat`, which read
// "41abc" as 41 or "0x29", "1e3" and ".5" as numbers nobody typed as a rate.
function parseRate(draft: string): number | null {
  const text = draft.trim()
  if (!/^\d+([.,]\d+)?$/.test(text)) return null
  const n = Number(text.replace(',', '.'))
  return n > 0 ? n : null
}

// The rate as quiet text: "1 US$ = $U 40,50 (manual) · cambiar". Without a
// setter it is plain text. "Manual" is visible, not a tooltip: the rate is the
// user's, not a live quote.
export function FxChip({ fxRate, onSetFxRate }: FxChipProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Set by Enter / Escape so the button gets focus back. A blur commit does
  // not: the user moved focus elsewhere on purpose.
  const refocus = useRef(false)
  // Escape cancels: the blur its unmount may cause must not save.
  const cancelled = useRef(false)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false
      buttonRef.current?.focus()
    }
  }, [editing])

  const amount = fxRate.toLocaleString('es-UY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const number = <span className="font-mono tabular-nums">{amount}</span>

  if (!onSetFxRate) {
    return <span>1 US$ = $U {number} (manual)</span>
  }

  if (editing) {
    // Saves a valid, changed draft; says whether the draft was a rate.
    const commit = (): boolean => {
      const n = parseRate(draft)
      if (n === null) return false
      if (n !== fxRate) onSetFxRate(n)
      return true
    }
    return (
      <span className="inline-flex items-center gap-[4px]">
        1 US$ = $U{' '}
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setInvalid(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              // A bad draft stays open and flagged, not closed as if saved.
              if (!commit()) {
                setInvalid(true)
                return
              }
              refocus.current = true
              setEditing(false)
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              cancelled.current = true
              refocus.current = true
              setEditing(false)
            }
          }}
          onBlur={() => {
            if (!cancelled.current) commit()
            setEditing(false)
          }}
          aria-label="Tipo de cambio"
          aria-invalid={invalid || undefined}
          inputMode="decimal"
          autoFocus
          className="w-[56px] rounded-[4px] border border-[var(--border)] bg-[var(--surface)] px-[5px] py-[1px] text-small text-[var(--text)] outline-none"
        />
      </span>
    )
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        setDraft(String(fxRate).replace('.', ','))
        cancelled.current = false
        setInvalid(false)
        setEditing(true)
      }}
      className="group cursor-pointer rounded-sm border-none bg-transparent bg-none p-0 text-left text-small font-normal text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      1 US$ = $U {number}{' '}
      <span className="text-[var(--text-faint)]">(manual)</span> <span>·</span>{' '}
      <span className="text-[var(--text)] underline-offset-2 group-hover:underline">
        cambiar
      </span>
    </button>
  )
}

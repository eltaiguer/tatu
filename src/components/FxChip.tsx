import { useEffect, useRef, useState } from 'react'

interface FxChipProps {
  fxRate: number
  onSetFxRate?: (r: number) => void
}

// The draft as a rate, or null when it isn't one. `Number`, not `parseFloat`:
// "41abc" and "1.234,5" must not save a prefix. Accepts a decimal comma.
function parseRate(draft: string): number | null {
  const n = Number(draft.trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
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

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false
      buttonRef.current?.focus()
    }
  }, [editing])

  const label = `1 US$ = $U ${fxRate.toLocaleString('es-UY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

  if (!onSetFxRate) {
    return <span>{`${label} (manual)`}</span>
  }

  if (editing) {
    const commit = () => {
      const n = parseRate(draft)
      if (n !== null) onSetFxRate(n)
    }
    return (
      <span className="inline-flex items-center gap-[4px]">
        1 US$ = $U{' '}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
              refocus.current = true
              setEditing(false)
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              refocus.current = true
              setEditing(false)
            }
          }}
          onBlur={() => {
            commit()
            setEditing(false)
          }}
          aria-label="Tipo de cambio"
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
        setEditing(true)
      }}
      title="Tipo de cambio que ingresaste vos · editar"
      className="group cursor-pointer rounded-sm border-none bg-transparent bg-none p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label} <span className="text-[var(--text-faint)]">(manual)</span>{' '}
      <span>·</span>{' '}
      <span className="text-[var(--text)] group-hover:underline">cambiar</span>
    </button>
  )
}

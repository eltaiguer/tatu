import { useState } from 'react'
import { Pencil } from 'lucide-react'

interface FxChipProps {
  fxRate: number
  onSetFxRate?: (r: number) => void
}

export function FxChip({ fxRate, onSetFxRate }: FxChipProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const label = `1 US$ = $U ${fxRate.toFixed(2)}`

  if (!onSetFxRate) {
    return (
      <span className="select-none text-[12px] text-[var(--text-faint)]">
        {label}
      </span>
    )
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-[4px] text-[12px] text-[var(--text-muted)]">
        1 US$ = $U{' '}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const n = parseFloat(draft)
              if (Number.isFinite(n) && n > 0) onSetFxRate(n)
              setEditing(false)
            }
            if (e.key === 'Escape') {
              setEditing(false)
            }
          }}
          onBlur={() => {
            const n = parseFloat(draft)
            if (Number.isFinite(n) && n > 0) onSetFxRate(n)
            setEditing(false)
          }}
          autoFocus
          className="w-[56px] rounded-[4px] border border-[var(--border)] bg-[var(--surface)] px-[5px] py-[1px] text-[12px] text-[var(--text)] outline-none"
        />
      </span>
    )
  }

  return (
    <button
      onClick={() => {
        setDraft(String(fxRate))
        setEditing(true)
      }}
      title="Tipo de cambio que ingresaste vos · editar"
      className="inline-flex cursor-pointer items-center gap-[5px] rounded-[6px] border border-[var(--border)] bg-transparent bg-none px-[8px] py-[3px] text-[12px] leading-[1] text-[var(--text-muted)]"
    >
      {label}
      {/* Visible, not a tooltip: the rate is the user's, not a live quote. */}
      <span className="text-[10px] uppercase tracking-[0.04em] text-[var(--text-faint)]">
        manual
      </span>
      <Pencil size={10} aria-hidden />
    </button>
  )
}

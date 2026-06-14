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
      <span
        style={{ fontSize: 12, color: 'var(--text-faint)', userSelect: 'none' }}
      >
        {label}
      </span>
    )
  }

  if (editing) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
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
          style={{
            width: 56,
            fontSize: 12,
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '1px 5px',
            background: 'var(--surface)',
            color: 'var(--text)',
            outline: 'none',
          }}
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
      title="Editar tipo de cambio"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 12,
        background: 'none',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '3px 8px',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        lineHeight: 1,
      }}
    >
      {label}
      <Pencil size={10} />
    </button>
  )
}

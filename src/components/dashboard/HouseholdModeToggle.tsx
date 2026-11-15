// Resumen's Todo / Hogar switch: every figure below is either all counted
// expenses or only the household ones (ADR-0005). The mode lives in the URL.

import { House } from 'lucide-react'
import { SegmentedToggle } from '../ui/segmented-toggle'

const OPTIONS = [
  { value: 'all' as const, label: 'Todo' },
  { value: 'household' as const, label: 'Hogar' },
]

export function HouseholdModeToggle({
  householdMode,
  onChange,
}: {
  householdMode: boolean
  onChange: (householdMode: boolean) => void
}) {
  return (
    <div className="inline-flex items-center gap-[6px]">
      <House
        size={14}
        aria-hidden="true"
        className="shrink-0 text-[var(--text-muted)]"
      />
      <SegmentedToggle
        options={OPTIONS}
        value={householdMode ? 'household' : 'all'}
        onChange={(next) => onChange(next === 'household')}
        aria-label="Ver gastos"
      />
    </div>
  )
}

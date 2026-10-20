import {
  HIGH_CONFIDENCE,
  LOW_CONFIDENCE,
} from '../services/categorizer/confidence'
interface ConfidenceBadgeProps {
  confidence: number
}

// Literal class names so Tailwind can see them (8px / 11px / 14px bars).
const BAR_HEIGHTS = ['h-[8px]', 'h-[11px]', 'h-[14px]']

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  if (!confidence) return null

  const filled =
    confidence >= HIGH_CONFIDENCE ? 3 : confidence >= LOW_CONFIDENCE ? 2 : 1
  const color =
    confidence >= HIGH_CONFIDENCE
      ? 'var(--pos)'
      : confidence >= LOW_CONFIDENCE
        ? 'var(--accent)'
        : 'var(--neg)'
  const level =
    confidence >= HIGH_CONFIDENCE
      ? 'alta'
      : confidence >= LOW_CONFIDENCE
        ? 'media'
        : 'baja'

  return (
    <span
      title={`Confianza ${level} · ${Math.round(confidence * 100)}%`}
      className="inline-flex items-end gap-[2px]"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-[4px] rounded-[2px] ${BAR_HEIGHTS[i]}`}
          style={{ background: filled > i ? color : 'var(--surface-3)' }}
        />
      ))}
    </span>
  )
}

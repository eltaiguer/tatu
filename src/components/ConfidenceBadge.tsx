interface ConfidenceBadgeProps {
  confidence: number
}

// Literal class names so Tailwind can see them (8px / 11px / 14px bars).
const BAR_HEIGHTS = ['h-[8px]', 'h-[11px]', 'h-[14px]']

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  if (!confidence) return null

  const filled = confidence >= 0.8 ? 3 : confidence >= 0.55 ? 2 : 1
  const color =
    confidence >= 0.8
      ? 'var(--pos)'
      : confidence >= 0.55
        ? 'var(--accent)'
        : 'var(--neg)'
  const level =
    confidence >= 0.8 ? 'alta' : confidence >= 0.55 ? 'media' : 'baja'

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

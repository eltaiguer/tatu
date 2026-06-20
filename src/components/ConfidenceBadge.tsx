interface ConfidenceBadgeProps {
  confidence: number
}

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
      style={{ display: 'inline-flex', gap: 2, alignItems: 'flex-end' }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: [8, 11, 14][i],
            borderRadius: 2,
            background: filled > i ? color : 'var(--surface-3)',
          }}
        />
      ))}
    </span>
  )
}

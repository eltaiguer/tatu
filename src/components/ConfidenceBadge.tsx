// Confidence indicator for auto-categorization

interface ConfidenceBadgeProps {
  confidence: number
  manualOverride?: boolean
}

export function ConfidenceBadge({
  confidence,
  manualOverride,
}: ConfidenceBadgeProps) {
  if (manualOverride) {
    return null
  }

  if (confidence === 0) return null

  const getColor = (conf: number) => {
    if (conf >= 0.9) return 'bg-success-600'
    if (conf >= 0.7) return 'bg-primary-600'
    return 'bg-warning-500'
  }

  const getLabel = (conf: number) => {
    if (conf >= 0.9) return 'Confianza alta'
    if (conf >= 0.7) return 'Confianza media'
    return 'Confianza baja'
  }

  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${getColor(confidence)} shrink-0`}
      title={`${getLabel(confidence)} (${Math.round(confidence * 100)}%)`}
    />
  )
}

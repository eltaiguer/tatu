// Confidence indicator for auto-categorization

interface ConfidenceBadgeProps {
  confidence: number;
  manualOverride?: boolean;
}

export function ConfidenceBadge({ confidence, manualOverride }: ConfidenceBadgeProps) {
  if (manualOverride) {
    return (
      <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-muted/50">
        Manual
      </span>
    );
  }

  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.9) return 'text-success-600 bg-success-50 dark:bg-success-900/20';
    if (conf >= 0.7) return 'text-primary-600 bg-primary-50 dark:bg-primary-900/20';
    return 'text-warning-600 bg-warning-50 dark:bg-warning-900/20';
  };

  const getConfidenceLabel = (conf: number) => {
    if (conf >= 0.9) return 'Alta';
    if (conf >= 0.7) return 'Media';
    return 'Baja';
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-md ${getConfidenceColor(confidence)}`}>
      {getConfidenceLabel(confidence)}
    </span>
  );
}

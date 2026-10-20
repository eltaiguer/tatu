/**
 * The confidence bands every automatic category is read in. The categorizer
 * sources produce the numbers (docs/architecture.md, precedence table);
 * these two thresholds are how the app reads them, in one place.
 */

/** From here up a category is "alta": the meter's three bars. */
export const HIGH_CONFIDENCE = 0.8

/** Below this a categorized row is still flagged for review ("baja"). */
export const LOW_CONFIDENCE = 0.55

/**
 * A row's confidence for comparisons: none for an uncategorized row; a
 * categorized row without a recorded confidence (stored before confidence
 * was tracked) counts as just inside the trusted band, as the review flag
 * already treats it.
 */
export function effectiveConfidence(row: {
  category?: string | null
  categoryConfidence?: number | null
}): number {
  if (!row.category) return 0
  return typeof row.categoryConfidence === 'number'
    ? row.categoryConfidence
    : LOW_CONFIDENCE
}

import { describe, expect, it } from 'vitest'

// Guards the TZ pin in vite.config.ts: if it were silently ignored, the date
// tests would run in whatever zone the machine happens to be in.
// getTimezoneOffset() is minutes BEHIND UTC (positive west of Greenwich).
const EXPECTED_OFFSETS: Record<string, number[]> = {
  'America/Montevideo': [180],
  'Europe/Madrid': [-60, -120],
  'America/Los_Angeles': [420, 480],
}

describe('test time zone', () => {
  const expected = process.env.TATU_TEST_TZ ?? 'America/Montevideo'

  it('runs in the pinned zone', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(expected)
  })

  it('applies the zone to local Date arithmetic', () => {
    expect(EXPECTED_OFFSETS[expected]).toContain(
      new Date(2026, 2, 1).getTimezoneOffset()
    )
  })
})

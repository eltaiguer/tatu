import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A palette-step colour class (bg-success-100, text-primary-600…) only paints
// when theme.css maps it to a Tailwind colour (--color-success-100). The raw
// scales (--success-100) are not mapped, so such a class silently renders
// nothing, and Tailwind's own palettes (red-100) ignore dark mode. Use the
// theme tokens instead (bg-pos-soft, text-pos, bg-neg-soft, bg-brand-soft…).
const CHECKED = ['components/ImportCSV.tsx']

const SCALE_CLASS =
  /\b(?:bg|text|border|ring|fill|stroke|from|to)-([a-z]+(?:-[a-z]+)*-\d{2,3})\b/g

describe('theme colours', () => {
  const theme = readFileSync(join(__dirname, '../styles/theme.css'), 'utf8')

  it.each(CHECKED)('%s only uses colour classes the theme defines', (file) => {
    const source = readFileSync(join(__dirname, '..', file), 'utf8')
    const unmapped = [...source.matchAll(SCALE_CLASS)]
      .map((match) => match[1])
      .filter((color) => !theme.includes(`--color-${color}:`))
    expect(unmapped).toEqual([])
  })
})

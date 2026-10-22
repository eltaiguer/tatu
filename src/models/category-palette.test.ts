import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATEGORY_COLORS, Category } from './category'
import { DEFAULT_CATEGORY_COLOR } from '../services/categories/category-store'

// Rows that don't count as spend by default (ignored or income): they never
// share the donut with each other's neighbours, so they get a looser bar.
const NON_SPEND = new Set<Category>([
  Category.Income,
  Category.InternalTransfer,
  Category.ExternalTransfer,
])
const ALL = Object.values(Category)
// Everything that can share the donut and the ranked lists, Sin categoría too.
const SPEND = ALL.filter((c) => !NON_SPEND.has(c))

// The canvases a category colour sits on, read from theme.css so the check
// follows the theme: --bg and --surface, light (:root) and dark (.dark).
function themeCanvases(): Record<string, string> {
  const css = readFileSync(join(__dirname, '../styles/theme.css'), 'utf8')
  const block = (selector: string) => {
    const start = css.indexOf(`${selector} {`)
    return css.slice(start, css.indexOf('\n}', start))
  }
  const token = (text: string, name: string) => {
    const m = text.match(
      new RegExp(`--${name}: oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`)
    )
    if (!m) throw new Error(`theme.css: no oklch --${name}`)
    return oklchToHex(Number(m[1]), Number(m[2]), Number(m[3]))
  }
  const light = block(':root')
  const dark = block('.dark')
  return {
    'light --bg': token(light, 'bg'),
    'light --surface': token(light, 'surface'),
    'dark --bg': token(dark, 'bg'),
    'dark --surface': token(dark, 'surface'),
  }
}

function oklchToHex(L: number, C: number, h: number): string {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return (
    '#' +
    lin
      .map((x) => {
        const c = Math.min(1, Math.max(0, x))
        const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
        return Math.round(v * 255)
          .toString(16)
          .padStart(2, '0')
      })
      .join('')
  )
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
}

function linear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(linear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Perceptual distance in OKLab, scaled ×100 (≈ ΔE; under ~5 reads as "the
// same colour" in a small chart slice).
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(linear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function distance(a: string, b: string): number {
  const [x, y] = [oklab(a), oklab(b)]
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

function closePairs(categories: Category[], min: number): string[] {
  const close: string[] = []
  categories.forEach((a, i) => {
    for (const b of categories.slice(i + 1)) {
      const d = distance(CATEGORY_COLORS[a], CATEGORY_COLORS[b])
      if (d < min) close.push(`${a}/${b} ${d.toFixed(1)}`)
    }
  })
  return close
}

describe('category palette', () => {
  it('is 6-digit hex (icon tiles append an alpha byte, the colour picker and the schema need hex)', () => {
    for (const color of Object.values(CATEGORY_COLORS)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect(DEFAULT_CATEGORY_COLOR).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('keeps every category that can share the donut distinguishable', () => {
    expect(closePairs(SPEND, 6.5)).toEqual([])
  })

  it('keeps every category, ignored ones included, apart from every other', () => {
    expect(closePairs(ALL, 5)).toEqual([])
  })

  it('reaches 3:1 on the light and dark canvas and card surface', () => {
    const weak: string[] = []
    for (const [category, color] of Object.entries(CATEGORY_COLORS)) {
      for (const [canvas, bg] of Object.entries(themeCanvases())) {
        const ratio = contrast(color, bg)
        if (ratio < 3) weak.push(`${category} on ${canvas} ${ratio.toFixed(2)}`)
      }
    }
    expect(weak).toEqual([])
  })
})

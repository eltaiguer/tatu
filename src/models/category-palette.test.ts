import { describe, expect, it } from 'vitest'
import { CATEGORY_COLORS, Category } from './category'
import { DEFAULT_CATEGORY_COLOR } from '../services/categories/category-store'

// The canvases from theme.css (--bg light / dark), as sRGB hex.
const BG_LIGHT = '#fcf9f5'
const BG_DARK = '#100d0a'

// Categories a user spends in: the ones that share the donut and the ranked
// lists, so they must be told apart from each other.
const SPEND_CATEGORIES = [
  Category.Groceries,
  Category.Restaurants,
  Category.Transport,
  Category.Utilities,
  Category.Healthcare,
  Category.Shopping,
  Category.Entertainment,
  Category.Software,
  Category.Education,
  Category.Automotive,
  Category.Housing,
  Category.Personal,
  Category.Insurance,
  Category.Fees,
]

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

describe('category palette', () => {
  it('is 6-digit hex (icon tiles append an alpha byte, the colour picker and the schema need hex)', () => {
    for (const color of Object.values(CATEGORY_COLORS)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect(DEFAULT_CATEGORY_COLOR).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('keeps every spend category distinguishable from every other', () => {
    const tooClose: string[] = []
    SPEND_CATEGORIES.forEach((a, i) => {
      for (const b of SPEND_CATEGORIES.slice(i + 1)) {
        const d = distance(CATEGORY_COLORS[a], CATEGORY_COLORS[b])
        if (d < 6.5) tooClose.push(`${a}/${b} ${d.toFixed(1)}`)
      }
    })
    expect(tooClose).toEqual([])
  })

  it('reaches 3:1 against both the light and the dark canvas', () => {
    const weak: string[] = []
    for (const [category, color] of Object.entries(CATEGORY_COLORS)) {
      for (const bg of [BG_LIGHT, BG_DARK]) {
        const ratio = contrast(color, bg)
        if (ratio < 3) weak.push(`${category} on ${bg} ${ratio.toFixed(2)}`)
      }
    }
    expect(weak).toEqual([])
  })

  it('draws income in the same green as income amounts (--pos)', () => {
    // --pos: oklch(0.53 0.12 153)
    expect(CATEGORY_COLORS[Category.Income]).toBe('#237f49')
  })
})

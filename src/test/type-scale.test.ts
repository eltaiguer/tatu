import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Keeps sizes on the type scale (theme.css): no half-pixel sizes, inline or
// as arbitrary Tailwind classes. Use the text-<token> classes instead.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

describe('type scale', () => {
  it('has no half-pixel font sizes in components', () => {
    const offenders = sourceFiles(join(__dirname, '..')).flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      return /fontSize: ?\d+\.5\b|text-\[\d+\.5px\]/.test(text) ? [file] : []
    })
    expect(offenders).toEqual([])
  })
})

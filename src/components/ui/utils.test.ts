import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn with the type scale', () => {
  it('keeps a colour next to a scale size', () => {
    expect(cn('text-primary-foreground', 'text-label')).toBe(
      'text-primary-foreground text-label'
    )
    expect(cn('text-muted-foreground text-page')).toBe(
      'text-muted-foreground text-page'
    )
  })

  it('lets a scale size override another size', () => {
    expect(cn('text-sm text-label')).toBe('text-label')
    expect(cn('text-caption', 'text-body')).toBe('text-body')
  })
})

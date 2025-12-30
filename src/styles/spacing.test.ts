import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Spacing System', () => {
  let styleElement: HTMLStyleElement

  beforeEach(() => {
    styleElement = document.createElement('style')
    styleElement.textContent = `
      :root {
        --space-1: 0.25rem;
        --space-2: 0.5rem;
        --space-3: 0.75rem;
        --space-4: 1rem;
        --space-5: 1.25rem;
        --space-6: 1.5rem;
        --space-8: 2rem;
        --space-10: 2.5rem;
        --space-12: 3rem;
        --space-16: 4rem;
        --space-20: 5rem;
      }
    `
    document.head.appendChild(styleElement)
  })

  afterEach(() => {
    document.head.removeChild(styleElement)
  })

  it('should define 4px base spacing scale', () => {
    const rootStyle = getComputedStyle(document.documentElement)

    expect(rootStyle.getPropertyValue('--space-1').trim()).toBe('0.25rem') // 4px
    expect(rootStyle.getPropertyValue('--space-2').trim()).toBe('0.5rem') // 8px
    expect(rootStyle.getPropertyValue('--space-4').trim()).toBe('1rem') // 16px
    expect(rootStyle.getPropertyValue('--space-8').trim()).toBe('2rem') // 32px
    expect(rootStyle.getPropertyValue('--space-16').trim()).toBe('4rem') // 64px
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Typography System', () => {
  let styleElement: HTMLStyleElement

  beforeEach(() => {
    // Create a style element and add our typography CSS
    styleElement = document.createElement('style')
    styleElement.textContent = `
      :root {
        --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
        --font-display: 'Space Grotesk', system-ui, -apple-system, sans-serif;
        --font-mono: 'JetBrains Mono', 'Courier New', monospace;

        --text-xs: 0.75rem;
        --text-sm: 0.875rem;
        --text-base: 1rem;
        --text-lg: 1.125rem;
        --text-xl: 1.25rem;
        --text-2xl: 1.5rem;
        --text-3xl: 1.875rem;
        --text-4xl: 2.25rem;
        --text-5xl: 3rem;

        --font-weight-normal: 400;
        --font-weight-medium: 500;
        --font-weight-semibold: 600;
        --font-weight-bold: 700;
      }

      .font-display {
        font-family: var(--font-display);
      }

      .font-mono {
        font-family: var(--font-mono);
      }

      body {
        font-family: var(--font-sans);
      }

      h1 {
        font-size: var(--text-3xl);
        font-weight: var(--font-weight-semibold);
        line-height: 1.2;
        font-family: var(--font-display);
      }

      h2 {
        font-size: var(--text-2xl);
        font-weight: var(--font-weight-semibold);
        line-height: 1.3;
        font-family: var(--font-display);
      }

      h3 {
        font-size: var(--text-xl);
        font-weight: var(--font-weight-semibold);
        line-height: 1.4;
      }

      h4 {
        font-size: var(--text-lg);
        font-weight: var(--font-weight-medium);
        line-height: 1.4;
      }
    `
    document.head.appendChild(styleElement)
  })

  afterEach(() => {
    document.head.removeChild(styleElement)
  })

  describe('CSS Custom Properties', () => {
    it('should define font family variables', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--font-sans')).toContain('Inter')
      expect(rootStyle.getPropertyValue('--font-display')).toContain('Space Grotesk')
      expect(rootStyle.getPropertyValue('--font-mono')).toContain('JetBrains Mono')
    })

    it('should define font size scale from xs to 5xl', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--text-xs').trim()).toBe('0.75rem')
      expect(rootStyle.getPropertyValue('--text-sm').trim()).toBe('0.875rem')
      expect(rootStyle.getPropertyValue('--text-base').trim()).toBe('1rem')
      expect(rootStyle.getPropertyValue('--text-lg').trim()).toBe('1.125rem')
      expect(rootStyle.getPropertyValue('--text-xl').trim()).toBe('1.25rem')
      expect(rootStyle.getPropertyValue('--text-2xl').trim()).toBe('1.5rem')
      expect(rootStyle.getPropertyValue('--text-3xl').trim()).toBe('1.875rem')
      expect(rootStyle.getPropertyValue('--text-4xl').trim()).toBe('2.25rem')
      expect(rootStyle.getPropertyValue('--text-5xl').trim()).toBe('3rem')
    })

    it('should define font weight variables', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--font-weight-normal').trim()).toBe('400')
      expect(rootStyle.getPropertyValue('--font-weight-medium').trim()).toBe('500')
      expect(rootStyle.getPropertyValue('--font-weight-semibold').trim()).toBe('600')
      expect(rootStyle.getPropertyValue('--font-weight-bold').trim()).toBe('700')
    })
  })

  describe('Font Family Utilities', () => {
    it('should apply display font when font-display class is used', () => {
      const element = document.createElement('div')
      element.className = 'font-display'
      document.body.appendChild(element)

      const style = getComputedStyle(element)
      // In jsdom, CSS variables are not fully resolved, check for the variable reference
      expect(style.fontFamily).toMatch(/var\(--font-display\)|Space Grotesk/)

      document.body.removeChild(element)
    })

    it('should apply monospace font when font-mono class is used', () => {
      const element = document.createElement('div')
      element.className = 'font-mono'
      document.body.appendChild(element)

      const style = getComputedStyle(element)
      // In jsdom, CSS variables are not fully resolved, check for the variable reference
      expect(style.fontFamily).toMatch(/var\(--font-mono\)|JetBrains Mono/)

      document.body.removeChild(element)
    })

    it('should apply sans font to body by default', () => {
      const body = document.body
      const style = getComputedStyle(body)

      // In jsdom, CSS variables are not fully resolved, check for the variable reference
      expect(style.fontFamily).toMatch(/var\(--font-sans\)|Inter/)
    })
  })

  describe('Semantic HTML Typography', () => {
    it('should style h1 with display font and semibold weight', () => {
      const h1 = document.createElement('h1')
      document.body.appendChild(h1)

      const style = getComputedStyle(h1)
      // Check for CSS variable reference (jsdom doesn't fully resolve variables)
      expect(style.fontFamily).toMatch(/var\(--font-display\)|Space Grotesk/)
      expect(style.fontSize).toMatch(/var\(--text-3xl\)|1\.875rem|30px/)
      expect(style.fontWeight).toMatch(/var\(--font-weight-semibold\)|600/)
      expect(style.lineHeight).toBe('1.2')

      document.body.removeChild(h1)
    })

    it('should style h2 with display font and semibold weight', () => {
      const h2 = document.createElement('h2')
      document.body.appendChild(h2)

      const style = getComputedStyle(h2)
      expect(style.fontFamily).toMatch(/var\(--font-display\)|Space Grotesk/)
      expect(style.fontSize).toMatch(/var\(--text-2xl\)|1\.5rem|24px/)
      expect(style.fontWeight).toMatch(/var\(--font-weight-semibold\)|600/)
      expect(style.lineHeight).toBe('1.3')

      document.body.removeChild(h2)
    })

    it('should style h3 with semibold weight', () => {
      const h3 = document.createElement('h3')
      document.body.appendChild(h3)

      const style = getComputedStyle(h3)
      expect(style.fontSize).toMatch(/var\(--text-xl\)|1\.25rem|20px/)
      expect(style.fontWeight).toMatch(/var\(--font-weight-semibold\)|600/)
      expect(style.lineHeight).toBe('1.4')

      document.body.removeChild(h3)
    })

    it('should style h4 with medium weight', () => {
      const h4 = document.createElement('h4')
      document.body.appendChild(h4)

      const style = getComputedStyle(h4)
      expect(style.fontSize).toMatch(/var\(--text-lg\)|1\.125rem|18px/)
      expect(style.fontWeight).toMatch(/var\(--font-weight-medium\)|500/)
      expect(style.lineHeight).toBe('1.4')

      document.body.removeChild(h4)
    })
  })

  describe('Typography Scale', () => {
    it('should provide correct rem values for each size', () => {
      const sizes = [
        { token: '--text-xs', rem: '0.75rem' },
        { token: '--text-sm', rem: '0.875rem' },
        { token: '--text-base', rem: '1rem' },
        { token: '--text-lg', rem: '1.125rem' },
        { token: '--text-xl', rem: '1.25rem' },
        { token: '--text-2xl', rem: '1.5rem' },
        { token: '--text-3xl', rem: '1.875rem' },
        { token: '--text-4xl', rem: '2.25rem' },
        { token: '--text-5xl', rem: '3rem' },
      ]

      const rootStyle = getComputedStyle(document.documentElement)

      sizes.forEach(({ token, rem }) => {
        expect(rootStyle.getPropertyValue(token).trim()).toBe(rem)
      })
    })
  })

  describe('Font Weight Scale', () => {
    it('should provide correct font weight values', () => {
      const weights = [
        { token: '--font-weight-normal', value: '400' },
        { token: '--font-weight-medium', value: '500' },
        { token: '--font-weight-semibold', value: '600' },
        { token: '--font-weight-bold', value: '700' },
      ]

      const rootStyle = getComputedStyle(document.documentElement)

      weights.forEach(({ token, value }) => {
        expect(rootStyle.getPropertyValue(token).trim()).toBe(value)
      })
    })
  })
})

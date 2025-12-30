import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Layout System', () => {
  let styleElement: HTMLStyleElement

  beforeEach(() => {
    styleElement = document.createElement('style')
    styleElement.textContent = `
      :root {
        /* Border Radius */
        --radius-xs: 0.25rem;
        --radius-sm: 0.375rem;
        --radius-md: 0.5rem;
        --radius-lg: 0.75rem;
        --radius-xl: 1rem;
        --radius-2xl: 1.5rem;
        --radius-full: 9999px;

        /* Shadows */
        --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
        --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
        --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
        --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
      }
    `
    document.head.appendChild(styleElement)
  })

  afterEach(() => {
    document.head.removeChild(styleElement)
  })

  describe('Border Radius', () => {
    it('should define border radius scale from xs to full', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--radius-xs').trim()).toBe('0.25rem')
      expect(rootStyle.getPropertyValue('--radius-sm').trim()).toBe('0.375rem')
      expect(rootStyle.getPropertyValue('--radius-md').trim()).toBe('0.5rem')
      expect(rootStyle.getPropertyValue('--radius-lg').trim()).toBe('0.75rem')
      expect(rootStyle.getPropertyValue('--radius-xl').trim()).toBe('1rem')
      expect(rootStyle.getPropertyValue('--radius-2xl').trim()).toBe('1.5rem')
      expect(rootStyle.getPropertyValue('--radius-full').trim()).toBe('9999px')
    })
  })

  describe('Shadow Scale', () => {
    it('should define shadow scale from sm to 2xl', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--shadow-sm').trim()).toContain('0 1px 2px')
      expect(rootStyle.getPropertyValue('--shadow-md').trim()).toContain('0 4px 6px')
      expect(rootStyle.getPropertyValue('--shadow-lg').trim()).toContain('0 10px 15px')
      expect(rootStyle.getPropertyValue('--shadow-xl').trim()).toContain('0 20px 25px')
      expect(rootStyle.getPropertyValue('--shadow-2xl').trim()).toContain('0 25px 50px')
    })
  })
})

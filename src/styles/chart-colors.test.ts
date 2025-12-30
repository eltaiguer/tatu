import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Chart Colors System', () => {
  let styleElement: HTMLStyleElement

  beforeEach(() => {
    styleElement = document.createElement('style')
    styleElement.textContent = `
      :root {
        /* Light mode chart colors */
        --chart-1: #0684f1;
        --chart-2: #eb6f47;
        --chart-3: #22c55e;
        --chart-4: #f59e0b;
        --chart-5: #8b5cf6;
        --chart-6: #ec4899;
      }

      .dark {
        /* Dark mode chart colors */
        --chart-1: #30a3ff;
        --chart-2: #f2916d;
        --chart-3: #4ade80;
        --chart-4: #fbbf24;
        --chart-5: #a78bfa;
        --chart-6: #f472b6;
      }
    `
    document.head.appendChild(styleElement)
  })

  afterEach(() => {
    document.head.removeChild(styleElement)
  })

  describe('Light Mode Chart Colors', () => {
    it('should define 6 chart colors for data visualization', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--chart-1').trim()).toBe('#0684f1')
      expect(rootStyle.getPropertyValue('--chart-2').trim()).toBe('#eb6f47')
      expect(rootStyle.getPropertyValue('--chart-3').trim()).toBe('#22c55e')
      expect(rootStyle.getPropertyValue('--chart-4').trim()).toBe('#f59e0b')
      expect(rootStyle.getPropertyValue('--chart-5').trim()).toBe('#8b5cf6')
      expect(rootStyle.getPropertyValue('--chart-6').trim()).toBe('#ec4899')
    })
  })

  describe('Dark Mode Chart Colors', () => {
    let darkElement: HTMLDivElement

    beforeEach(() => {
      darkElement = document.createElement('div')
      darkElement.className = 'dark'
      document.body.appendChild(darkElement)
    })

    afterEach(() => {
      document.body.removeChild(darkElement)
    })

    it('should define adjusted chart colors for dark mode', () => {
      const darkStyle = getComputedStyle(darkElement)

      expect(darkStyle.getPropertyValue('--chart-1').trim()).toBe('#30a3ff')
      expect(darkStyle.getPropertyValue('--chart-2').trim()).toBe('#f2916d')
      expect(darkStyle.getPropertyValue('--chart-3').trim()).toBe('#4ade80')
      expect(darkStyle.getPropertyValue('--chart-4').trim()).toBe('#fbbf24')
      expect(darkStyle.getPropertyValue('--chart-5').trim()).toBe('#a78bfa')
      expect(darkStyle.getPropertyValue('--chart-6').trim()).toBe('#f472b6')
    })
  })
})

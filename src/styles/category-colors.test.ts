import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Category Colors System', () => {
  let styleElement: HTMLStyleElement

  beforeEach(() => {
    styleElement = document.createElement('style')
    styleElement.textContent = `
      :root {
        /* Light mode category colors */
        --category-food: #eb6f47;
        --category-transport: #0684f1;
        --category-utilities: #f59e0b;
        --category-entertainment: #8b5cf6;
        --category-shopping: #ec4899;
        --category-health: #22c55e;
        --category-education: #06b6d4;
        --category-income: #16a34a;
        --category-other: #94a3b8;
      }

      .dark {
        /* Dark mode category colors */
        --category-food: #f2916d;
        --category-transport: #30a3ff;
        --category-utilities: #fbbf24;
        --category-entertainment: #a78bfa;
        --category-shopping: #f472b6;
        --category-health: #4ade80;
        --category-education: #22d3ee;
        --category-income: #4ade80;
        --category-other: #64748b;
      }
    `
    document.head.appendChild(styleElement)
  })

  afterEach(() => {
    document.head.removeChild(styleElement)
  })

  describe('Light Mode Category Colors', () => {
    it('should define category colors for transactions', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--category-food').trim()).toBe('#eb6f47')
      expect(rootStyle.getPropertyValue('--category-transport').trim()).toBe('#0684f1')
      expect(rootStyle.getPropertyValue('--category-utilities').trim()).toBe('#f59e0b')
      expect(rootStyle.getPropertyValue('--category-entertainment').trim()).toBe('#8b5cf6')
      expect(rootStyle.getPropertyValue('--category-shopping').trim()).toBe('#ec4899')
      expect(rootStyle.getPropertyValue('--category-health').trim()).toBe('#22c55e')
      expect(rootStyle.getPropertyValue('--category-education').trim()).toBe('#06b6d4')
      expect(rootStyle.getPropertyValue('--category-income').trim()).toBe('#16a34a')
      expect(rootStyle.getPropertyValue('--category-other').trim()).toBe('#94a3b8')
    })
  })

  describe('Dark Mode Category Colors', () => {
    let darkElement: HTMLDivElement

    beforeEach(() => {
      darkElement = document.createElement('div')
      darkElement.className = 'dark'
      document.body.appendChild(darkElement)
    })

    afterEach(() => {
      document.body.removeChild(darkElement)
    })

    it('should define adjusted category colors for dark mode', () => {
      const darkStyle = getComputedStyle(darkElement)

      expect(darkStyle.getPropertyValue('--category-food').trim()).toBe('#f2916d')
      expect(darkStyle.getPropertyValue('--category-transport').trim()).toBe('#30a3ff')
      expect(darkStyle.getPropertyValue('--category-utilities').trim()).toBe('#fbbf24')
      expect(darkStyle.getPropertyValue('--category-entertainment').trim()).toBe('#a78bfa')
      expect(darkStyle.getPropertyValue('--category-shopping').trim()).toBe('#f472b6')
      expect(darkStyle.getPropertyValue('--category-health').trim()).toBe('#4ade80')
      expect(darkStyle.getPropertyValue('--category-education').trim()).toBe('#22d3ee')
      expect(darkStyle.getPropertyValue('--category-income').trim()).toBe('#4ade80')
      expect(darkStyle.getPropertyValue('--category-other').trim()).toBe('#64748b')
    })
  })
})

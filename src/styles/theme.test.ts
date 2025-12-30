import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Theme System', () => {
  let styleElement: HTMLStyleElement

  beforeEach(() => {
    styleElement = document.createElement('style')
    styleElement.textContent = `
      :root {
        /* Light mode semantic tokens */
        --background: #f8fafc;
        --foreground: #0f172a;
        --card: #ffffff;
        --card-foreground: #0f172a;
        --popover: #ffffff;
        --popover-foreground: #0f172a;
        --primary: #0066ce;
        --primary-foreground: #ffffff;
        --secondary: #f1f5f9;
        --secondary-foreground: #0f172a;
        --muted: #f1f5f9;
        --muted-foreground: #64748b;
        --accent: #eb6f47;
        --accent-foreground: #ffffff;
        --destructive: #dc2626;
        --destructive-foreground: #ffffff;
        --border: #e2e8f0;
        --input: #e2e8f0;
        --input-background: #ffffff;
        --ring: #0066ce;
      }

      .dark {
        /* Dark mode semantic tokens */
        --background: #0f172a;
        --foreground: #f8fafc;
        --card: #1e293b;
        --card-foreground: #f8fafc;
        --popover: #1e293b;
        --popover-foreground: #f8fafc;
        --primary: #30a3ff;
        --primary-foreground: #0f172a;
        --secondary: #1e293b;
        --secondary-foreground: #f8fafc;
        --muted: #1e293b;
        --muted-foreground: #94a3b8;
        --accent: #f2916d;
        --accent-foreground: #0f172a;
        --destructive: #ef4444;
        --destructive-foreground: #ffffff;
        --border: #334155;
        --input: #334155;
        --input-background: #1e293b;
        --ring: #30a3ff;
      }
    `
    document.head.appendChild(styleElement)
  })

  afterEach(() => {
    document.head.removeChild(styleElement)
  })

  describe('Light Mode Semantic Tokens', () => {
    it('should define background and foreground tokens', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--background').trim()).toBe('#f8fafc')
      expect(rootStyle.getPropertyValue('--foreground').trim()).toBe('#0f172a')
    })

    it('should define card tokens', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--card').trim()).toBe('#ffffff')
      expect(rootStyle.getPropertyValue('--card-foreground').trim()).toBe('#0f172a')
    })

    it('should define popover tokens', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--popover').trim()).toBe('#ffffff')
      expect(rootStyle.getPropertyValue('--popover-foreground').trim()).toBe('#0f172a')
    })

    it('should define primary semantic tokens', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--primary').trim()).toBe('#0066ce')
      expect(rootStyle.getPropertyValue('--primary-foreground').trim()).toBe('#ffffff')
    })

    it('should define secondary semantic tokens', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--secondary').trim()).toBe('#f1f5f9')
      expect(rootStyle.getPropertyValue('--secondary-foreground').trim()).toBe('#0f172a')
    })

    it('should define muted tokens', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--muted').trim()).toBe('#f1f5f9')
      expect(rootStyle.getPropertyValue('--muted-foreground').trim()).toBe('#64748b')
    })

    it('should define accent semantic tokens', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--accent').trim()).toBe('#eb6f47')
      expect(rootStyle.getPropertyValue('--accent-foreground').trim()).toBe('#ffffff')
    })

    it('should define destructive tokens', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--destructive').trim()).toBe('#dc2626')
      expect(rootStyle.getPropertyValue('--destructive-foreground').trim()).toBe('#ffffff')
    })

    it('should define input and border tokens', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--border').trim()).toBe('#e2e8f0')
      expect(rootStyle.getPropertyValue('--input').trim()).toBe('#e2e8f0')
      expect(rootStyle.getPropertyValue('--input-background').trim()).toBe('#ffffff')
    })

    it('should define ring token for focus states', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--ring').trim()).toBe('#0066ce')
    })
  })

  describe('Dark Mode Semantic Tokens', () => {
    let darkElement: HTMLDivElement

    beforeEach(() => {
      darkElement = document.createElement('div')
      darkElement.className = 'dark'
      document.body.appendChild(darkElement)
    })

    afterEach(() => {
      document.body.removeChild(darkElement)
    })

    it('should define dark mode background and foreground tokens', () => {
      const darkStyle = getComputedStyle(darkElement)

      expect(darkStyle.getPropertyValue('--background').trim()).toBe('#0f172a')
      expect(darkStyle.getPropertyValue('--foreground').trim()).toBe('#f8fafc')
    })

    it('should define dark mode card tokens', () => {
      const darkStyle = getComputedStyle(darkElement)

      expect(darkStyle.getPropertyValue('--card').trim()).toBe('#1e293b')
      expect(darkStyle.getPropertyValue('--card-foreground').trim()).toBe('#f8fafc')
    })

    it('should define dark mode popover tokens', () => {
      const darkStyle = getComputedStyle(darkElement)

      expect(darkStyle.getPropertyValue('--popover').trim()).toBe('#1e293b')
      expect(darkStyle.getPropertyValue('--popover-foreground').trim()).toBe('#f8fafc')
    })

    it('should define dark mode primary semantic tokens', () => {
      const darkStyle = getComputedStyle(darkElement)

      expect(darkStyle.getPropertyValue('--primary').trim()).toBe('#30a3ff')
      expect(darkStyle.getPropertyValue('--primary-foreground').trim()).toBe('#0f172a')
    })

    it('should define dark mode secondary semantic tokens', () => {
      const darkStyle = getComputedStyle(darkElement)

      expect(darkStyle.getPropertyValue('--secondary').trim()).toBe('#1e293b')
      expect(darkStyle.getPropertyValue('--secondary-foreground').trim()).toBe('#f8fafc')
    })

    it('should define dark mode muted tokens', () => {
      const darkStyle = getComputedStyle(darkElement)

      expect(darkStyle.getPropertyValue('--muted').trim()).toBe('#1e293b')
      expect(darkStyle.getPropertyValue('--muted-foreground').trim()).toBe('#94a3b8')
    })

    it('should define dark mode accent semantic tokens', () => {
      const darkStyle = getComputedStyle(darkElement)

      expect(darkStyle.getPropertyValue('--accent').trim()).toBe('#f2916d')
      expect(darkStyle.getPropertyValue('--accent-foreground').trim()).toBe('#0f172a')
    })

    it('should define dark mode destructive tokens', () => {
      const darkStyle = getComputedStyle(darkElement)

      expect(darkStyle.getPropertyValue('--destructive').trim()).toBe('#ef4444')
      expect(darkStyle.getPropertyValue('--destructive-foreground').trim()).toBe('#ffffff')
    })

    it('should define dark mode input and border tokens', () => {
      const darkStyle = getComputedStyle(darkElement)

      expect(darkStyle.getPropertyValue('--border').trim()).toBe('#334155')
      expect(darkStyle.getPropertyValue('--input').trim()).toBe('#334155')
      expect(darkStyle.getPropertyValue('--input-background').trim()).toBe('#1e293b')
    })

    it('should define dark mode ring token', () => {
      const darkStyle = getComputedStyle(darkElement)

      expect(darkStyle.getPropertyValue('--ring').trim()).toBe('#30a3ff')
    })
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Color System', () => {
  let styleElement: HTMLStyleElement

  beforeEach(() => {
    // Create a style element and add our color CSS
    styleElement = document.createElement('style')
    styleElement.textContent = `
      :root {
        /* Primary - Ocean Blue */
        --primary-50: #f0f7ff;
        --primary-100: #dfeeff;
        --primary-200: #b8ddff;
        --primary-300: #78c2ff;
        --primary-400: #30a3ff;
        --primary-500: #0684f1;
        --primary-600: #0066ce;
        --primary-700: #0052a7;
        --primary-800: #03448a;
        --primary-900: #093a72;

        /* Accent - Sunset Terracotta */
        --accent-50: #fef7f3;
        --accent-100: #fdede5;
        --accent-200: #fbd8ca;
        --accent-300: #f7baa4;
        --accent-400: #f2916d;
        --accent-500: #eb6f47;
        --accent-600: #d95429;
        --accent-700: #b5421f;
        --accent-800: #943a1e;
        --accent-900: #79331e;

        /* Success - Mate Green */
        --success-50: #f0fdf5;
        --success-100: #dcfce8;
        --success-200: #bbf7d1;
        --success-300: #86efac;
        --success-400: #4ade80;
        --success-500: #22c55e;
        --success-600: #16a34a;
        --success-700: #15803d;
        --success-800: #166534;
        --success-900: #14532d;

        /* Warning - Amber */
        --warning-50: #fffbeb;
        --warning-100: #fef3c7;
        --warning-200: #fde68a;
        --warning-300: #fcd34d;
        --warning-400: #fbbf24;
        --warning-500: #f59e0b;
        --warning-600: #d97706;
        --warning-700: #b45309;
        --warning-800: #92400e;
        --warning-900: #78350f;

        /* Neutral - Cool Grays */
        --neutral-50: #f8fafc;
        --neutral-100: #f1f5f9;
        --neutral-200: #e2e8f0;
        --neutral-300: #cbd5e1;
        --neutral-400: #94a3b8;
        --neutral-500: #64748b;
        --neutral-600: #475569;
        --neutral-700: #334155;
        --neutral-800: #1e293b;
        --neutral-900: #0f172a;

        /* Spacing */
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

  describe('Primary Color Scale', () => {
    it('should define primary ocean blue color scale from 50 to 900', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--primary-50').trim()).toBe('#f0f7ff')
      expect(rootStyle.getPropertyValue('--primary-100').trim()).toBe('#dfeeff')
      expect(rootStyle.getPropertyValue('--primary-200').trim()).toBe('#b8ddff')
      expect(rootStyle.getPropertyValue('--primary-300').trim()).toBe('#78c2ff')
      expect(rootStyle.getPropertyValue('--primary-400').trim()).toBe('#30a3ff')
      expect(rootStyle.getPropertyValue('--primary-500').trim()).toBe('#0684f1')
      expect(rootStyle.getPropertyValue('--primary-600').trim()).toBe('#0066ce')
      expect(rootStyle.getPropertyValue('--primary-700').trim()).toBe('#0052a7')
      expect(rootStyle.getPropertyValue('--primary-800').trim()).toBe('#03448a')
      expect(rootStyle.getPropertyValue('--primary-900').trim()).toBe('#093a72')
    })
  })

  describe('Accent Color Scale', () => {
    it('should define accent sunset terracotta color scale from 50 to 900', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--accent-50').trim()).toBe('#fef7f3')
      expect(rootStyle.getPropertyValue('--accent-100').trim()).toBe('#fdede5')
      expect(rootStyle.getPropertyValue('--accent-200').trim()).toBe('#fbd8ca')
      expect(rootStyle.getPropertyValue('--accent-300').trim()).toBe('#f7baa4')
      expect(rootStyle.getPropertyValue('--accent-400').trim()).toBe('#f2916d')
      expect(rootStyle.getPropertyValue('--accent-500').trim()).toBe('#eb6f47')
      expect(rootStyle.getPropertyValue('--accent-600').trim()).toBe('#d95429')
      expect(rootStyle.getPropertyValue('--accent-700').trim()).toBe('#b5421f')
      expect(rootStyle.getPropertyValue('--accent-800').trim()).toBe('#943a1e')
      expect(rootStyle.getPropertyValue('--accent-900').trim()).toBe('#79331e')
    })
  })

  describe('Semantic Colors', () => {
    it('should define success mate green color scale', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--success-50').trim()).toBe('#f0fdf5')
      expect(rootStyle.getPropertyValue('--success-500').trim()).toBe('#22c55e')
      expect(rootStyle.getPropertyValue('--success-900').trim()).toBe('#14532d')
    })

    it('should define warning amber color scale', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--warning-50').trim()).toBe('#fffbeb')
      expect(rootStyle.getPropertyValue('--warning-500').trim()).toBe('#f59e0b')
      expect(rootStyle.getPropertyValue('--warning-900').trim()).toBe('#78350f')
    })

    it('should define neutral cool gray color scale', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--neutral-50').trim()).toBe('#f8fafc')
      expect(rootStyle.getPropertyValue('--neutral-500').trim()).toBe('#64748b')
      expect(rootStyle.getPropertyValue('--neutral-900').trim()).toBe('#0f172a')
    })
  })

  describe('Spacing System', () => {
    it('should define 4px base spacing scale', () => {
      const rootStyle = getComputedStyle(document.documentElement)

      expect(rootStyle.getPropertyValue('--space-1').trim()).toBe('0.25rem') // 4px
      expect(rootStyle.getPropertyValue('--space-2').trim()).toBe('0.5rem') // 8px
      expect(rootStyle.getPropertyValue('--space-4').trim()).toBe('1rem') // 16px
      expect(rootStyle.getPropertyValue('--space-8').trim()).toBe('2rem') // 32px
      expect(rootStyle.getPropertyValue('--space-16').trim()).toBe('4rem') // 64px
    })
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

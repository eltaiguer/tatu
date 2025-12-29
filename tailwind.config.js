/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#0066ce',
          dark: '#171717',
          'light-gray': '#f5f5f5',
          'dark-text': '#0f172a',
          'muted-text': '#64748b',
          border: '#e2e8f0',
        },
        ocean: {
          50: '#f0f7ff',
          100: '#dfeeff',
          200: '#b8ddff',
          300: '#78c2ff',
          400: '#30a3ff',
          500: '#0684f1',
          600: '#0066ce',
          700: '#0052a7',
          800: '#03448a',
          900: '#093a72',
        },
        terracota: {
          50: '#fef7f3',
          100: '#fdede5',
          200: '#fbd8ca',
          300: '#f7baa4',
          400: '#f2916d',
          500: '#eb6f47',
          600: '#d95429',
          700: '#b5421f',
          800: '#943a1e',
          900: '#79331e',
        },
        success: {
          100: '#dcfce8',
          300: '#86efac',
          500: '#22c55e',
          700: '#15803d',
          900: '#14532d',
        },
        warning: {
          100: '#fef3c7',
          300: '#fcd34d',
          500: '#f59e0b',
          700: '#b45309',
          900: '#78350f',
        },
        neutral: {
          100: '#f1f5f9',
          300: '#cbd5e1',
          500: '#64748b',
          700: '#334155',
          900: '#0f172a',
        },
      },
      fontFamily: {
        'space-grotesk': ['Space Grotesk', 'sans-serif'],
        'inter': ['Inter', 'sans-serif'],
        'jetbrains-mono': ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        // Display - Space Grotesk (for headings)
        'display-1': ['30px', { lineHeight: '36px', fontWeight: '700' }],
        'display-2': ['24px', { lineHeight: '31.2px', fontWeight: '700' }],
        'display-3': ['20px', { lineHeight: '28px', fontWeight: '600' }],

        // UI - Inter (for body text)
        'ui-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'ui-base': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'ui-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'ui-xs': ['12px', { lineHeight: '16px', fontWeight: '400' }],

        // Mono - JetBrains Mono (for numbers/data)
        'mono-lg': ['24px', { lineHeight: '32px', fontWeight: '400' }],
        'mono-md': ['20px', { lineHeight: '28px', fontWeight: '400' }],
        'mono-base': ['16px', { lineHeight: '24px', fontWeight: '400' }],
      },
    },
  },
  plugins: [],
}

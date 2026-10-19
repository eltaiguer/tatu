import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tests run in a pinned time zone so a date bug can't pass on one machine and
// fail on another: Uruguay (the user's zone) by default, others through
// TATU_TEST_TZ (`npm run test:tz`). Node re-reads TZ when it is assigned, and
// test workers inherit it from this process — assigning it inside a test does
// nothing. Only under Vitest: `vite dev`/`build` keep the machine's zone.
if (process.env.VITEST) {
  process.env.TZ = process.env.TATU_TEST_TZ ?? 'America/Montevideo'
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor code in its own chunks, so an app deploy doesn't
        // invalidate it in the browser cache. React, ReactDOM and scheduler
        // must share a chunk (splitting them creates circular chunk imports).
        // Recharts and the Anthropic SDK stay out of this list on purpose:
        // they follow the lazy views / on-demand import instead (#62).
        manualChunks: {
          react: ['react', 'react-dom', 'scheduler'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Agent worktrees live under .claude/ and would run every test twice.
    exclude: [...configDefaults.exclude, '.claude/**'],
    // App-level flows legitimately take 2-5s each in isolation and slow
    // further when every jsdom file runs in parallel; the 5s default made
    // them flake under full-suite load (#78). Don't add retries instead.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
})

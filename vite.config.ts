import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Source maps go to Sentry only when deploying with SENTRY_AUTH_TOKEN set
// (plus SENTRY_ORG / SENTRY_PROJECT); they are deleted from dist/ after the
// upload so Firebase never serves them. Other builds skip this entirely.
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    uploadSourceMaps &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        telemetry: false,
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      }),
  ],
  build: {
    sourcemap: uploadSourceMaps ? 'hidden' : false,
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
          sentry: ['@sentry/react', '@sentry/browser', '@sentry/core'],
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

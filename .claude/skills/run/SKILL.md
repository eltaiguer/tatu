---
name: run
description: Runs Tatu locally against a seeded local Supabase (Docker) and takes screenshots. Use when asked to run, start, open or screenshot the app, or to check a change in the real app instead of only in tests.
---

# Run Tatu locally

The app is useless without Supabase, and production data is off limits. Run it
against a local Supabase stack in Docker, seeded from `samples/`.

## Steps

1. **Backend:** `npm run dev:backend` (Docker must be running). It starts the
   stack, applies `supabase/schema.sql`, writes `.env.local` pointing at it, and
   seeds the dev user from the three sample CSVs. It's idempotent, so run it
   every time; the first run pulls images and takes a few minutes.
2. **App:** `npm run dev` and open http://localhost:5173.
3. **Log in:** `dev@tatu.local` / `tatu-dev-password`. Resumen shows data
   (99 transactions).
4. **Screenshots:** save under `screenshots/` (or `.playwright-mcp/`, the
   Playwright MCP default). Both are gitignored; never save to the repo root.
5. **Stop:** `npx supabase stop` when done (data survives in the Docker volume;
   `npx supabase stop --no-backup` wipes it, and the next `dev:backend` reseeds).

## Gotchas

- `.env.local` overrides `.env`. While it exists, `npm run dev` talks to the
  local stack; delete it to point the app back at the project in `.env`. The
  script refuses to overwrite an `.env.local` it didn't write.
- Studio (DB browser) is at http://127.0.0.1:54323, and password-reset emails
  land in Mailpit at http://127.0.0.1:54324.
- Seeding goes through the app's own parser and persistence code
  (`scripts/seed-local.ts`), so importing a sample CSV in the UI reports every
  row as a duplicate. That's expected.
- Without Docker (e.g. cloud agents) this recipe doesn't work. There's no
  offline mode to fall back on.

# ADR-0003: Report client errors to Sentry, scrubbed in the browser

## Status

Proposed

## Date

2026-10-04

## Context

Tatu runs entirely in the browser. When an import, sync, preference save or AI
enrichment fails in production, the user sees a Spanish toast
(`utils/user-error.ts`) and the real error goes to `console.error`, where
nobody reads it. A failed lazy view is caught by `ViewErrorBoundary` the same
way. There is no way to tell that something broke, how often, or since which
deploy. A parse failure matters most: it can mean Santander changed its CSV
export, and every import breaks until the parsers catch up.

The constraint is the data. Error context in this app can include transaction
descriptions (merchant names), amounts, the password-recovery `access_token`
in the URL hash, Transacciones search text in the query string, and Supabase
request URLs whose filters contain descriptions.

## Decision

Report errors to Sentry (free Developer plan) with `@sentry/react`, through
`src/services/monitoring/error-reporting.ts`:

- **Off unless configured.** `initErrorReporting()` (called from `main.tsx`)
  does nothing without `VITE_SENTRY_DSN`, so local dev and tests never send
  anything. A build without the DSN drops `Sentry.init`
  and the integrations, leaving a stub chunk of about 4 KB gzipped.
- **Collect as little as possible.** `dataCollection` disables user info,
  cookies, headers, bodies, query params, AI inputs/outputs and stack-frame
  variables. Console, fetch/XHR and click breadcrumbs are disabled. Click breadcrumbs
  record the element's `aria-label`, and transaction rows carry
  `aria-label="Editar <merchant>"`. Only navigation breadcrumbs remain.
  No tracing and no Session Replay.
- **Scrub what is left** (`scrubEvent`, `scrubBreadcrumb`): URLs are reduced
  to origin and path, quoted values (`Importe ilegible: "…"`) and Postgres
  key values (`Key (id)=(…)`) are redacted from messages, and `extra` is
  dropped. Non-`Error` throws (Supabase error objects) are wrapped in an
  `Error` carrying only their `message`.
- **Report only bugs.** `UserFacingError` and `NeedsConfirmationError` are
  dropped, and so are chunk-load and network failures, which the app already
  recovers from.
- **One report per failure.** `userErrorMessage` reports any error it did not
  write itself. Sites that log an error and do not pass it to
  `userErrorMessage` call `captureError(error, area)` with an `area` tag
  (`view`, `import-parse`, `import`, `ai`, `preferences`, `reset`).
- **User identity is the Supabase user id only**, set from `useAuthSession`.
- **Source maps** are uploaded by `@sentry/vite-plugin` only when
  `SENTRY_AUTH_TOKEN` (plus `SENTRY_ORG`, `SENTRY_PROJECT`) is set at build
  time, and deleted from `dist/` after the upload, so Firebase never serves
  them.

## Alternatives considered

### A `client_errors` table in Supabase

No new vendor, and the data stays in the existing stack. Rejected for now:
it has no grouping, no alerts, no source-map symbolication and no release
tracking, and all of that would have to be built.

### PostHog error tracking

It has a generous free tier and product analytics in the same tool. Rejected:
its error tracking is less mature than Sentry's, and analytics is not a goal
right now.

### Capturing `console.error` automatically

Sentry's console integration would capture every existing log without code
changes. Rejected: the logged arguments are exactly where amounts and
descriptions appear, and it would report expected errors.

## Consequences

- Production failures become visible, grouped and tied to a release.
- Data now leaves the browser for a third party. The scrubbers are the
  boundary, and they are covered by tests that run the real SDK with a fake
  transport (`error-reporting.sentry.test.ts`). A new error message that
  embeds user data outside quotes would get past them. New `throw` sites
  should quote values, as the parsers do.
- The Sentry chunk adds about 32 KB gzipped to the first load when the DSN is
  set.
- The free plan sends alerts by email only. GitHub issue sync (manual link,
  two-way sync, alert-to-issue) needs the paid Team or Business plan. A
  bridge, if wanted, is follow-up work.
- Manual setup: create the Sentry project, set `VITE_SENTRY_DSN` in the deploy
  environment, and export `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and
  `SENTRY_PROJECT` before `npm run deploy:firebase` to get readable stack
  traces.

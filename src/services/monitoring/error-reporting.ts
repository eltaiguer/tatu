import * as Sentry from '@sentry/react'
import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/react'

// Error reporting to Sentry (ADR-0004). This is a finance app: transaction
// descriptions, amounts and auth tokens must never leave the browser, so
// everything sent goes through the scrubbers below. Without VITE_SENTRY_DSN
// (local dev, tests) Sentry is never initialised and every call is a no-op.

const REDACTED = '[redacted]'

// Errors the app already explains to the user (utils/user-error.ts), and
// their subclasses, carry `explained: true`; they are not bugs. A marker, not
// the class: importing utils/user-error here would be a circular import.
function isExplainedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { explained?: unknown }).explained === true
  )
}

// Keeps origin + path only: the password-recovery hash carries an
// access_token, and Transacciones filters (search text included) live in the
// query string.
export function stripUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url.split(/[?#]/)[0]
  }
}

// Parser and Supabase messages quote the offending value
// (`Importe ilegible: "1.234,56"`, `Key (id)=(abc) already exists`). Quotes
// can nest (a JSON parse error quotes the model's JSON), so everything from
// the first quote to the last, or to the end when unclosed, goes.
export function redactMessage(message: string): string {
  return (
    message
      .replace(/"[\s\S]*"|"[\s\S]*$/, `"${REDACTED}"`)
      // Single quotes: V8 quotes the token it choked on ("Unexpected token 'D'").
      .replace(/'[^']*'/g, `'${REDACTED}'`)
      // Greedy: a key value can hold parentheses itself ("(UY) DISCO").
      .replace(/=\(.*\)/g, `=(${REDACTED})`)
  )
}

export function scrubEvent(
  event: ErrorEvent,
  hint?: EventHint
): ErrorEvent | null {
  if (isExplainedError(hint?.originalException)) return null

  if (event.request) {
    if (event.request.url) event.request.url = stripUrl(event.request.url)
    delete event.request.query_string
    delete event.request.cookies
    delete event.request.data
    // The Referer is the full URL of the page that linked here.
    delete event.request.headers
  }
  if (event.message) event.message = redactMessage(event.message)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactMessage(exception.value)
  }
  // Supabase errors are plain objects; Sentry serialises their fields here.
  delete event.extra
  event.breadcrumbs = event.breadcrumbs
    ?.map(scrubBreadcrumb)
    .filter((crumb): crumb is Breadcrumb => crumb !== null)
  return event
}

// Only navigation breadcrumbs are kept, with URLs reduced to their path.
// The others are disabled at init: console ones carry logged errors, HTTP ones
// Supabase query URLs, and click ones the element's aria-label/title
// ("Editar <merchant>"). Dropping them here is the second line of defence.
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === 'navigation') {
    const from = crumb.data?.from
    const to = crumb.data?.to
    return {
      ...crumb,
      data: {
        ...(typeof from === 'string' && { from: stripUrl(from) }),
        ...(typeof to === 'string' && { to: stripUrl(to) }),
      },
    }
  }
  return null
}

// Production builds only: Vite loads the same `.env` for `npm run dev`, and
// half-written local code must not reach the project's Sentry. Written
// inline on purpose: Vite replaces both values at build time, so a build
// without a DSN drops Sentry.init and with it most of the SDK (a stub chunk
// of ~4 KB gzipped instead of ~32 KB). A helper function would defeat that.
export function initErrorReporting(): void {
  if (!import.meta.env.PROD || !import.meta.env.VITE_SENTRY_DSN) return
  Sentry.init(sentryOptions(import.meta.env.VITE_SENTRY_DSN))
}

/**
 * A fetch that failed for lack of a connection, by the browser's messages.
 * Not the offline flag: a code bug thrown while offline is still a bug (the
 * user-facing text checks the flag itself).
 */
export function isNetworkError(error: unknown): boolean {
  const message = errorMessage(error)
  // Safari's bare "Load failed" is anchored: "Preload failed" is not one.
  return /\bfailed to fetch\b|\bnetworkerror\b|(?:^|: )load failed$|\bnetwork request failed\b/i.test(
    message
  )
}

export function sentryOptions(dsn: string): Sentry.BrowserOptions {
  return {
    dsn,
    environment: import.meta.env.MODE,
    // Collect nothing beyond the stack trace; scrubEvent then strips what the
    // SDK attaches regardless (page URL, error messages).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    // The default rewrites the app's own Error messages, which
    // utils/user-error.ts matches on.
    enhanceFetchErrorMessages: false,
    integrations: (defaults) => [
      ...defaults.filter(
        (integration) =>
          integration.name !== 'Console' && integration.name !== 'Breadcrumbs'
      ),
      Sentry.breadcrumbsIntegration({
        dom: false,
        history: true,
        fetch: false,
        xhr: false,
      }),
    ],
    // A deploy replaces hashed chunks; main.tsx reloads the tab and
    // ViewErrorBoundary offers a reload button, so these are not bugs.
    // Anchored: Sentry matches these against "Type: message" and the
    // message alone, and a loose /Load failed/ would also drop "Download
    // failed".
    ignoreErrors: [
      /^(?:TypeError: )?Failed to fetch dynamically imported module\b/i,
      /^(?:TypeError: )?Importing a module script failed\.?$/i,
      /^(?:TypeError: )?Failed to fetch$/i,
      /^(?:TypeError: )?NetworkError when attempting to fetch resource\.?$/i,
      /^(?:TypeError: )?Load failed$/i,
    ],
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  }
}

/**
 * Reports an unexpected error. Callers keep their own console logging; this
 * only sends to Sentry (a no-op when it isn't configured). `area` tags the
 * event so Sentry can group by feature (import, ai, preferences, ...).
 * Safe to call with any error: one written for the user is not a bug, but
 * its `cause` (the server failure it explains) is, and that is what goes.
 */
export function captureError(error: unknown, area?: string): void {
  let reported = error
  while (isExplainedError(reported)) {
    reported = (reported as { cause?: unknown }).cause
    if (reported === undefined) return
  }
  // The user is told about these; they are not bugs, whoever reports them.
  if (isNetworkError(reported)) return
  const exception =
    reported instanceof Error ? reported : new Error(errorMessage(reported))
  Sentry.captureException(exception, area ? { tags: { area } } : undefined)
}

/** The message of an Error, a Supabase error object or a thrown string. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return typeof error === 'string' ? error : 'Non-Error thrown'
}

/** Ties events to the Supabase user id — never the email. */
export function setErrorReportingUser(userId: string | null): void {
  Sentry.setUser(userId ? { id: userId } : null)
}

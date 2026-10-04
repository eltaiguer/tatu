import * as Sentry from '@sentry/react'
import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/react'

// Error reporting to Sentry (ADR-0003). This is a finance app: transaction
// descriptions, amounts and auth tokens must never leave the browser, so
// everything sent goes through the scrubbers below. Without VITE_SENTRY_DSN
// (local dev, tests) Sentry is never initialised and every call is a no-op.

const REDACTED = '[redacted]'

// Errors the app already explains to the user (utils/user-error.ts); they are
// not bugs. Matched by name: importing the classes would be a circular import.
const EXPECTED_ERROR_NAMES = ['UserFacingError', 'NeedsConfirmationError']

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
// (`Importe ilegible: "1.234,56"`, `Key (id)=(abc) already exists`).
export function redactMessage(message: string): string {
  return message
    .replace(/"[^"]*"/g, `"${REDACTED}"`)
    .replace(/=\([^)]*\)/g, `=(${REDACTED})`)
}

export function scrubEvent(
  event: ErrorEvent,
  hint?: EventHint
): ErrorEvent | null {
  const original = hint?.originalException
  if (
    original instanceof Error &&
    EXPECTED_ERROR_NAMES.includes(original.name)
  ) {
    return null
  }

  if (event.request) {
    if (event.request.url) event.request.url = stripUrl(event.request.url)
    delete event.request.query_string
    delete event.request.cookies
    delete event.request.data
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

export function initErrorReporting(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init(sentryOptions(dsn))
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
    ignoreErrors: [
      /dynamically imported module/i,
      /importing a module script failed/i,
      /Failed to fetch/i,
      /NetworkError/i,
      /Load failed/i,
    ],
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  }
}

/**
 * Reports an unexpected error. Callers keep their own console logging; this
 * only sends to Sentry (a no-op when it isn't configured). `area` tags the
 * event so Sentry can group by feature (import, ai, preferences, ...).
 */
export function captureError(error: unknown, area?: string): void {
  const exception =
    error instanceof Error ? error : new Error(describeNonError(error))
  Sentry.captureException(exception, area ? { tags: { area } } : undefined)
}

function describeNonError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return typeof error === 'string' ? error : 'Non-Error thrown'
}

/** Ties events to the Supabase user id — never the email. */
export function setErrorReportingUser(userId: string | null): void {
  Sentry.setUser(userId ? { id: userId } : null)
}

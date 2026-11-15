// A table that exists only once schema.sql is applied by hand
// (supabase/README.md): Postgres says 42P01, PostgREST's schema cache
// PGRST205. That is setup, not a bug, and the raw text is English.
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

export function isMissingTable(error: { code?: string }): boolean {
  return error.code !== undefined && MISSING_TABLE_CODES.has(error.code)
}

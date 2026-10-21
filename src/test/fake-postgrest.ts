// A small stand-in for the Supabase JS query builder over in-memory tables,
// for testing the Supabase adapter's requests: which filters each request
// carries (`.eq('user_id')`, `.in()` sizes), what a chunk does atomically, and
// what `.select()` returns after a write. Supports only what the app uses.

type Row = Record<string, unknown>

export interface FakeRequest {
  table: string
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete'
  /** Column -> value(s) the request filtered on. */
  eq: Record<string, unknown>
  in: Record<string, unknown[]>
  is: Record<string, unknown>
  payload?: unknown
}

type Filter = (row: Row) => boolean

const PRIMARY_KEYS: Record<string, string[]> = {
  transactions: ['user_id', 'transaction_id'],
  import_runs: ['id'],
  description_overrides: ['user_id', 'description_normalized'],
  category_overrides: ['user_id', 'merchant_normalized'],
  custom_patterns: ['user_id', 'id'],
  custom_categories: ['user_id', 'id'],
  user_preferences: ['user_id'],
}

export function createFakePostgrest() {
  const tables = new Map<string, Row[]>()
  const requests: FakeRequest[] = []
  let failWhen: ((request: FakeRequest) => boolean)[] = []
  let nextId = 1

  function rowsOf(table: string): Row[] {
    if (!tables.has(table)) tables.set(table, [])
    return tables.get(table)!
  }

  function keyOf(table: string, row: Row): string {
    return (PRIMARY_KEYS[table] ?? ['id']).map((k) => row[k]).join('|')
  }

  function from(table: string) {
    const request: FakeRequest = { table, op: 'select', eq: {}, in: {}, is: {} }
    const filters: Filter[] = []
    let returning = false
    let started = false
    let onConflictUpsert = false
    let single = false
    let limit = Infinity
    let orderBy: string | null = null

    const builder = {
      select() {
        if (started) returning = true
        else {
          started = true
          request.op = 'select'
          returning = true
        }
        return builder
      },
      insert(payload: Row | Row[]) {
        started = true
        request.op = 'insert'
        request.payload = payload
        return builder
      },
      upsert(payload: Row | Row[], options?: { onConflict?: string }) {
        started = true
        request.op = 'upsert'
        request.payload = payload
        onConflictUpsert = Boolean(options?.onConflict)
        return builder
      },
      update(payload: Row) {
        started = true
        request.op = 'update'
        request.payload = payload
        return builder
      },
      delete() {
        started = true
        request.op = 'delete'
        return builder
      },
      eq(column: string, value: unknown) {
        request.eq[column] = value
        filters.push((row) => row[column] === value)
        return builder
      },
      in(column: string, values: unknown[]) {
        request.in[column] = values
        filters.push((row) => values.includes(row[column]))
        return builder
      },
      is(column: string, value: unknown) {
        request.is[column] = value
        filters.push((row) =>
          value === null
            ? row[column] === null || row[column] === undefined
            : (row[column] ?? false) === value
        )
        return builder
      },
      gt(column: string, value: string) {
        filters.push((row) => String(row[column]) > value)
        return builder
      },
      gte(column: string, value: string) {
        filters.push((row) => String(row[column]) >= value)
        return builder
      },
      lte(column: string, value: string) {
        filters.push((row) => String(row[column]) <= value)
        return builder
      },
      order(column: string) {
        orderBy = column
        return builder
      },
      limit(n: number) {
        limit = n
        return builder
      },
      single() {
        single = true
        return builder
      },
      then<T>(
        resolve: (value: { data: unknown; error: unknown }) => T,
        reject?: (reason: unknown) => T
      ) {
        return Promise.resolve()
          .then(() => execute())
          .then(resolve, reject)
      },
    }

    function execute(): { data: unknown; error: unknown } {
      requests.push(request)
      if (failWhen.some((fails) => fails(request))) {
        return { data: null, error: { message: 'request failed', code: '' } }
      }
      const all = rowsOf(table)
      const matches = () => all.filter((row) => filters.every((f) => f(row)))
      switch (request.op) {
        case 'select': {
          let rows = matches()
          if (orderBy) {
            const column = orderBy
            rows = [...rows].sort((a, b) =>
              String(a[column]).localeCompare(String(b[column]))
            )
          }
          rows = rows.slice(0, limit)
          if (single && rows.length !== 1) {
            return {
              data: null,
              error: { message: 'not exactly one row', code: 'PGRST116' },
            }
          }
          return { data: single ? rows[0] : rows, error: null }
        }
        case 'insert':
        case 'upsert': {
          const payload = request.payload
          const incoming = (Array.isArray(payload) ? payload : [payload]).map(
            (row) => ({
              ...(table === 'import_runs' && { id: `run-${nextId++}` }),
              ...(row as Row),
            })
          )
          const existing = new Map(all.map((row) => [keyOf(table, row), row]))
          // One statement: a conflict fails the whole request.
          if (
            request.op === 'insert' &&
            incoming.some((row) => existing.has(keyOf(table, row)))
          ) {
            return {
              data: null,
              error: { message: 'duplicate key value', code: '23505' },
            }
          }
          for (const row of incoming) {
            const current = existing.get(keyOf(table, row))
            if (current && onConflictUpsert) Object.assign(current, row)
            else all.push(row)
          }
          return {
            data: returning ? (single ? incoming[0] : incoming) : null,
            error: null,
          }
        }
        case 'update': {
          const rows = matches()
          rows.forEach((row) => Object.assign(row, request.payload as Row))
          return { data: returning ? rows : null, error: null }
        }
        case 'delete': {
          const rows = matches()
          tables.set(
            table,
            all.filter((row) => !rows.includes(row))
          )
          return { data: returning ? rows : null, error: null }
        }
      }
    }

    return builder
  }

  return {
    client: { from },
    requests,
    rows: (table: string) => rowsOf(table),
    seed(table: string, rows: Row[]) {
      rowsOf(table).push(...rows.map((row) => ({ ...row })))
    },
    /** Makes every request matching `predicate` fail (until `heal`). */
    failWhen(predicate: (request: FakeRequest) => boolean) {
      failWhen.push(predicate)
    },
    heal() {
      failWhen = []
    },
  }
}

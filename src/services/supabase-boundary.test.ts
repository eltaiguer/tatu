// The ports' invariant: only the Supabase adapters talk to Supabase. Every
// other module reaches user data through a `Repository` and auth through an
// `AuthPort`, both injected at the App root (`main.tsx`) — so tests can swap
// in the in-memory adapters instead of mocking `services/supabase/*`.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

// May import `services/supabase/*` at runtime.
const ADAPTERS = [
  'services/repository/supabase-repository.ts',
  'services/auth/supabase-auth.ts',
]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

// Every module specifier `source` names, in order: `import … from` /
// `export … from` (group 1 is set when the whole statement is `type`-only),
// side-effect `import '…'` and dynamic `import('…')`. `import { type X }` is
// treated as a runtime import on purpose (conservative, and simple).
const SPECIFIER =
  /\b(?:(?:import|export)\s+(type\s+)?[^'"()]*?\bfrom\s+|import\s*\(\s*|import\s+)(['"])([^'"]+)\2/g

/** The `services/supabase` modules `source` loads at runtime. */
function runtimeSupabaseImports(source: string): string[] {
  const found: string[] = []
  for (const [, typeOnly, , from] of source.matchAll(SPECIFIER)) {
    if (!typeOnly && /(^|\/)supabase\//.test(from)) found.push(from)
  }
  return found
}

/**
 * The Supabase SDK packages `source` imports, type-only or not: only
 * `services/supabase/client.ts` builds the client and names its types.
 */
function supabaseSdkImports(source: string): string[] {
  return Array.from(source.matchAll(SPECIFIER), ([, , , from]) => from).filter(
    (from) => from.startsWith('@supabase/')
  )
}

describe('Supabase boundary', () => {
  it('finds every import of the Supabase SDK, type-only ones too', () => {
    const source = [
      "import { createClient } from '@supabase/supabase-js'",
      "import type { Session } from '@supabase/supabase-js'",
      "const auth = await import('@supabase/auth-js')",
      "import { signOut } from '../supabase/auth'",
    ].join('\n')

    expect(supabaseSdkImports(source)).toEqual([
      '@supabase/supabase-js',
      '@supabase/supabase-js',
      '@supabase/auth-js',
    ])
  })

  it('nothing outside services/supabase imports the Supabase SDK', () => {
    const offenders: string[] = []
    for (const path of sourceFiles(SRC)) {
      const file = relative(SRC, path).split(sep).join('/')
      if (file.startsWith('services/supabase/')) continue
      for (const from of supabaseSdkImports(readFileSync(path, 'utf8'))) {
        offenders.push(`${file} -> ${from}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('finds static, side-effect and dynamic imports, but not type-only ones', () => {
    const source = [
      "import { signOut } from '../supabase/auth'",
      "import {\n  a,\n  b,\n} from '../supabase/transactions'",
      "export { x } from './supabase/reset'",
      "import '../supabase/client'",
      "const m = await import('../supabase/ai-insights')",
      'const n = import("../supabase/import-runs")',
      "import type { SupabaseSession } from '../supabase/client'",
      "export type { Row } from '../supabase/transactions'",
      "import { createClient } from '@supabase/supabase-js'",
    ].join('\n')

    expect(runtimeSupabaseImports(source)).toEqual([
      '../supabase/auth',
      '../supabase/transactions',
      './supabase/reset',
      '../supabase/client',
      '../supabase/ai-insights',
      '../supabase/import-runs',
    ])
  })

  it('nothing outside the Supabase adapters imports services/supabase at runtime', () => {
    const offenders: string[] = []
    for (const path of sourceFiles(SRC)) {
      const file = relative(SRC, path).split(sep).join('/')
      if (file.startsWith('services/supabase/') || ADAPTERS.includes(file)) {
        continue
      }
      for (const from of runtimeSupabaseImports(readFileSync(path, 'utf8'))) {
        offenders.push(`${file} -> ${from}`)
      }
    }

    expect(offenders).toEqual([])
  })
})

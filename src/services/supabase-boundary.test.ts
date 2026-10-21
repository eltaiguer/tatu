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

// `import … from '…'` / `export … from '…'` statements, type-only or not.
// Only a whole `import type` counts as type-only: `import { type X }` is
// treated as a runtime import on purpose (conservative, and simple).
const STATEMENT = /\b(import|export)\s+(type\s+)?[^'"]*?\bfrom\s+'([^']+)'/g

describe('Supabase boundary', () => {
  it('nothing outside the Supabase adapters imports services/supabase at runtime', () => {
    const offenders: string[] = []
    for (const path of sourceFiles(SRC)) {
      const file = relative(SRC, path).split(sep).join('/')
      if (file.startsWith('services/supabase/') || ADAPTERS.includes(file)) {
        continue
      }
      for (const [, , typeOnly, from] of readFileSync(path, 'utf8').matchAll(
        STATEMENT
      )) {
        if (!typeOnly && /(^|\/)supabase\//.test(from)) {
          offenders.push(`${file} -> ${from}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})

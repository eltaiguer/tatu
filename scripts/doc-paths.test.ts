// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildIndex,
  findBrokenRefs,
  isPathCandidate,
  selectDocs,
} from './doc-paths.mjs'

const index = buildIndex([
  'CLAUDE.md',
  'package.json',
  'supabase/schema.sql',
  'docs/CONTEXT.md',
  'docs/architecture.md',
  'docs/decisions/README.md',
  'docs/decisions/template.md',
  'src/components/Dashboard.tsx',
  'src/services/currency/convert.ts',
  'src/test/setup.ts',
])

const brokenIn = (doc: string, text: string) =>
  findBrokenRefs(doc, text, index).map((r: { token: string }) => r.token)

describe('isPathCandidate', () => {
  it.each([
    'npm run test:run',
    'claude-opus-4-8',
    '.test.ts',
    '.env',
    '.amt',
    'docs/decisions/000{1,2}-*.md',
    '.claude/**',
    'https://example.com/a.md',
    'VITE_SUPABASE_URL',
    '--color-bg',
    'var(--x)',
    'convert(amount, from, to, rate)',
    'user_preferences.fx_rate',
    'JSON.parse',
    '/insights',
    '/review',
    'vitest/globals',
    'react-dom/client',
    '@testing-library/jest-dom',
    'USD/UYU',
    '<NNNN>-<title>.md',
    'txn_<hash>-<index>',
    'ADR-004-Title.rst',
    "'USD' | 'UYU'",
  ])('ignores %s', (token) => {
    expect(isPathCandidate(token, 'docs', index)).toBe(false)
  })

  it.each([
    'Dashboard.tsx',
    'schema.sql',
    'src/',
    'src/services/missing.ts',
    'services/currency/convert.ts',
    'docs/decisions/',
    'decisions/',
    '../architecture.md',
    'utils/anything.ts',
  ])('checks %s', (token) => {
    expect(isPathCandidate(token, 'docs', index)).toBe(true)
  })
})

describe('findBrokenRefs', () => {
  it('reports a missing src/ path with its line number', () => {
    const text = 'Intro\n\nSee `src/services/gone.ts` for details.\n'
    expect(findBrokenRefs('CLAUDE.md', text, index)).toEqual([
      { doc: 'CLAUDE.md', line: 3, token: 'src/services/gone.ts' },
    ])
  })

  it('resolves paths from the repo root, the doc folder and src/', () => {
    const text = [
      '`supabase/schema.sql` `src/test/setup.ts` `src/`',
      '`services/currency/convert.ts` `../architecture.md` `template.md`',
      '`docs/decisions/` `decisions/`',
    ].join('\n')
    expect(brokenIn('docs/decisions/README.md', text)).toEqual([])
    expect(brokenIn('docs/CONTEXT.md', '`decisions/`')).toEqual([])
  })

  it('resolves bare file names against any file with that name', () => {
    expect(brokenIn('CLAUDE.md', '`Dashboard.tsx` `package.json`')).toEqual([])
    expect(brokenIn('CLAUDE.md', '`Charts.tsx`')).toEqual(['Charts.tsx'])
  })

  it('reports a directory reference only when the directory exists', () => {
    expect(brokenIn('CLAUDE.md', '`src/services/aggregator/`')).toEqual([
      'src/services/aggregator/',
    ])
    expect(brokenIn('CLAUDE.md', '`src/services/currency/`')).toEqual([])
  })

  it('skips lines carrying the historical marker', () => {
    const text = 'Deleted `src/old.ts` long ago. <!-- historical -->'
    expect(brokenIn('docs/decisions/0001-x.md', text)).toEqual([])
  })

  it('ignores fenced code blocks but keeps counting their lines', () => {
    const text = [
      '```ts',
      "import x from '`src/nope.ts`'",
      '```',
      '`src/also-gone.ts`',
    ].join('\n')
    expect(findBrokenRefs('CLAUDE.md', text, index)).toEqual([
      { doc: 'CLAUDE.md', line: 4, token: 'src/also-gone.ts' },
    ])
  })
})

describe('selectDocs', () => {
  it('picks exactly the agent-facing docs', () => {
    expect(
      selectDocs([
        'AGENTS.md',
        'CLAUDE.md',
        'agents.md',
        'README.md',
        'handoff/README.md',
        'supabase/README.md',
        'docs/decisions/0001-x.md',
        '.claude/skills/x/SKILL.md',
        '.claude/skills/x/notes.md',
      ])
    ).toEqual([
      '.claude/skills/x/SKILL.md',
      'AGENTS.md',
      'CLAUDE.md',
      'docs/decisions/0001-x.md',
      'supabase/README.md',
    ])
  })
})

describe('check-doc-paths CLI', () => {
  const script = join(
    dirname(fileURLToPath(import.meta.url)),
    'check-doc-paths.mjs'
  )
  let root = ''

  const fixture = (files: Record<string, string>) => {
    root = mkdtempSync(join(tmpdir(), 'doc-paths-'))
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    return spawnSync(process.execPath, [script, '--root', root], {
      encoding: 'utf8',
    })
  }

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('fails naming the doc and line of a missing src/ path', () => {
    const run = fixture({
      'src/real.ts': '',
      'docs/guide.md': '# Guide\n\nUses `src/real.ts` and `src/missing.ts`.\n',
    })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('docs/guide.md:3: `src/missing.ts`')
    expect(run.stderr).not.toContain('src/real.ts')
  })

  it('passes when every referenced path exists', () => {
    const run = fixture({
      'src/real.ts': '',
      'CLAUDE.md': 'Uses `src/real.ts` and `real.ts`.\n',
    })
    expect(run.status).toBe(0)
  })
})

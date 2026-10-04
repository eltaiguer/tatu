// Fails when agent-facing Markdown names a repo path that doesn't exist
// (#127). Run via `npm run check:docs`; part of `npm run tdd:verify`.
// The rules for what counts as a path live in doc-paths.mjs.
//
// Usage: node scripts/check-doc-paths.mjs [--root <dir>]

import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildIndex, findBrokenRefs, selectDocs } from './doc-paths.mjs'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage'])

// Tracked + untracked-but-not-ignored files, exact case (so a case-insensitive
// macOS disk can't pass what Linux CI would fail). Falls back to a plain walk
// when the root isn't a git checkout (the test fixtures).
function listFiles(root) {
  const git = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' }
  )
  if (git.status === 0 && resolve(gitTopLevel(root)) === root) {
    return git.stdout.split('\0').filter(Boolean)
  }

  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else files.push(relative(root, full).split(sep).join('/'))
    }
  }
  walk(root)
  return files
}

function gitTopLevel(root) {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: root,
    encoding: 'utf8',
  })
  return top.status === 0 ? top.stdout.trim() : ''
}

function main(argv) {
  const rootFlag = argv.indexOf('--root')
  const root = resolve(
    rootFlag === -1
      ? join(dirname(fileURLToPath(import.meta.url)), '..')
      : argv[rootFlag + 1]
  )
  const files = listFiles(root)
  const index = buildIndex(files)
  const docs = selectDocs(files)

  const broken = docs.flatMap((doc) =>
    findBrokenRefs(doc, readFileSync(join(root, doc), 'utf8'), index)
  )
  for (const { doc, line, token } of broken) {
    console.error(`${doc}:${line}: \`${token}\` does not exist in the repo`)
  }
  if (broken.length > 0) {
    console.error(
      `\n${broken.length} broken path reference(s) in ${docs.length} docs. ` +
        'Fix the path, or add <!-- historical --> to the line if it ' +
        'describes code that was removed on purpose.'
    )
    return 1
  }
  console.log(`check:docs: ${docs.length} docs, no broken path references.`)
  return 0
}

process.exitCode = main(process.argv.slice(2))

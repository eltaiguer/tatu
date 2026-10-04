// Pure matcher behind `npm run check:docs` (#127). No I/O lives here: the CLI
// (check-doc-paths.mjs) builds the file index and reads the docs.
//
// What counts as a path reference
// -------------------------------
// Only inline code spans (`like this`) outside fenced code blocks are read.
// A span is a path candidate only when ALL of these hold:
//   1. It has no whitespace and none of  * ? { } ( ) < > | : = $ # @ , ' "
//      [ ] ; ` \  — this drops globs (`000{1,2}-*.md`), commands
//      (`npm run test:run`), URLs, env/CSS vars, templates (`<hash>`) and code.
//   2. It does not start with `/` (routes and slash commands like `/insights`).
//   3. It is not a bare dotfile or extension (`.env`, `.test.ts`, `.amt`):
//      starts with `.` and has no `/`.
//   4. AND either it ends in a known source extension (SOURCE_EXTENSIONS), or
//      it contains `/` and its first segment is `.`/`..`, a top-level repo
//      entry, a top-level `src/` entry, or an entry of the doc's own folder.
//      So `services/currency/convert.ts` and `docs/decisions/` are checked,
//      while `vitest/globals`, `react-dom/client` and `USD/UYU` are not.
//
// How a candidate resolves
// ------------------------
// With a `/`: relative to the repo root, then to the doc's folder, then to
// `src/`. A trailing `/` means a directory (any file under it counts).
// Bare names (`Dashboard.tsx`): the doc's folder, then any file in the repo
// with that exact name.
//
// Opt-out: a line containing `<!-- historical -->` is skipped, so ADRs can
// keep describing code that intentionally no longer exists.

export const SOURCE_EXTENSIONS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'css',
  'md',
  'sql',
  'json',
  'yml',
  'yaml',
  'sh',
  'html',
]

export const OPT_OUT_MARKER = '<!-- historical -->'

const FORBIDDEN = /[\s*?{}()<>|:=$#@,'"[\];`\\]/
const EXTENSION = new RegExp(`\\.(${SOURCE_EXTENSIONS.join('|')})$`)

const dirname = (path) => {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

const basename = (path) => path.slice(path.lastIndexOf('/') + 1)

// Collapses `a/./b` and `a/../b`; returns null if it climbs above the root.
const normalize = (path) => {
  const out = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (out.length === 0) return null
      out.pop()
    } else out.push(part)
  }
  return out.join('/')
}

const join = (dir, path) => normalize(dir ? `${dir}/${path}` : path)

/**
 * Builds the lookup structure from a flat list of repo-relative file paths
 * (forward slashes, exact case).
 */
export function buildIndex(files) {
  const fileSet = new Set(files)
  const dirSet = new Set()
  const basenames = new Set()
  // dir ('' for the root) -> names of its direct children
  const children = new Map()
  const addChild = (dir, name) => {
    if (!children.has(dir)) children.set(dir, new Set())
    children.get(dir).add(name)
  }
  for (const file of files) {
    basenames.add(basename(file))
    let child = file
    let dir = dirname(file)
    for (;;) {
      addChild(dir, basename(child))
      if (!dir) break
      dirSet.add(dir)
      child = dir
      dir = dirname(dir)
    }
  }
  return { fileSet, dirSet, basenames, children }
}

const childrenOf = (index, dir) => index.children.get(dir) ?? new Set()

/** True when an inline code token should be checked as a repo path. */
export function isPathCandidate(token, docDir, index) {
  if (!token || FORBIDDEN.test(token)) return false
  if (token.startsWith('/')) return false
  if (!token.includes('/')) {
    return !token.startsWith('.') && EXTENSION.test(token)
  }
  if (EXTENSION.test(token)) return true
  const first = token.split('/')[0]
  return (
    first === '.' ||
    first === '..' ||
    childrenOf(index, '').has(first) ||
    childrenOf(index, 'src').has(first) ||
    childrenOf(index, docDir).has(first)
  )
}

const exists = (index, path, asDir) => {
  if (path === null) return false
  if (asDir) return path === '' || index.dirSet.has(path)
  return index.fileSet.has(path) || index.dirSet.has(path)
}

/** True when the token names something that exists in the index. */
export function resolves(token, docDir, index) {
  const asDir = token.endsWith('/')
  const path = asDir ? token.slice(0, -1) : token
  if (!token.includes('/')) {
    return exists(index, join(docDir, path), false) || index.basenames.has(path)
  }
  return [join('', path), join(docDir, path), join('src', path)].some((p) =>
    exists(index, p, asDir)
  )
}

/** Blanks fenced code blocks, keeping line numbers intact. */
const blankFences = (lines) => {
  let fence = null
  return lines.map((line) => {
    const match = line.match(/^\s*(`{3,}|~{3,})/)
    if (fence) {
      const closes =
        match && match[1][0] === fence[0] && match[1].length >= fence.length
      if (closes) fence = null
      return ''
    }
    if (match) {
      fence = match[1]
      return ''
    }
    return line
  })
}

/**
 * Returns every inline-code path reference in `text` that doesn't resolve.
 * `docPath` is the doc's repo-relative path.
 */
export function findBrokenRefs(docPath, text, index) {
  const docDir = dirname(docPath)
  const broken = []
  blankFences(text.split('\n')).forEach((line, i) => {
    if (line.includes(OPT_OUT_MARKER)) return
    for (const [, token] of line.matchAll(/`([^`]+)`/g)) {
      if (!isPathCandidate(token, docDir, index)) continue
      if (!resolves(token, docDir, index)) {
        broken.push({ doc: docPath, line: i + 1, token })
      }
    }
  })
  return broken
}

/** Docs the guard scans, picked from the index (exact case, so CI agrees). */
export function selectDocs(files) {
  return files
    .filter(
      (f) =>
        f === 'CLAUDE.md' ||
        f === 'AGENTS.md' ||
        f === 'agents.md' ||
        f === 'supabase/README.md' ||
        /^\.claude\/skills\/.+\/SKILL\.md$/.test(f) ||
        /^docs\/.+\.md$/.test(f)
    )
    .sort()
}

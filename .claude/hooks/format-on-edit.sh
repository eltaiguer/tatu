#!/bin/bash
# PostToolUse hook (Edit|Write): runs the repo's Prettier on the file Claude
# just touched, so `npm run format:check` doesn't fail agent runs.
#
# Formats only src/**/*.{ts,tsx,css,json,md}, docs/**/*.md and root *.md.
# Always exits 0: a missing node/Prettier, a non-matching file or a Prettier
# error is a no-op — the edit already happened and must never be reported as
# failed. Reads the hook JSON from stdin (tool_input.file_path).

INPUT=$(cat)

command -v node >/dev/null 2>&1 || exit 0

FILE_PATH=$(printf '%s' "$INPUT" | node -e '
let s = ""
process.stdin.on("data", (c) => (s += c))
process.stdin.on("end", () => {
  try {
    const p = JSON.parse(s)?.tool_input?.file_path
    if (typeof p === "string") process.stdout.write(p)
  } catch {}
})
' 2>/dev/null)

[ -n "$FILE_PATH" ] || exit 0
[ -f "$FILE_PATH" ] || exit 0

# Resolve against the checkout that owns the file (works in agent worktrees,
# where CLAUDE_PROJECT_DIR still points at the main checkout).
FILE_DIR=$(cd "$(dirname "$FILE_PATH")" 2>/dev/null && pwd -P) || exit 0
ROOT=$(git -C "$FILE_DIR" rev-parse --show-toplevel 2>/dev/null) || exit 0
ROOT=$(cd "$ROOT" && pwd -P) || exit 0
ABS="$FILE_DIR/$(basename "$FILE_PATH")"
REL="${ABS#"$ROOT"/}"
[ "$REL" != "$ABS" ] || exit 0

case "$REL" in
  src/*.ts | src/*.tsx | src/*.css | src/*.json | src/*.md) ;;
  docs/*.md) ;;
  */*) exit 0 ;;
  *.md) ;;
  *) exit 0 ;;
esac

PRETTIER="$ROOT/node_modules/.bin/prettier"
[ -x "$PRETTIER" ] || exit 0

(cd "$ROOT" && "$PRETTIER" --write --log-level warn "$REL") >/dev/null 2>&1
exit 0

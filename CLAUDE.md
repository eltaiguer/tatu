@AGENTS.md

# CLAUDE.md - Claude Code specifics

The line above imports `AGENTS.md`, the canonical project rules (mission, commands, structure, conventions, strict red-green TDD, definition of done, commit conventions, current status). Edit rules there, not here — this file holds only what is specific to Claude Code.

## Session start hook and skills

- `.claude/settings.json` is shared Claude Code config: the verification commands (plus read-only `gh`/`git`) run without a prompt, deploys always prompt, force-push and `.env*` edits (except `.env.example`) are denied, and a PostToolUse hook (`.claude/hooks/format-on-edit.sh`) runs Prettier on edited `src/` and Markdown files.
- It also registers a `SessionStart` hook (`startup|clear`) that runs `.claude/hooks/session-start.sh`. It injects `.claude/skills/using-agent-skills/SKILL.md` (the skill router) as additional context. It needs `jq` on the `PATH`; without it the hook silently does nothing.
- Repo skills live in `.claude/skills/` and hold Tatu-specific checklists: `using-agent-skills` (pick the right skill), `run` (run the app locally), `add-supabase-column`, `change-categorization`, `add-view`, `money-math`, `change-ai-prompt-or-model`. Load the matching skill before starting the kind of work it describes. Generic skills (e.g. `doubt-driven-development`) live in a contributor's user scope and are optional.
- Skill files are agent-facing docs: the `check:docs` guard validates the repo paths they name.

## Memory

Claude Code's auto-memory is per-user and lives outside the repo. It can hold preferences and history, but it is not a source of truth for project rules: when memory and `AGENTS.md` disagree, `AGENTS.md` (and the code) win — update or drop the stale memory.

## Worktrees, Playwright and running the app

- Agent worktrees are created in a `worktrees` folder under `.claude`. Vitest excludes `.claude/**` so tests don't run twice, and Prettier ignores the worktrees too. Run commands from inside your own worktree.
- Playwright MCP scratch output goes to the gitignored `.playwright-mcp` folder; don't commit it or screenshots from sessions.
- To run, open or screenshot the app, use the `run` skill (`.claude/skills/run/SKILL.md`): local Supabase via `npm run dev:backend`, seeded dev user, screenshots under the gitignored `screenshots` or `.playwright-mcp` folders, teardown. Never point a session at production data.

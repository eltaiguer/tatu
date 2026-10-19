---
name: using-agent-skills
description: Discovers which skill applies to the current task in Tatu. Use at the start of any non-trivial task, or whenever unsure which skill fits.
---

# Using agent skills (Tatu)

Before non-trivial work (more than a one-line fix), load the skill that matches
the task. Several can apply; chain them.

## Repo skills (`.claude/skills/`)

| Task                                                                     | Skill                       |
| ------------------------------------------------------------------------ | --------------------------- |
| Add a column or table to `supabase/schema.sql`, persist a new field      | `add-supabase-column`       |
| Add or adjust a merchant pattern, keyword, confidence or precedence rule | `change-categorization`     |
| Add, rename or remove a view / route                                     | `add-view`                  |
| Totals, conversion, FX rate, home currency, transfers, splits            | `money-math`                |
| A Claude prompt, model ID, or what is sent to / parsed from Claude       | `change-ai-prompt-or-model` |
| Run, open or screenshot the app; check a UI change in the real app       | `run`                       |

## Optional skills (if available)

These live in a contributor's user scope or a plugin, not in this repo. Use
them when present; when missing, carry on without them.

- `doubt-driven-development` — fresh-context review of money math and
  categorization changes.
- `frontend-ui-engineering`, `dataviz` — components, layouts, charts and KPI
  tiles (charts live in `src/components/Dashboard.tsx`).
- `source-driven-development` — check a Radix / Recharts / supabase-js /
  Zustand / Vite API against its docs.
- `claude-api` — Anthropic SDK and model facts.
- `documentation-and-adrs` — record a decision in `docs/decisions/`.
- `simplify`, `security-review` — before finishing; `security-review` also for
  auth, RLS, env vars or a deploy.

Tatu deploys to Firebase Hosting: skip `vercel:*` skills.

## Done means

Skills add to `AGENTS.md`, they don't replace it: strict red-green TDD, and
`npm run tdd:verify` (Prettier, `check:docs`, tests, lint) passing.

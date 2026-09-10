---
name: using-agent-skills
description: Discovers which skill applies to the current task in Tatu. Use at the start of any non-trivial task, or whenever unsure which skill fits.
---

# Using Agent Skills (Tatu)

## Overview

This repo has skills for the situations that actually recur here: React/TS UI work, Supabase/Radix/Recharts API usage, financial-correctness-sensitive logic, and the upcoming AI-categorization work. Check this list before starting non-trivial work.

Skills named below with no path prefix are personal (global) skills available in this environment; they may not exist for every future contributor. If a named skill isn't available, proceed without it rather than blocking.

## Discovery

```
Task arrives
    │
    ├── Building/modifying a component, view, or dialog? ──→ frontend-ui-engineering
    │   └── Visual/aesthetic decisions (layout, color, typography)? ──→ frontend-design:frontend-design
    ├── Touching Charts.tsx, a chart, KPI tile, or any data viz? ──→ dataviz
    ├── Currency conversion, categorization rules, transfer detection,
    │   apply-scope edits, or anything touching real money data? ──→ doubt-driven-development
    │   (this is the highest-stakes correctness surface in the app)
    ├── Using a Radix/Recharts/Supabase-js/Zustand/Vite API you're
    │   not 100% sure of from memory? ──────────────────────────→ source-driven-development
    ├── AI-powered categorization work (the current initiative) —
    │   model choice, prompts, LLM API usage? ────────────────────→ claude-api
    ├── A significant architectural decision or schema change? ───→ documentation-and-adrs
    ├── Adding error visibility for import/parse/sync/categorization
    │   failures (this is a client-side app — no backend RED metrics,
    │   just: can a user or you tell what went wrong)? ───────────→ observability-and-instrumentation
    ├── Finished an implementation, before calling it done? ───────→ simplify
    ├── UI change — verify it in the actual running app? ──────────→ run
    └── About to deploy (npm run deploy:firebase), or touching
        auth/Supabase RLS/env vars? ─────────────────────────────→ security-review
```

Not relevant here: this app deploys to **Firebase Hosting**, not Vercel — skip all `vercel:*` skills regardless of how close a description reads.

## Core Rules

1. **Check before starting.** Non-trivial = more than a one-line fix. A bug fix in an isolated util doesn't need this; adding a component, changing money-math, or wiring a new integration does.
2. **Multiple skills can chain.** A new dashboard tile might go `frontend-ui-engineering` → `dataviz` → `simplify` → `run`.
3. **Doubt-driven-development is not optional for money math.** Currency conversion, categorization confidence, and transfer detection are the app's core trust surface — cross-examine changes there even when they look obviously correct.
4. **Still finish with `npm run tdd:verify`** (tests + lint) regardless of which skills ran — per CLAUDE.md's testing approach, this is the actual definition of done, skills are additive to it, not a replacement.

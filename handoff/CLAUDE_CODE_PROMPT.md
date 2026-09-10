# Prompt for Claude Code

Run this from the root of the `tatu/` repo, with the `design_handoff_tatu_redesign/`
folder placed inside it. Paste the block below to Claude Code.

---

```
You are implementing a UI/IA redesign + multicurrency rework of this app
(Tatú, a Santander Uruguay expense tracker). The complete design spec is in
`design_handoff_tatu_redesign/`.

READ FIRST, in this order:
0. design_handoff_tatu_redesign/CHANGES_2026-06_merge-and-source-cards.md — the
   LATEST authoritative change spec. It merges Análisis into Resumen and changes
   the top cards to expense-by-source (styled neutrally). It OVERRIDES any
   conflicting text below or in README.md. Source of truth for these screens is
   prototype/screen-home.jsx.
0b. design_handoff_tatu_redesign/CORRECTIONS.md — if the redesign is already partly
   built, START HERE. It is the authoritative punch-list for the known regressions
   (fonts, labels, a few UI elements) and overrides any conflicting prose below.
1. design_handoff_tatu_redesign/README.md  — full spec. Pay special attention to
   the "Multicurrency model" section and the prototype→file mapping table.
2. design_handoff_tatu_redesign/IMPLEMENTATION_CHECKLIST.md — the PR plan (1→5,
   plus PR 4.5 for multicurrency).
3. design_handoff_tatu_redesign/prototype/ — the prototype is the SOURCE OF TRUTH for
   every string, size, and component. When this prose disagrees with the prototype,
   the prototype wins. styles.css = exact tokens.
4. design_handoff_tatu_redesign/screenshots/ — target look, light + dark.

GOAL: make the real app look and behave exactly like the prototype.

HARD CONSTRAINTS:
- Recreate the design in THIS codebase's stack (React 18 + TS + Vite + Tailwind +
  Radix/shadcn ui in src/components/ui + Zustand + Recharts). Do NOT copy the HTML
  prototype verbatim, and do NOT use react@babel — use the real components.
- Reuse existing logic: the transaction store, parsers, categorizer, export, and
  Supabase sync. This is a re-wire + re-token + new-aggregation job, not a rewrite
  of business logic.
- Multicurrency: add `homeCurrency` (default USD) and `fxRate` to the store
  (persisted). Convert + COMBINE both currencies into the home currency for all
  Resumen/Análisis totals; keep native amounts primary in transaction rows with a
  faint "≈ converted" secondary. Currency stays a FILTER in Transacciones, not a
  dashboard splitter. Port convert() + the selectors as pure, tested TS functions.
- Follow repo conventions in CLAUDE.md (Prettier: no semicolons, single quotes,
  2-space; ESLint zero warnings; kebab-case files; tests colocated).
- Use lucide-react for icons (the prototype only inlines paths because it has no
  bundler).
- Apply the LATEST spec: Análisis is merged into Resumen (no separate view), and
  the 3 top cards show expenses by source styled neutrally (no red expense
  amounts). See CHANGES_2026-06_merge-and-source-cards.md and its acceptance list.
- Keep the teammate fixes baked into the spec: privacy copy must say data is
  synced securely to the user's account (NOT "local only / never sent to a
  server"); the sidebar shows the user's email, not a hardcoded bank name.

WORKFLOW:
- Implement PR by PR in the checklist order. Pause after each PR.
- After each PR run `npm run tdd:verify` and fix until green; add/adjust tests for
  moved/new behavior (new Categories.tsx / Settings.tsx, unified filters,
  conversion selectors, net-cashflow).
- Before finishing, run `npm run ci:check` and confirm: no "Herramientas" view
  remains, Import is an overlay (not a tab), filtering lives only in Transacciones,
  and Resumen/Análisis totals are converted + combined into the home currency.

Start with PR 1 (design tokens + fonts). Show me the diff, then wait for my
go-ahead before PR 2.
```

---

**Tip:** if your Claude Code runs autonomously you can drop the last line and let it
work straight through; the pause-after-each-PR version just gives cleaner review
checkpoints (PR 1 re-themes the whole app at once, so it's a good first checkpoint).

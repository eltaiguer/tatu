---
name: change-categorization
description: Checklist for changing how Tatu auto-categorizes transactions. Use when adding or adjusting a merchant pattern, keyword list, confidence value or categorizer precedence rule, or when a transaction lands in the wrong category.
---

# Change a merchant pattern or categorization rule

A rule decides which category real money lands in, and every past and future
import goes through it. Read "Categorizer precedence" in
`docs/architecture.md` before you start: `categorizeTransaction` in
`src/services/categorizer/transaction-categorizer.ts` returns the **first**
match in a fixed order, so a new rule can be shadowed by an earlier source
(overrides, custom patterns, fee/transfer/income keywords) or shadow a later
one.

## Steps

1. **Red.** Write the failing test with the real Santander description text
   (copy it from `samples/` or the bug report):
   - a merchant pattern → `src/services/categorizer/merchant-patterns.test.ts`;
   - keywords, precedence or confidence → `transaction-categorizer.test.ts`.
     Pin the neighbour too: a description the change must **not** capture
     (e.g. a transfer that mentions the merchant).
2. **Green.**
   - Merchant pattern: add the lowercase substring to `MERCHANT_PATTERNS` in
     `src/services/categorizer/merchant-patterns.ts`. Base confidence stays in
     0.75–0.95: more specific strings get the higher value (see the two
     `devoto` entries). Partial and fuzzy matches scale it down; the
     highest-confidence match wins.
   - Keywords (`FEE_KEYWORDS`, `TRANSFER_KEYWORDS`, `INCOME_KEYWORDS`) live in
     `transaction-categorizer.ts`.
   - A precedence change also updates the precedence table in
     `docs/architecture.md` in the same PR.
3. **Golden fixture.** `import-categorization.equivalence.test.ts` pins the
   category, confidence and display name of every row in the three sample
   CSVs (`src/services/categorizer/__fixtures__/sample-categorization.json`).
   An intended change fails it. Regenerate:

   ```bash
   UPDATE_FIXTURE=1 npx vitest run src/services/categorizer/import-categorization.equivalence.test.ts
   ```

   Read the fixture's `git diff`: every changed row should be one you meant to
   change. Commit the fixture with the rule. Unexpected rows mean the pattern
   is too broad.

4. **Review the money impact.** Precedence and confidence are the
   correctness surface of the app — get a fresh-context review of the diff
   (the `doubt-driven-development` skill, if available) before calling it done.

## Gotchas

- Import categorization runs without a `CategorizationContext`: temporal,
  similar-merchant and amount heuristics (steps 9–11) never run at import.
- With AI enabled, `applyAiEnrichment` replaces the rule result for new rows
  without a user override, so a pattern change may not show in a test import
  with AI on.
- Rows at confidence 1 (user edits) are never recategorized. Existing rows
  only change through "Auto-categorizar" or a rule applied to past rows.
- The local seed only inserts rows the stack doesn't have yet, so to see a
  pattern change in the running app wipe it first:
  `npx supabase stop --no-backup`, then `npm run dev:backend`.

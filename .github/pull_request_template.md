<!--
Rules live in AGENTS.md (canonical): strict red-green TDD, Definition of done,
commit conventions. This template only asks for the evidence.
-->

## Summary

What this PR changes and why, in a few lines.

## Behaviour change

What a user (or caller) can observe that is different after this PR. Write
"None — docs/tooling only" if nothing changes.

## TDD evidence

Docs-only and tooling-only changes with no behaviour to test may write "N/A —
no behaviour change" here; they still need `npm run tdd:verify` below.

### RED

The test(s) written first, and their failure output before the fix. It must
fail for the right reason (the missing-behaviour assertion — not an import
error, typo or broken fixture).

- Test name(s):
- Failure output:

```text

```

### GREEN

The same test(s) passing after the minimal change.

```text

```

### REFACTOR (optional)

Cleanup done with the tests green, if any.

## Bug fixes only

- [ ] A regression test reproduces the bug and was seen failing before the fix
      (it is listed under RED)

## Verification

- [ ] `npm run tdd:verify` passes (Prettier check + `check:docs` + tests +
      lint)
- [ ] `npm run build` passes (when TypeScript changed)
- [ ] No deleted or skipped tests without an explanation

## Schema change

- [ ] No
- [ ] Yes — this PR changes `supabase/schema.sql`. The SQL is applied by hand
      (see [`supabase/README.md`](https://github.com/eltaiguer/tatu/blob/main/supabase/README.md)); tag the PR
      `needs-human-review` and leave the merge to a human.

## Linked issue

Closes #

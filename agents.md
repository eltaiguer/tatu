# AGENTS Configuration

## Mandatory Working Mode: TDD

All coding tasks must follow strict Test-Driven Development.

### Required cycle (no exceptions)

1. RED
- Add or update tests first.
- Run the relevant tests and confirm they fail for the expected reason.

2. GREEN
- Implement the minimal code needed to pass the new failing tests.
- Run tests again and confirm they pass.

3. REFACTOR
- Improve structure while preserving behavior.
- Re-run full relevant tests after refactoring.

### Operational rules for agents

- Do not implement behavior changes without first creating/updating tests.
- Do not mark work complete unless tests were executed and passed.
- For bug fixes: first reproduce with a failing test, then fix.
- Keep commits aligned with TDD phases when practical:
  - `test:` for RED
  - `feat:`/`fix:` for GREEN
  - `refactor:` for REFACTOR

### Definition of done

A task is done only when:
- New/updated tests exist for the behavior.
- Relevant test suite passes.
- Existing behavior remains covered.

### Commit/PR conventions

Follow the detailed commit and PR conventions in
`/Users/jose/Projects/jose/tatu/agents.md`.

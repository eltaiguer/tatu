# AGENTS Configuration

## Working Mode: Behavior Testing

All coding tasks must include tests that verify observable behavior.

### Operational rules for agents

- Every feature and bug fix should include tests covering the behavior change.
- Bug fixes should include a regression test.
- Do not mark work complete unless tests were executed and passed.
- Tests describe what the system does, not how — avoid testing implementation details.

### Commit conventions

- `test:` for test files
- `feat:` for new features
- `fix:` for bug fixes
- `refactor:` for code improvements

### Definition of done

A task is done only when:
- Tests exist for the new/changed behavior.
- Relevant test suite passes.
- Existing behavior remains covered.

# TDD Workflow

This project follows strict Test-Driven Development.

## Rule

Every behavior change must follow:

1. `RED`: Write or update a test that fails for the new behavior.
2. `GREEN`: Implement the minimal code needed to pass.
3. `REFACTOR`: Clean up while keeping tests green.

Do not skip the failing-test step.

## Local Commands

- Start TDD loop: `npm run tdd:watch`
- Verify before commit: `npm run tdd:verify`
- Full CI-equivalent check: `npm run ci:check`

## Pull Request Expectations

- Include test changes for behavior changes.
- Describe `RED -> GREEN -> REFACTOR` in the PR description.
- Keep changes small and logically scoped.


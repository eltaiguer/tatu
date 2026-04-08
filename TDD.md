# Testing Workflow

This project uses behavior testing — tests verify what the system does, not how it does it.

## Rule

Every feature and bug fix should include tests that cover the observable behavior. Tests are written alongside implementation, not strictly test-first.

## Local Commands

- Watch tests: `npm run tdd:watch`
- Verify before commit: `npm run tdd:verify`
- Full CI-equivalent check: `npm run ci:check`

## Pull Request Expectations

- Include tests for behavior changes.
- Bug fixes should include a regression test.
- Keep changes small and logically scoped.


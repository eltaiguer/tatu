# Agent Development Guidelines

This document specifies how AI agents (and human developers) should write commits and pull requests for the Tatu project.

## Commit Message Format

### Structure

```
<type>: <short summary>

<detailed description>

<breaking changes if any>
```

### Commit Types

Use these prefixes for commit messages:

- `feat:` - New features or functionality
- `fix:` - Bug fixes
- `test:` - Adding or updating tests
- `refactor:` - Code refactoring without changing behavior
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, missing semi-colons, etc.)
- `perf:` - Performance improvements
- `chore:` - Build process, dependency updates, tooling
- `ci:` - CI/CD configuration changes

### Commit Message Rules

1. **Short Summary (First Line)**
   - Max 72 characters
   - Lowercase after the type prefix
   - No period at the end
   - Imperative mood ("add feature" not "added feature")

2. **Detailed Description (Body)**
   - Separate from summary with a blank line
   - Explain WHAT changed and WHY
   - Use bullet points for multiple changes
   - Group related changes together (by Heat/feature)
   - Include test counts when relevant
   - Wrap at 72 characters per line

3. **Breaking Changes**
   - Start with "BREAKING CHANGE:" if applicable
   - Explain what breaks and how to migrate

4. **Keep it Clean**
   - No unnecessary attribution footers
   - Focus on clear, technical communication

### Commit Examples

#### Example 1: Feature Commit

```
feat: add merchant pattern matcher for auto-categorization

Complete Heat 2.2 (Build Merchant Pattern Matcher):
- Implement normalizeMerchantName function
- Create pattern matching algorithm with confidence scoring
- Add 50+ Uruguayan merchant patterns across 17 categories
  - Groceries: Devoto, Supermercado, Provicentro
  - Utilities: Antel, UTE, OSE
  - Software: Jetbrains, Atlassian, AWS, OpenAI
  - Entertainment: Spotify, Netflix, Disney, HBO
- Handle partial matches with reduced confidence
- Integrate getMerchantCategory into parsers
- Add 46 comprehensive tests (all passing)

Merchants are now automatically categorized during CSV parsing
with confidence scores ranging from 0.75 to 0.95.
```

#### Example 2: Test Commit

```
test: add integration tests for CSV auto-detection

- Test credit card CSV detection with encoding issues
- Test USD bank account detection
- Test UYU bank account detection
- Test fallback behavior for unknown formats
- Add edge cases for malformed CSVs

All 10 tests passing. Coverage at 98%.
```

#### Example 3: Fix Commit

```
fix: handle special characters in CSV header detection

The CSV auto-detection was failing on credit card files due to
special characters (ú, é, í) in header fields like "Número de
tarjeta de crédito".

Changes:
- Update detection to use partial patterns without special chars
- Check for "tarjeta de cr" instead of full "tarjeta de crédito"
- Add encoding-agnostic header detection
- Update tests to cover special character edge cases

Fixes issue where credit card CSVs were not being detected.
```

#### Example 4: Refactor Commit

```
refactor: extract transaction parsing utilities

- Move parseSantanderNumber to utils.ts
- Move parseSantanderDate to utils.ts
- Move generateTransactionId to utils.ts
- Add comprehensive unit tests for utilities (22 tests)
- Update parsers to import from utils

No functional changes. All 195 tests still passing.
```

---

## Pull Request Format

### PR Title

Use the same format as commit messages:

```
<type>: <short summary>
```

### PR Description Template

```markdown
## Summary
Brief overview of what this PR accomplishes (1-3 sentences).

## Heat/Sprint
Heat X: [Heat Name]

## Changes
- Bullet point list of key changes
- Group by feature or component
- Include file paths for major changes

## Tests
- X new tests added
- All tests passing (X/X)
- Coverage: X%

## Screenshots/Demo
[If UI changes, include screenshots or GIFs]

## Breaking Changes
[If any, describe what breaks and migration path]

## Checklist
- [ ] Tests written and passing
- [ ] Linting passes (no warnings)
- [ ] Documentation updated (if needed)
- [ ] PROJECT_BOARD.md updated
- [ ] Follows TDD methodology
- [ ] No console errors or warnings

## Related Issues
Closes #X (if applicable)
```

### PR Examples

#### Example 1: Feature PR

```markdown
# feat: category inference engine with merchant patterns

## Summary
Implements automatic transaction categorization based on merchant names using pattern matching. Completes Heat 2.1 and 2.2 of the project roadmap.

## Heat/Sprint
Heat 2: Category Inference Engine

## Changes

### Category System (Heat 2.1)
- Created `src/models/category.ts` with 17 categories
- Added CATEGORY_LABELS and CATEGORY_ICONS mappings
- Helper functions: isExpenseCategory, isIncomeCategory, etc.
- 32 comprehensive tests

### Merchant Pattern Matcher (Heat 2.2)
- Created `src/services/categorizer/merchant-patterns.ts`
- Pattern matching database with 50+ Uruguayan merchants
- normalizeMerchantName for consistent matching
- getMerchantCategory with confidence scoring
- 46 comprehensive tests

### Parser Integration
- Updated `src/services/parsers/credit-card-parser.ts`
- Updated `src/services/parsers/bank-account-parser.ts`
- Added categoryConfidence field to Transaction interface
- Auto-categorization during parsing

### UI Updates
- Updated `src/components/ParsedDataDisplay.tsx`
- Category column with icons in transaction table
- Fallback UI for uncategorized transactions

## Tests
- 78 new tests added
- All tests passing (195/195)
- Coverage: 96%

## Screenshots
[Screenshot of transaction table with category badges]

## Checklist
- [x] Tests written and passing
- [x] Linting passes (no warnings)
- [x] Documentation updated
- [x] PROJECT_BOARD.md updated
- [x] Follows TDD methodology
- [x] No console errors or warnings
```

---

## Best Practices

### Commit Frequency

- **Commit early and often** following TDD cycles
- One commit per logical change
- Commit after each test passes (GREEN phase)
- Commit after refactoring

### Commit Granularity

**Good** - Focused commits:
```
test: add merchant pattern normalization tests
feat: implement merchant pattern normalization
test: add pattern matching confidence tests
feat: implement pattern matching with confidence
```

**Bad** - Too large:
```
feat: add entire category system with tests and UI
```

**Bad** - Too small:
```
fix: add semicolon
fix: fix typo
fix: remove console.log
```

### When to Commit

Following TDD (Red-Green-Refactor):

1. **After writing tests** (RED):
   ```
   test: add tests for transaction categorizer
   ```

2. **After making tests pass** (GREEN):
   ```
   feat: implement transaction categorizer
   ```

3. **After refactoring** (REFACTOR):
   ```
   refactor: simplify categorization logic
   ```

### Multi-File Changes

When changes span multiple files:

```
feat: add category system across application

Models:
- src/models/category.ts - Define category enum and helpers
- src/models/transaction.ts - Add category fields

Services:
- src/services/categorizer/merchant-patterns.ts - Pattern matcher

Parsers:
- src/services/parsers/credit-card-parser.ts - Integration
- src/services/parsers/bank-account-parser.ts - Integration

UI:
- src/components/ParsedDataDisplay.tsx - Display categories

Tests: 78 new tests, all passing
```

---

## Git Workflow

### Branch Naming

- Always work on a feature branch; do not commit directly to `main`.
- `main` - Production-ready code
- `heat-X-feature-name` - Feature branches for each Heat
- `fix/issue-description` - Bug fixes
- `test/feature-name` - Test additions

### Before Committing

1. Run tests: `npm test`
2. Run linting: `npm run lint`
3. Check formatting: `npm run format`
4. Verify no console errors

### Commit Command

Use heredoc for multi-line messages:

```bash
git commit -m "$(cat <<'EOF'
feat: your feature title

Detailed description here.
Multiple lines supported.
EOF
)"
```

---

## TDD Commit Flow

Example flow for adding a new feature:

```bash
# 1. Write failing test
git add src/services/feature.test.ts
git commit -m "test: add tests for feature X"

# 2. Implement feature (make tests pass)
git add src/services/feature.ts
git commit -m "feat: implement feature X"

# 3. Refactor if needed
git add src/services/feature.ts
git commit -m "refactor: simplify feature X logic"

# 4. Update documentation
git add PROJECT_BOARD.md
git commit -m "docs: mark Heat X.Y as complete"
```

---

## Anti-Patterns to Avoid

❌ **Don't:**
- Commit without running tests
- Use vague messages like "fix stuff" or "update code"
- Commit commented-out code
- Commit console.log statements
- Mix multiple unrelated changes in one commit
- Commit generated files (node_modules, dist, .DS_Store)

✅ **Do:**
- Write descriptive commit messages
- Keep commits focused and atomic
- Run tests before committing
- Include relevant context in commit body
- Group related changes logically
- Update PROJECT_BOARD.md when completing tasks

---

## Questions?

If unsure about commit message format:
1. Check recent commits: `git log --oneline -10`
2. Review this guide
3. When in doubt, be more descriptive rather than less

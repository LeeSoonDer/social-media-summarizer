# Coding Rules

## General Standards
- Prefer simple vanilla JavaScript for MVP.
- Keep changes scoped to the current feature or bug.
- Avoid unnecessary rewrites or framework migration.
- Use descriptive function names.
- Keep user-facing error messages clear and actionable.

## Naming Conventions
- JavaScript functions: `camelCase`.
- Constants: `UPPER_SNAKE_CASE` for true constants, otherwise `camelCase` or `PascalCase` only when appropriate.
- Message actions: short strings like `ping`, `extract`, `extractWithImages`.

## Formatting Rules
- Use UTF-8 without BOM.
- Preserve Chinese UI copy correctly.
- Prefer semicolons consistently with existing files.
- Avoid large generated comments.

## Modularity Rules
- `popup.js` handles extension popup flow and API calls.
- `content.js` handles DOM extraction only.
- `options.js` handles settings storage only.
- Do not mix platform extraction logic into popup code.

## Testing Philosophy
- Run `node --check` on modified JavaScript files when possible.
- Manually reload unpacked extension after code changes.
- Test on real supported pages because DOM structures change frequently.
- When API errors occur, preserve exact error details for diagnosis.

## Documentation Expectations
- Update `ai/current_state.md` after meaningful progress.
- Update `ai/decisions.md` for architectural or product decisions.
- Update `ai/known_issues.md` when a recurring bug or external limitation is discovered.

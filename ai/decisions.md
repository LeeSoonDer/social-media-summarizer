# Decisions

## 2026-05-22 - Use Chrome Extension as Product Form
Decision: Build Social Summarizer as a Chrome Extension.
Reason: It provides the lowest-friction UX and can access the current logged-in page context.
Tradeoff: Browser extension APIs and platform review rules constrain implementation.
Future Implications: Production release should go through Chrome Web Store.

## 2026-05-22 - Use Vanilla JavaScript and Manifest V3 for MVP
Decision: Use native Manifest V3 with vanilla JS.
Reason: The developer is learning and the MVP does not require a framework.
Tradeoff: Less structure than a framework as code grows.
Future Implications: Revisit modularization only when file complexity becomes painful.

## 2026-05-22 - No Backend for MVP
Decision: Call Gemini directly from the extension during MVP.
Reason: Fastest path to validate extraction and summarization UX.
Tradeoff: API key is stored client-side and not suitable for public multi-user production.
Future Implications: Add backend before serious public launch if key protection, quotas, billing, or analytics are needed.

## 2026-05-22 - GitHub as Source Control, Local Folder as Runtime During Development
Decision: Use GitHub as the remote source of truth, but run the extension from a local unpacked folder during development.
Reason: Chrome does not run unpacked extensions directly from GitHub.
Tradeoff: Developer must reload extension after local changes.
Future Implications: Chrome Web Store will become the production distribution/update channel.

## 2026-05-22 - Add Markdown AI Memory System
Decision: Maintain project memory in `ai/` markdown files.
Reason: Chat context is temporary and grows stale; markdown memory keeps decisions and state portable across AI tools.
Tradeoff: Requires regular updates.
Future Implications: New AI sessions should read `ai/project_overview.md`, `ai/current_state.md`, `ai/architecture.md`, `ai/coding_rules.md`, and `ai/decisions.md` first.

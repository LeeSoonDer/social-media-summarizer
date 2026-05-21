# Architecture

## Product Form
Chrome Extension using Manifest V3 and vanilla JavaScript.

## Frontend Architecture
- `popup.html`: extension popup UI.
- `popup.js`: orchestrates active tab detection, content extraction, Gemini API calls, summary rendering, and error display.
- `options.html`: settings UI for saving Gemini API key.
- `options.js`: stores API key in `chrome.storage.local`.

## Content Extraction Architecture
- `content.js` runs on supported Xiaohongshu and Instagram pages.
- It detects platform from `location.hostname`.
- It extracts title, body, tags, image URLs, and limited image base64 data.
- It responds to popup messages:
  - `ping`: confirms content script is connected.
  - `extract`: returns text and image URLs.
  - `extractWithImages`: returns text plus base64 image data when fetch succeeds.

## AI Request Architecture
- MVP directly calls Gemini API from `popup.js`.
- API key is stored locally in the user's browser using `chrome.storage.local`.
- Current model preference order:
  - `gemini-2.5-flash-lite`
  - `gemini-2.5-flash`
  - `gemini-2.0-flash`
- Request attempts image+text first, then text-only fallback.
- Rate-limit errors should preserve specific provider messages for debugging.

## Backend Architecture
- MVP has no backend.
- Future backend may be needed for public release to protect API keys, add auth, manage quotas, logging, billing, and abuse prevention.

## Database Structure
- No database in MVP.
- Future versions may store user preferences, usage history, cached summaries, or team accounts if the product evolves beyond a local extension.

## Infrastructure Choices
- Development: local unpacked Chrome Extension folder.
- Source control: GitHub.
- Production target: Chrome Web Store.

## API Design Philosophy
- Keep MVP request path simple and observable.
- Prefer explicit error messages over vague failure labels.
- Avoid hiding provider errors during early development.
- Keep extraction payload small to reduce cost and rate-limit pressure.

## System Patterns
- One file per extension surface where possible.
- Platform-specific extraction helpers stay in `content.js` until complexity justifies splitting.
- `popup.js` owns orchestration; `content.js` owns DOM extraction.
- Avoid backend until there is a concrete security, quota, or product requirement.

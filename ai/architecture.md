# Architecture

## Product Form
Chrome Extension using Manifest V3 and vanilla JavaScript.

## Frontend Architecture
- `popup.html`: compact extractor popup UI.
- `popup.js`: active tab detection, content script injection, extraction request, markdown formatting, copy action, and error display.
- `options.html` / `options.js`: legacy Gemini API key settings. Not part of current default extraction flow.

## Content Extraction Architecture
- `content.js` runs on supported social platforms and can also be injected into ordinary HTTP/HTTPS pages after user clicks the extension.
- It detects platform from `location.hostname`.
- It routes to platform-specific extractors:
  - `extractXiaohongshu`
  - `extractInstagram`
  - `extractTwitter`
  - `extractReddit`
  - `extractYouTube`
  - `extractLinkedIn`
  - `extractFacebook`
  - `extractGeneric`
- Each extractor returns structured content:
  - platform
  - url
  - title
  - author
  - body
  - transcript
  - tags
  - mentions
  - comments
  - images
  - videos
  - links
  - metadata

## AI Request Architecture
- Current default flow does not call any LLM API.
- User manually copies extracted markdown into a web AI tool.
- This removes API key, quota, cost, and upload-by-default concerns.

## Video / Transcript Strategy
- Prefer existing visible transcripts, captions, subtitle panels, DOM text, or metadata.
- If transcript is not visible, ask user to open transcript/captions panel and extract again.
- Full speech-to-text requires future optional audio capture plus local or external STT.
- Video frame understanding requires future OCR/vision support and is not part of the default no-API extractor.

## Backend Architecture
- No backend in current MVP.

## Database Structure
- No database in current MVP.

## Infrastructure Choices
- Development: local unpacked Chrome Extension folder.
- Source control: GitHub.
- Production target: Chrome Web Store.

## System Patterns
- Platform-specific extraction is preferred over pretending one generic extractor can handle every social platform.
- `popup.js` owns orchestration and formatting.
- `content.js` owns DOM extraction and platform routing.
- Use generic fallback only when no specialized extractor exists.

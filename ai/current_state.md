# Current State

## Completed Work
- Chrome Extension project scaffold exists.
- Manifest V3 extension configured.
- Popup UI and content script exist.
- Markdown AI memory system exists in `ai/`.
- GitHub remote is configured: `https://github.com/LeeSoonDer/social-media-summarizer.git`.
- Product pivoted from Gemini summarizer to universal social content extractor.
- Popup now extracts and displays copyable markdown text without calling Gemini.
- `content.js` now routes extraction by platform.
- Current extractor targets: Xiaohongshu, Instagram, X/Twitter, Reddit, YouTube, LinkedIn, Facebook, and generic webpages.
- Copy button and copy AI prompt flow exist.
- Popup Chinese UI encoding has been repaired.
- YouTube extractor now prefers real transcript panel text, then attempts no-API captionTracks fetch, and filters noisy YouTube links/images.

## In Progress
- Testing YouTube captionTracks behavior on real videos with manual captions, auto captions, and no captions.
- Improving per-platform selectors based on actual DOM behavior.

## Next Priorities
1. Reload unpacked extension in `chrome://extensions`.
2. Retest YouTube video extraction on the previously noisy sample.
3. Test Instagram Reels, X/Twitter video, Facebook video, LinkedIn video, and Reddit video posts.
4. Decide whether Phase 3B should add debug mode or more platform extractors first.
5. Keep OCR/STT as optional future modes, not default behavior.

## Current Blockers
- Social platforms frequently change DOM structure.
- Video speech cannot be fully transcribed without platform captions, playback recording, local STT, or external AI/STT.
- Some pages hide content behind lazy loading or login state.

## Temporary Notes
- Gemini code path is no longer the default UX.
- Extension should avoid uploading user content by default.
- During development, Chrome runs the local unpacked folder, not GitHub directly.
- GitHub push requires explicit user approval.

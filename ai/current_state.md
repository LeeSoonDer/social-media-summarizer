# Current State

## Completed Work
- Chrome Extension project scaffold exists.
- Manifest V3 extension configured.
- Popup UI and content script exist.
- Markdown AI memory system exists in `ai/`.
- GitHub remote is configured: `https://github.com/LeeSoonDer/social-media-summarizer.git`.
- Product pivoted from Gemini summarizer to universal social content extractor.
- Popup extracts and displays copyable markdown text without calling Gemini.
- `content.js` routes extraction by platform.
- Current extractor targets: Xiaohongshu, Instagram, X/Twitter, Reddit, YouTube, TikTok, Threads, LinkedIn, Facebook, and generic webpages.
- Copy button and copy AI prompt flow exist.`r`n- Added multi-page collection workflow: opening the extension auto-saves the current extraction into a local collection, and a batch prompt button copies all collected items at once.`r`n- Added local screenshot OCR with bundled Tesseract.js language data for English, Simplified Chinese, and Traditional Chinese.`r`n- OCR text is saved as `OCR Text From Screenshot` and included in single-page and batch prompts.`r`n- Comment extraction is disabled to keep post/OCR output focused and reduce noise.`r`n- AI prompt output is intentionally limited to Title, Main Text / Caption, and OCR Text From Screenshot.`r`n- Added visible-text fallback for post extraction when platform selectors are incomplete.
- Popup Chinese UI encoding has been repaired.
- Non-YouTube video extraction now also checks structured metadata such as `og:video`, `twitter:player`, JSON-LD `contentUrl/embedUrl`, and visible `<video>` elements.
- TikTok and Threads extractors were added.

## In Progress
- Prioritizing non-YouTube social post and video extraction quality.
- Improving per-platform selectors based on actual DOM behavior.

## Next Priorities`r`n1. Reload unpacked extension in `chrome://extensions`.`r`n2. Test multi-page collection: open post/page, open extension, move to next page/slide, open extension again, then copy batch prompt.
2. Test Instagram post/Reels extraction.
3. Test TikTok video page extraction.
4. Test Threads post extraction.
5. Test X/Twitter, Reddit, LinkedIn, and Facebook video posts.
6. Record which platforms expose captions in DOM and which require OCR/STT.

## Current Blockers
- Social platforms frequently change DOM structure.
- Video speech cannot be fully transcribed without platform captions, playback recording, local STT, or external AI/STT.
- Burned-in subtitles and image text are handled by local screenshot OCR when visible in the current viewport.
- Some pages hide content behind lazy loading or login state.

## Temporary Notes
- YouTube is lower priority because most web AI tools can analyze YouTube links directly.
- Gemini code path is no longer the default UX.
- Extension should avoid uploading user content by default.`r`n- Local OCR increases extension size because language models are bundled in `vendor/tesseract/`.
- During development, Chrome runs the local unpacked folder, not GitHub directly.
- GitHub push requires explicit user approval.

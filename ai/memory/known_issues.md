# Known Issues

## Gemini quota/rate-limit ambiguity
Symptoms: Extension may show Gemini quota or rate-limit errors even with a new API key.
Likely Causes:
- Google quota is tied to the Google Cloud project, not only the API key.
- Model-specific free tier limits vary.
- Image payloads may increase request cost or token usage.
- Rapid repeated tests may hit RPM/TPM limits.
Current Mitigation:
- Try lower-cost model first.
- Fall back from image+text to text-only.
- Preserve provider error details in popup.

## Stale unpacked extension code
Symptoms: Chrome popup still shows old error messages after local code changes.
Likely Cause: Unpacked extension was not reloaded in `chrome://extensions`.
Current Mitigation: Reload extension after code changes.

## Content script not connected
Symptoms: Popup says it cannot connect to page script.
Likely Causes:
- Page loaded before extension reload.
- Content script was not injected.
- Unsupported URL or restricted Chrome page.
Current Mitigation:
- Popup now attempts to inject `content.js` using `chrome.scripting.executeScript`.
## Video OCR and audio transcript limitation
Symptoms: Instagram/Reels/TikTok-style videos may show burned-in subtitles on the video frame, but extractor returns no transcript.
Cause: Burned-in text is pixels, not DOM text. Spoken audio also is not available as text unless the platform exposes captions/transcript or the extension records audio and runs STT.
Current Mitigation:
- Extract visible DOM captions and subtitle track metadata when available.
- Output metadata explaining that frame text needs OCR/AI vision.
- For YouTube, prefer transcript panel text, then try captionTracks fetch. CC overlay is treated only as current visible captions.
Future Options:
- Add OCR/vision mode for frames.
- Add optional tab audio capture + local/external speech-to-text.

## Local OCR limitations
Symptoms: OCR may miss small, blurred, cropped, low-contrast, vertical, stylized, or partially hidden image text.
Cause: Tesseract reads pixels from the current visible screenshot only; it does not understand off-screen carousel slides or hidden images.
Current Mitigation:
- User opens each slide/page and opens the extension to save OCR text into the collection.
- OCR runs locally with bundled English, Simplified Chinese, and Traditional Chinese language data.
Future Options:
- Add image-region crop mode.
- Add upscale/preprocessing controls.
- Add optional cloud vision mode if user explicitly approves upload.

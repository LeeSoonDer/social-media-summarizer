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

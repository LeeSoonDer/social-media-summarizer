# Roadmap

> 2026-09-09 起，本文件的旧分期（Phase 2 默认调 Gemini、Phase 3 抽帧送 Gemini、Phase 5 录音送 Gemini）已作废。
> 现行分期以 `ai/product_architecture.md` 第 8 节与根目录 `CLAUDE.md` 为准：
> Phase 1 侧栏换壳（已完成）→ Phase 2 笔记 → Phase 3 复制给 AI 定稿 → Phase 4 画面增强 → Phase 5 口播 → Phase 6 打磨。
> 云模型相关能力降级为 Phase 7 可选，且必须用户逐次确认。

## 历史记录（保留备查）

## Phase 1 - Extension Skeleton and Text Extraction
Status: Completed.

Goals:
- Manifest V3 setup.
- Popup UI.
- Content script injection.
- Xiaohongshu and Instagram detection.
- Basic text extraction.

## Phase 2 - Gemini API and Image Understanding
Status: In progress.

Goals:
- Extract image URLs and limited base64 image data.
- Call Gemini from popup.
- Show bilingual structured summary.
- Improve quota/rate-limit diagnostics.

## Phase 3 - Video Frame Sampling
Status: Planned.

Goals:
- Detect video elements.
- Capture selected frames with canvas.
- Send frames to Gemini vision model.

## Phase 4 - UI Polish
Status: Planned.

Goals:
- Loading animation.
- Copy summary button.
- Better error handling.
- Cleaner visual design.

## Phase 5 - Audio Capture
Status: Planned.

Goals:
- Record audio from playing video where possible.
- Send audio to Gemini for transcription and summarization.

## Phase 6 - Publishing
Status: Planned.

Goals:
- Package extension zip.
- Prepare Chrome Web Store listing.
- Review privacy/security implications.
- Submit for review.

# Project Overview

## Product
Social Extractor is a Chrome Extension that extracts social media post content into clean, copyable text.

## Core Problem
Users often want to ask ChatGPT, Gemini, Claude, or another web AI about content from social media posts, images, videos, captions, comments, and threads. Copying that context manually is slow and incomplete.

## Product Positioning
This is not a scraper farm and not an AI summarizer by default. It is a browser-side content extraction tool that turns the currently opened social media page into structured markdown text the user can copy into any AI chat.

## MVP Platforms
- Xiaohongshu
- Instagram
- X/Twitter
- Reddit
- YouTube
- LinkedIn
- Facebook
- Generic fallback for other normal webpages

## MVP User Flow
1. User opens a social media post, video, thread, or page.
2. User clicks the Chrome Extension icon.
3. Extension detects the platform from the URL.
4. Platform-specific extractor pulls title, author, main text, tags, comments, images, videos, links, and available transcript/captions.
5. Popup displays clean markdown.
6. User copies the text into a web AI tool manually.

## Target Output
- Platform and URL
- Title and author
- Main post text/caption
- Hashtags and mentions
- Visible comments or thread text
- Image URLs and alt text when available
- Video URLs when visible in DOM
- Transcript/captions when already visible on page
- Suggested AI prompt

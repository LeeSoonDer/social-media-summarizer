function textOf(el) {
  return (el?.innerText || el?.textContent || "").trim().replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

function attr(el, name) {
  return (el?.getAttribute(name) || "").trim();
}

function metaContent(name) {
  const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
  return attr(el, "content");
}

function firstText(selectors, root = document) {
  for (const selector of selectors) {
    const text = textOf(root.querySelector(selector));
    if (text) return text;
  }
  return "";
}

function isUsefulText(value, minLength = 2) {
  const text = String(value || "").trim();
  if (text.length < minLength) return false;
  if (/^\d+$/.test(text)) return false;
  if (/^[\d.,KkMm]+\s*(likes?|views?|comments?|shares?)?$/i.test(text)) return false;
  if (/^(like|comment|share|follow|more|reply|view replies|add a comment)$/i.test(text)) return false;
  return true;
}

function unique(items, limit = 40) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function detectPlatform() {
  const host = location.hostname.replace(/^www\./, "");
  if (host.includes("xiaohongshu.com")) return "xiaohongshu";
  if (host.includes("instagram.com")) return "instagram";
  if (host === "x.com" || host.includes("twitter.com")) return "x-twitter";
  if (host.includes("reddit.com")) return "reddit";
  if (host.includes("youtube.com")) return "youtube";
  if (host.includes("linkedin.com")) return "linkedin";
  if (host.includes("facebook.com")) return "facebook";
  return "generic";
}

function extractTags(text = document.body.innerText) {
  return unique((text.match(/#[\p{L}\p{N}_-]+/gu) || []).map((t) => t.replace(/^#/, "")), 30);
}

function extractMentions(text = document.body.innerText) {
  return unique((text.match(/@[\p{L}\p{N}_.-]+/gu) || []), 30);
}

function extractImages(limit = 10) {
  const urls = [];
  const og = metaContent("og:image");
  if (og) urls.push(og);
  document.querySelectorAll("img").forEach((img) => {
    const src = img.currentSrc || img.src || attr(img, "data-src");
    if (!src || !src.startsWith("http")) return;
    const lower = src.toLowerCase();
    if (lower.includes("avatar") || lower.includes("emoji") || lower.includes("icon")) return;
    if (img.naturalWidth > 0 && img.naturalWidth < 80) return;
    const alt = attr(img, "alt");
    urls.push(alt ? `${src} (alt: ${alt})` : src);
  });
  return unique(urls, limit);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function extractVideos(limit = 8) {
  const items = [];
  document.querySelectorAll("video").forEach((video) => {
    const src = video.currentSrc || video.src || attr(video, "src");
    const poster = attr(video, "poster");
    const duration = formatTime(video.duration);
    const parts = [];
    if (src) parts.push(src);
    if (duration) parts.push(`duration: ${duration}`);
    if (poster) parts.push(`poster: ${poster}`);
    if (parts.length) items.push(parts.join(" | "));
  });
  document.querySelectorAll("video source").forEach((el) => {
    const src = el.currentSrc || el.src || attr(el, "src");
    if (src) items.push(src);
  });
  return unique(items, limit);
}

function extractTextTrackInfo(limit = 12) {
  const tracks = [];
  document.querySelectorAll("track").forEach((track) => {
    const src = attr(track, "src");
    const kind = attr(track, "kind") || "track";
    const label = attr(track, "label") || attr(track, "srclang");
    if (src) tracks.push(`${kind}${label ? ` (${label})` : ""}: ${src}`);
  });
  return unique(tracks, limit);
}

function extractVisibleCaptionText() {
  return unique(Array.from(document.querySelectorAll([
    "[class*='caption']",
    "[class*='subtitle']",
    "[aria-label*='caption' i]",
    "[aria-label*='subtitle' i]",
  ].join(","))).map(textOf).filter((text) => isUsefulText(text, 20)), 20).join("\n");
}

function extractLinks(limit = 20) {
  return unique(Array.from(document.querySelectorAll("a[href]"))
    .map((a) => a.href)
    .filter((href) => href && href.startsWith("http") && !href.includes(location.hostname)), limit);
}

function extractVisibleComments(selectors) {
  return unique(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)).map(textOf)).filter((t) => isUsefulText(t, 20)), 20);
}

function baseResult(platform, data) {
  const body = data.body || metaContent("og:description") || metaContent("description") || "";
  const allText = [data.title, data.author, body, ...(data.comments || [])].join("\n");
  return {
    platform,
    url: location.href,
    title: data.title || metaContent("og:title") || document.title || "",
    author: data.author || "",
    body,
    transcript: data.transcript || "",
    tags: data.tags?.length ? data.tags : extractTags(allText),
    mentions: data.mentions?.length ? data.mentions : extractMentions(allText),
    comments: data.comments || [],
    images: data.images || extractImages(),
    videos: data.videos || extractVideos(),
    links: data.links || extractLinks(),
    metadata: data.metadata || [],
  };
}

function extractXiaohongshu() {
  return baseResult("xiaohongshu", {
    title: firstText(["#detail-title", ".title", "h1"]),
    body: firstText(["#detail-desc .note-text", "#detail-desc", ".note-text", ".content", "[class*='desc']"]),
    comments: extractVisibleComments([".comment-item", "[class*='comment'] .content", "[class*='comment']"]),
  });
}

function extractInstagram() {
  const article = document.querySelector("article") || document;
  const candidates = [
    metaContent("og:description"),
    firstText(["h1", "article h1"], article),
    ...Array.from(article.querySelectorAll("span[dir='auto'], div[dir='auto']")).map(textOf),
  ].filter((item) => isUsefulText(item, 8));
  return baseResult("instagram", {
    title: metaContent("og:title") || document.title,
    author: firstText(["header a", "article header a"], article),
    body: candidates[0] || "",
    transcript: extractVisibleCaptionText(),
    comments: extractVisibleComments(["article ul li", "article span"]),
    metadata: ["Video text burned into frames is not readable without OCR or AI vision."],
  });
}

function extractTwitter() {
  const article = document.querySelector("article") || document;
  return baseResult("x-twitter", {
    title: document.title,
    author: firstText(["[data-testid='User-Name']", "a[role='link'][href*='/']"], article),
    body: firstText(["[data-testid='tweetText']", "article div[lang]"], article),
    transcript: extractVisibleCaptionText(),
    comments: extractVisibleComments(["article [data-testid='tweetText']", "article div[lang]"]),
  });
}

function extractReddit() {
  const post = document.querySelector("shreddit-post") || document.querySelector("[data-testid='post-container']") || document;
  return baseResult("reddit", {
    title: attr(post, "post-title") || firstText(["h1", "[slot='title']", "[data-testid='post-title']"], post),
    author: attr(post, "author") || firstText(["[data-testid='post_author_link']", "a[href*='/user/']"], post),
    body: attr(post, "post-content") || firstText(["[slot='text-body']", "[data-click-id='text']", ".md"], post),
    comments: extractVisibleComments(["shreddit-comment", "[data-testid='comment']", ".Comment"]),
  });
}

function extractBalancedJson(text, startIndex) {
  const firstBrace = text.indexOf("{", startIndex);
  if (firstBrace < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = firstBrace; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(firstBrace, i + 1);
    }
  }
  return null;
}

function getYouTubePlayerResponse() {
  const scripts = Array.from(document.scripts).map((script) => script.textContent || "");
  for (const scriptText of scripts) {
    const index = scriptText.indexOf("ytInitialPlayerResponse");
    if (index < 0) continue;
    const jsonText = extractBalancedJson(scriptText, index);
    if (!jsonText) continue;
    try {
      return JSON.parse(jsonText);
    } catch {
      // Keep scanning; YouTube may include multiple scripts.
    }
  }
  return null;
}

function extractYouTubeVideoId() {
  try {
    const url = new URL(location.href);
    const watchId = url.searchParams.get("v");
    if (watchId) return watchId;
  } catch {
    // Ignore malformed URLs.
  }
  return location.pathname.match(/\/(shorts|embed)\/([^/?]+)/)?.[2] || "";
}

function extractYouTubeThumbnail() {
  const og = metaContent("og:image");
  if (og && og.includes("ytimg.com")) return og;
  const videoId = extractYouTubeVideoId();
  return videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : "";
}

function extractYouTubeVideoSummary() {
  const video = document.querySelector("video");
  const duration = formatTime(video?.duration);
  return [`${location.href}${duration ? ` | duration: ${duration}` : ""}`];
}

function getYouTubeDescriptionRoot() {
  return document.querySelector("#description-inline-expander")
    || document.querySelector("#description")
    || document.querySelector("ytd-text-inline-expander");
}

function normalizeYouTubeExternalLink(href) {
  try {
    const url = new URL(href, location.href);
    if (url.hostname.endsWith("youtube.com") && url.pathname === "/redirect") {
      const target = url.searchParams.get("q") || url.searchParams.get("url");
      if (target) return new URL(target).href;
    }
    return url.href;
  } catch {
    return "";
  }
}

function isAllowedYouTubeExternalLink(href) {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "");
    const blockedHosts = [
      "youtube.com",
      "youtu.be",
      "google.com",
      "googleadservices.com",
      "doubleclick.net",
      "gstatic.com",
      "ytimg.com",
    ];
    return url.protocol.startsWith("http") && !blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
  } catch {
    return false;
  }
}

function extractYouTubeDescriptionLinks(limit = 12) {
  const root = getYouTubeDescriptionRoot();
  if (!root) return [];
  const anchorLinks = Array.from(root.querySelectorAll("a[href]")).map((a) => normalizeYouTubeExternalLink(a.href));
  const textLinks = (textOf(root).match(/https?:\/\/[^\s)\]]+/g) || []).map((url) => url.replace(/[.,;:!?]+$/, ""));
  return unique([...anchorLinks, ...textLinks].filter(isAllowedYouTubeExternalLink), limit);
}

function extractYouTubeVisibleTranscriptPanel() {
  const segments = Array.from(document.querySelectorAll("ytd-transcript-segment-renderer"))
    .map((segment) => {
      const time = firstText([".segment-timestamp", "#timestamp"], segment);
      const line = firstText([".segment-text", "#segment-text"], segment);
      if (!isUsefulText(line, 2)) return "";
      return [time, line].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  return segments.length ? unique(segments, 1000).join("\n") : "";
}

function extractYouTubePlayerCaptions() {
  return unique(Array.from(document.querySelectorAll(".ytp-caption-segment")).map(textOf).filter((text) => isUsefulText(text, 2)), 10).join(" / ");
}

function getYouTubeCaptionTracks() {
  const response = getYouTubePlayerResponse();
  return response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
}

function captionTrackLabel(track) {
  return track?.name?.simpleText || track?.name?.runs?.map((run) => run.text).join("") || track?.languageCode || "caption track";
}

function pickYouTubeCaptionTrack(tracks) {
  if (!tracks.length) return null;
  const browserLang = (navigator.language || "").split("-")[0].toLowerCase();
  return tracks.find((track) => track.languageCode === browserLang && track.kind !== "asr")
    || tracks.find((track) => track.languageCode === browserLang)
    || tracks.find((track) => track.kind !== "asr")
    || tracks[0];
}

function parseYouTubeJson3Captions(text) {
  const data = JSON.parse(text);
  const lines = (data.events || [])
    .map((event) => {
      const line = (event.segs || []).map((seg) => seg.utf8 || "").join("").replace(/\s+/g, " ").trim();
      if (!isUsefulText(line, 1)) return "";
      const time = formatTime((event.tStartMs || 0) / 1000);
      return [time, line].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  return unique(lines, 2000).join("\n");
}

function parseWebVttCaptions(text) {
  const lines = text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("WEBVTT") && !line.includes("-->") && !/^\d+$/.test(line));
  return unique(lines, 2000).join("\n");
}

async function fetchYouTubeCaptionTranscript(track) {
  if (!track?.baseUrl) return "";
  const jsonUrl = new URL(track.baseUrl);
  jsonUrl.searchParams.set("fmt", "json3");
  const response = await fetch(jsonUrl.href, { credentials: "include" });
  if (!response.ok) throw new Error(`caption fetch failed: ${response.status}`);
  const text = await response.text();
  try {
    return parseYouTubeJson3Captions(text);
  } catch {
    return parseWebVttCaptions(text);
  }
}

async function extractYouTubeTranscript() {
  const visibleTranscript = extractYouTubeVisibleTranscriptPanel();
  if (visibleTranscript) return { text: visibleTranscript, source: "visible YouTube transcript panel" };

  const tracks = getYouTubeCaptionTracks();
  const track = pickYouTubeCaptionTrack(tracks);
  if (!track) return { text: "", source: "", tracks };

  try {
    const text = await fetchYouTubeCaptionTranscript(track);
    return { text, source: `YouTube caption track: ${captionTrackLabel(track)}`, tracks };
  } catch (err) {
    return { text: "", source: "", tracks, error: String(err?.message || err) };
  }
}

async function extractYouTube() {
  const transcript = await extractYouTubeTranscript();
  const currentCaptions = extractYouTubePlayerCaptions();
  const metadata = [];

  if (transcript.source) metadata.push(`Transcript source: ${transcript.source}`);
  if (transcript.tracks?.length) metadata.push(`Available caption tracks: ${transcript.tracks.map(captionTrackLabel).join(", ")}`);
  if (transcript.error) metadata.push(`Caption fetch issue: ${transcript.error}`);
  if (!transcript.text && currentCaptions) metadata.push(`Current visible CC only: ${currentCaptions}`);
  if (!transcript.text) metadata.push("No full YouTube transcript detected. CC overlay only exposes the current visible captions, not the full script.");
  metadata.push("Audio speech is not transcribed unless YouTube exposes captions/transcript text.");

  const thumbnail = extractYouTubeThumbnail();
  return baseResult("youtube", {
    title: firstText(["h1.ytd-watch-metadata", "h1", "#title h1"]) || metaContent("og:title"),
    author: firstText(["#owner #channel-name", "ytd-channel-name", "#text-container.ytd-channel-name"]),
    body: firstText(["#description-inline-expander", "#description", "ytd-text-inline-expander"]),
    transcript: transcript.text,
    images: thumbnail ? [thumbnail] : [],
    videos: extractYouTubeVideoSummary(),
    links: extractYouTubeDescriptionLinks(),
    metadata,
  });
}

function extractLinkedIn() {
  const article = document.querySelector("article") || document.querySelector(".feed-shared-update-v2") || document;
  return baseResult("linkedin", {
    title: document.title,
    author: firstText([".update-components-actor__title", ".feed-shared-actor__title", "span[dir='ltr']"], article),
    body: firstText([".feed-shared-update-v2__description", ".update-components-text", ".break-words", "[data-test-id='main-feed-activity-card']"], article),
    transcript: extractVisibleCaptionText(),
    comments: extractVisibleComments([".comments-comment-item", ".comments-comment-item__main-content"]),
  });
}

function extractFacebook() {
  const main = document.querySelector("[role='main']") || document;
  return baseResult("facebook", {
    title: metaContent("og:title") || document.title,
    author: firstText(["strong", "h2", "h3"], main),
    body: firstText(["[data-ad-preview='message']", "[dir='auto']", "[role='article']"], main),
    transcript: extractVisibleCaptionText(),
    comments: extractVisibleComments(["[role='article'] [dir='auto']", "[aria-label*='Comment'] [dir='auto']"]),
  });
}

function extractGeneric() {
  const main = document.querySelector("article") || document.querySelector("main") || document.querySelector("[role='main']") || document.body;
  const trackInfo = extractTextTrackInfo();
  return baseResult("generic", {
    title: metaContent("og:title") || document.title,
    author: metaContent("article:author") || "",
    body: textOf(main).slice(0, 12000),
    transcript: extractVisibleCaptionText(),
    metadata: [
      ...trackInfo.map((track) => `Subtitle track: ${track}`),
      "Generic extractor used. Platform-specific extractor not available yet.",
    ],
  });
}

async function extractContent() {
  const platform = detectPlatform();
  const extractors = {
    xiaohongshu: extractXiaohongshu,
    instagram: extractInstagram,
    "x-twitter": extractTwitter,
    reddit: extractReddit,
    youtube: extractYouTube,
    linkedin: extractLinkedIn,
    facebook: extractFacebook,
    generic: extractGeneric,
  };
  return await extractors[platform]();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "ping") {
    sendResponse({ ok: true });
    return false;
  }
  if (message.action === "extract") {
    extractContent()
      .then(sendResponse)
      .catch((err) => sendResponse({ error: "extract_failed", message: String(err?.message || err) }));
    return true;
  }
  return false;
});

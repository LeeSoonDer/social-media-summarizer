function detectPlatform() {
  const host = location.hostname;
  if (host.includes("xiaohongshu.com")) return "xiaohongshu";
  if (host.includes("instagram.com")) return "instagram";
  return "unsupported";
}

function metaContent(property) {
  const el = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
  return el ? (el.getAttribute("content") || "").trim() : "";
}

function firstText(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const text = (el.innerText || el.textContent || "").trim();
    if (text) return text;
  }
  return "";
}

function uniqueStrings(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function extractTagsFromLinks(selector, transform) {
  const tags = [];
  document.querySelectorAll(selector).forEach((el) => {
    const raw = (el.innerText || el.textContent || "").trim();
    if (!raw) return;
    tags.push(transform ? transform(raw) : raw);
  });
  return tags;
}

function extractXiaohongshu() {
  const title =
    metaContent("og:title") ||
    firstText(["#detail-title", ".title", "h1"]);

  const body =
    metaContent("og:description") ||
    firstText([
      "#detail-desc .note-text",
      "#detail-desc",
      ".note-text",
      ".content",
      "[class*='desc']",
    ]);

  const tags = uniqueStrings([
    ...extractTagsFromLinks('a[href*="/search_result"]', (t) => t.replace(/^#/, "")),
    ...extractTagsFromLinks(".tag, [class*='tag']"),
    ...Array.from(document.querySelectorAll("a")).map((a) => {
      const text = (a.innerText || "").trim();
      return text.startsWith("#") ? text.slice(1) : "";
    }),
  ]).filter((t) => t.length > 0 && t.length < 50);

  const images = extractImageUrls();
  return { title, body, tags, images };
}

function extractInstagram() {
  const title =
    metaContent("og:title") ||
    firstText(["article h1", "header a", "h1"]);

  let body =
    metaContent("og:description") ||
    metaContent("description") ||
    firstText(["article h1 + div", "[role='button'] + div span", "article ul + div span"]);

  if (!body) {
    const candidates = Array.from(
      document.querySelectorAll("article span, article div span, h1 ~ div span")
    )
      .map((el) => (el.innerText || "").trim())
      .filter((text) => text.length > 15 && !text.includes("赞") && !text.includes("Like"));
    candidates.sort((a, b) => b.length - a.length);
    body = candidates[0] || "";
  }

  const tags = uniqueStrings(
    extractTagsFromLinks('a[href*="/explore/tags/"]', (t) => t.replace(/^#/, ""))
  );

  const images = extractImageUrls();
  return { title, body, tags, images };
}

function extractImageUrls() {
  const urls = new Set();
  const ogImage = metaContent("og:image");
  if (ogImage && ogImage.startsWith("http")) urls.add(ogImage);

  document.querySelectorAll("img").forEach((img) => {
    const src = img.currentSrc || img.src || img.getAttribute("data-src");
    if (!src || !src.startsWith("http")) return;
    const lower = src.toLowerCase();
    if (
      lower.includes("avatar") ||
      lower.includes("emoji") ||
      lower.includes("icon") ||
      lower.includes("logo")
    ) {
      return;
    }
    if (img.naturalWidth > 0 && img.naturalWidth < 80) return;
    urls.add(src.split("?")[0]);
  });

  return Array.from(urls).slice(0, 2);
}

async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const mimeType = blob.type || "image/jpeg";
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { mimeType, data: btoa(binary) };
}

async function fetchImagesBase64(urls) {
  const results = [];
  for (const url of urls) {
    try {
      results.push({ url, ...(await fetchImageAsBase64(url)) });
    } catch {
      /* skip failed images */
    }
  }
  return results;
}

function extractContent() {
  const platform = detectPlatform();
  if (platform === "unsupported") {
    return { error: "unsupported_platform" };
  }

  const extracted =
    platform === "xiaohongshu" ? extractXiaohongshu() : extractInstagram();

  return {
    platform,
    url: location.href,
    title: extracted.title,
    body: extracted.body,
    tags: extracted.tags,
    images: extracted.images || [],
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "extract") {
    try {
      sendResponse(extractContent());
    } catch (err) {
      sendResponse({ error: "extract_failed", message: String(err) });
    }
    return true;
  }

  if (message.action === "extractWithImages") {
    (async () => {
      try {
        const content = extractContent();
        if (content.error) {
          sendResponse(content);
          return;
        }
        const images = await fetchImagesBase64((content.images || []).slice(0, 2));
        sendResponse({ ...content, imageData: images });
      } catch (err) {
        sendResponse({ error: "extract_failed", message: String(err) });
      }
    })();
    return true;
  }

  return false;
});

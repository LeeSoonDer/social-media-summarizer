// Social Extractor 侧栏工作台 · Phase 1
// 提取 / OCR / 集合 / 复制逻辑迁自 popup.js，数据形状保持兼容。
// 笔记与口播分区在本阶段只做可用空状态。

const COLLECTION_KEY = "socialExtractorCollection";
const MAX_COLLECTION_ITEMS = 80;

const PLATFORM_LABELS = {
  xiaohongshu: "小红书",
  instagram: "Instagram",
  "x-twitter": "X / Twitter",
  reddit: "Reddit",
  youtube: "YouTube",
  tiktok: "TikTok",
  threads: "Threads",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  generic: "普通网页",
};

let currentContent = null;
let currentTabId = null;
let collection = [];
let busy = false;

/* ---------- 小工具 ---------- */

const $ = (id) => document.getElementById(id);

function setStatus(text, type = "") {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${type}`.trim();
}

function humanError(err) {
  const raw = String(err?.message || err || "未知错误");
  if (/Receiving end does not exist|Could not establish connection/i.test(raw)) {
    return "连不上页面脚本。请刷新目标网页后再点「刷新」。";
  }
  if (/Cannot access|activeTab|all_urls/i.test(raw)) {
    return "没有这个页面的访问权限。到 chrome://extensions 重新加载扩展，再刷新网页。";
  }
  if (/chrome:\/\/|Extension manifest/i.test(raw)) {
    return "这个页面不允许扩展读取，请切到普通网页。";
  }
  return raw;
}

function isInjectableUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function platformLabel(platform) {
  return PLATFORM_LABELS[platform] || platform || "未识别";
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
}

async function getActiveTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

async function copyText(text, okMessage) {
  if (!text) {
    setStatus("没有可复制的内容。", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setStatus(okMessage, "ok");
  } catch (err) {
    setStatus(`复制失败：${humanError(err)}`, "error");
  }
}

/* ---------- 提取 ---------- */

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "ping" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  }
}

async function extractFromTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { action: "extract" });
  } catch {
    await ensureContentScript(tabId);
    return await chrome.tabs.sendMessage(tabId, { action: "extract" });
  }
}

/* ---------- 输出格式（迁自 popup.js，Phase 3 再定两档稿） ---------- */

function section(title, value) {
  if (Array.isArray(value)) {
    if (!value.length) return "";
    return `## ${title}\n${value.map((item) => `- ${item}`).join("\n")}`;
  }
  if (!value) return "";
  return `## ${title}\n${value}`;
}

function buildSuggestedPrompt(content) {
  const ocrHint = content.ocrText
    ? "Use OCR Text From Screenshot as the primary source for words embedded in images."
    : "Only use the provided Title and Main Text / Caption if OCR text is empty.";

  return [
    "Please analyze the extracted social media post content below.",
    "Only use these sections: Title, Main Text / Caption, and OCR Text From Screenshot.",
    "Return:",
    "1. concise summary",
    "2. key points",
    "3. important context",
    "4. claims or advice that should be verified",
    "5. actionable takeaways",
    ocrHint,
  ].join("\n");
}

function buildBatchPrompt() {
  return [
    "Please analyze the collected social media post content below.",
    "Only use these sections from each item: Title, Main Text / Caption, and OCR Text From Screenshot.",
    "The content may come from multiple carousel slides, screenshots, or related posts.",
    "Deduplicate repeated lines and merge the information.",
    "Use OCR Text From Screenshot as the primary source for text embedded in images.",
    "Return:",
    "1. concise summary",
    "2. key points",
    "3. important context",
    "4. claims or advice that should be verified",
    "5. actionable takeaways",
  ].join("\n");
}

function formatExtracted(content, index = null) {
  const heading = index === null ? "# Extracted Social Content" : `# Collected Item ${index}`;
  return [
    heading,
    section("Title", content.title),
    section("Main Text / Caption", content.body),
    section("OCR Text From Screenshot", content.ocrText),
  ].filter(Boolean).join("\n\n");
}

function formatSingleOutput(content) {
  return [formatExtracted(content), "## Suggested AI Prompt", buildSuggestedPrompt(content)].join("\n\n");
}

function formatBatchOutput(items) {
  return [
    "# Social Extractor Collection",
    `Collected Items: ${items.length}`,
    `Generated At: ${new Date().toISOString()}`,
    "",
    "## Batch AI Prompt",
    buildBatchPrompt(),
    "",
    ...items.map((item, index) => formatExtracted(item, index + 1)),
  ].join("\n\n");
}

/* ---------- 集合 ---------- */

function collectionFingerprint(content) {
  return [content.url, content.title, content.body, content.ocrText].join("\n").slice(0, 30000);
}

function newId() {
  return `cap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadCollection() {
  const result = await chrome.storage.local.get(COLLECTION_KEY);
  collection = Array.isArray(result[COLLECTION_KEY]) ? result[COLLECTION_KEY] : [];

  // 旧数据没有 id，补上，其它字段一律不动。
  let migrated = false;
  for (const item of collection) {
    if (!item.id) {
      item.id = newId();
      migrated = true;
    }
  }
  if (migrated) await chrome.storage.local.set({ [COLLECTION_KEY]: collection });

  renderCollection();
}

async function saveCollection() {
  await chrome.storage.local.set({ [COLLECTION_KEY]: collection });
  renderCollection();
}

async function upsertCollection(content) {
  const now = new Date().toISOString();
  const fingerprint = collectionFingerprint(content);
  const existingIndex = collection.findIndex(
    (entry) => entry.url === content.url && entry.fingerprint === fingerprint
  );

  if (existingIndex >= 0) {
    const previous = collection[existingIndex];
    collection[existingIndex] = {
      ...previous,
      ...content,
      id: previous.id || newId(),
      extractedAt: previous.extractedAt || now,
      capturedAt: previous.capturedAt || previous.extractedAt || now,
      updatedAt: now,
      fingerprint,
    };
    await saveCollection();
    return "updated";
  }

  collection.push({
    ...content,
    id: newId(),
    extractedAt: now,
    capturedAt: now,
    updatedAt: now,
    fingerprint,
  });
  if (collection.length > MAX_COLLECTION_ITEMS) {
    collection = collection.slice(collection.length - MAX_COLLECTION_ITEMS);
  }
  await saveCollection();
  return "added";
}

function renderCollection() {
  $("collectionCount").textContent = `集合：${collection.length} 页（上限 ${MAX_COLLECTION_ITEMS}）`;
  $("copyCollection").disabled = collection.length === 0;

  const list = $("collectionList");
  list.textContent = "";

  if (!collection.length) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "还没有采集记录。打开一个支持的页面，点顶部「刷新」即可写入。";
    list.appendChild(li);
    return;
  }

  for (const item of [...collection].reverse()) {
    const li = document.createElement("li");
    if (currentContent && item.url === currentContent.url) li.classList.add("item-current");

    const head = document.createElement("div");
    head.className = "item-head";

    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = item.title || item.url || "（无标题）";
    head.appendChild(title);

    const del = document.createElement("button");
    del.className = "link-btn";
    del.textContent = "删除";
    del.addEventListener("click", async () => {
      collection = collection.filter((entry) => entry.id !== item.id);
      await saveCollection();
      setStatus("已删除一条集合记录。", "ok");
    });
    head.appendChild(del);

    const sub = document.createElement("div");
    sub.className = "item-sub";
    sub.textContent = [
      platformLabel(item.platform),
      item.ocrText ? "含画面字" : "无画面字",
      formatTime(item.updatedAt || item.capturedAt || item.extractedAt),
    ].filter(Boolean).join(" · ");

    const url = document.createElement("div");
    url.className = "item-sub";
    url.textContent = item.url || "";

    li.append(head, sub, url);
    list.appendChild(li);
  }
}

/* ---------- 渲染本页 ---------- */

function renderOcr(text) {
  $("ocrText").textContent = text || "未识别到画面文字。翻到要看的那一屏，再点「重新扫描本屏」。";
  $("copyOcr").disabled = !text;
}

function renderContent(content) {
  currentContent = content;

  $("platformBadge").textContent = platformLabel(content.platform);
  $("pageHost").textContent = hostOf(content.url) || "—";
  $("pageHost").title = content.url || "";

  $("pillText").textContent = `正文 ${content.body ? "已采" : "为空"}`;
  $("pillOcr").textContent = `画面字 ${content.ocrText ? "已采" : "无"}`;
  $("pillImages").textContent = `图片 ${content.images?.length || 0}`;
  $("pillVideos").textContent = `视频 ${content.videos?.length || 0}`;

  $("pageTitle").textContent = content.title || "—";

  $("fieldAuthor").hidden = !content.author;
  $("pageAuthor").textContent = content.author || "";

  const urlEl = $("pageUrl");
  urlEl.textContent = content.url || "—";
  urlEl.href = content.url || "#";

  $("pageBody").textContent =
    content.body || "没有取到正文。可能是懒加载或选择器失效，把页面往下滚一点再点「刷新」。";

  const tags = content.tags || [];
  $("fieldTags").hidden = tags.length === 0;
  $("pageTags").textContent = tags.map((tag) => `#${tag}`).join("  ");

  const metadata = content.metadata || [];
  const metaList = $("pageMeta");
  metaList.textContent = "";
  $("fieldMeta").hidden = metadata.length === 0;
  for (const note of metadata) {
    const li = document.createElement("li");
    li.textContent = note;
    metaList.appendChild(li);
  }

  renderOcr(content.ocrText);

  $("sttTranscript").textContent = content.transcript || "—";
  $("sttState").textContent = content.transcript ? "已有页面字幕" : "未开始";

  $("copyPage").disabled = false;
  $("copyAi").disabled = false;
  renderCollection();
}

function resetContent() {
  currentContent = null;
  $("copyPage").disabled = true;
  $("copyAi").disabled = true;
  $("copyOcr").disabled = true;
}

/* ---------- 主流程 ---------- */

async function run() {
  if (busy) return;
  busy = true;
  $("refresh").disabled = true;
  $("rescan").disabled = true;

  try {
    await loadCollection();

    const tab = await getActiveTab();
    if (!tab?.id || !tab.url) {
      setStatus("拿不到当前标签页，切到目标网页后再点「刷新」。", "error");
      return;
    }
    currentTabId = tab.id;
    $("pageHost").textContent = hostOf(tab.url) || "—";
    $("staleBanner").hidden = true;

    if (!isInjectableUrl(tab.url)) {
      resetContent();
      setStatus("这个页面不能采集（chrome:// 或应用商店页），请切到普通网页。", "error");
      return;
    }

    setStatus("正在提取页面文本…", "loading");
    const content = await extractFromTab(tab.id);
    if (!content || content.error) {
      throw new Error(content?.message || "提取失败");
    }

    try {
      setStatus("正在识别画面文字…", "loading");
      const ocrText = await SocialOcr.runOcr(tab, (step) => setStatus(`OCR：${step}`, "loading"));
      content.ocrText = ocrText;
      content.metadata = [
        ...(content.metadata || []),
        ocrText ? "已从当前视口截图识别到画面文字。" : "已跑 OCR，但当前视口没有识别到文字。",
      ];
    } catch (ocrErr) {
      content.ocrText = "";
      content.metadata = [...(content.metadata || []), `OCR 失败：${humanError(ocrErr)}`];
    }

    renderContent(content);
    const result = await upsertCollection(content);
    setStatus(result === "added" ? "已采集本页并写入集合。" : "本页已在集合里，已更新记录。", "ok");
  } catch (err) {
    setStatus(humanError(err), "error");
  } finally {
    busy = false;
    $("refresh").disabled = false;
    $("rescan").disabled = false;
  }
}

async function rescanScreen() {
  if (busy) return;
  if (!currentContent) {
    setStatus("先点顶部「刷新」采一次本页。", "error");
    return;
  }

  busy = true;
  $("rescan").disabled = true;
  $("refresh").disabled = true;

  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("拿不到当前标签页");

    const ocrText = await SocialOcr.runOcr(tab, (step) => setStatus(`OCR：${step}`, "loading"));
    currentContent.ocrText = ocrText;
    renderOcr(ocrText);
    $("pillOcr").textContent = `画面字 ${ocrText ? "已采" : "无"}`;
    await upsertCollection(currentContent);
    setStatus(
      ocrText ? "已重新识别本屏画面文字。" : "本屏没有识别到文字，翻到有字的一屏再扫。",
      ocrText ? "ok" : ""
    );
  } catch (err) {
    setStatus(`扫描失败：${humanError(err)}`, "error");
  } finally {
    busy = false;
    $("rescan").disabled = false;
    $("refresh").disabled = false;
  }
}

/* ---------- 标签页变化只提示，不自动重采（OCR 很贵） ---------- */

async function checkStale() {
  const tab = await getActiveTab();
  if (!tab?.url) return;
  const changed = !currentContent || tab.url !== currentContent.url || tab.id !== currentTabId;
  $("staleBanner").hidden = !changed;
  if (changed) $("pageHost").textContent = hostOf(tab.url) || "—";
}

chrome.tabs.onActivated.addListener(() => {
  checkStale();
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && tab.active) checkStale();
});

/* ---------- 事件绑定 ---------- */

for (const tabButton of document.querySelectorAll(".tab")) {
  tabButton.addEventListener("click", () => {
    for (const el of document.querySelectorAll(".tab")) {
      el.classList.toggle("is-active", el === tabButton);
    }
    const target = tabButton.dataset.tab;
    for (const panel of document.querySelectorAll(".panel")) {
      panel.classList.toggle("is-active", panel.id === `panel-${target}`);
    }
  });
}

$("refresh").addEventListener("click", run);
$("rescan").addEventListener("click", rescanScreen);

$("copyPage").addEventListener("click", () => {
  copyText(currentContent ? formatExtracted(currentContent) : "", "已复制本页文本。");
});

$("copyAi").addEventListener("click", () => {
  copyText(currentContent ? formatSingleOutput(currentContent) : "", "已复制本页 + AI 提示词。");
});

$("copyOcr").addEventListener("click", () => {
  copyText(currentContent?.ocrText || "", "已复制画面文字。");
});

$("copyCollection").addEventListener("click", async () => {
  await loadCollection();
  await copyText(formatBatchOutput(collection), `已复制集合共 ${collection.length} 页。`);
});

$("clearCollection").addEventListener("click", async () => {
  collection = [];
  await saveCollection();
  setStatus("集合已清空（笔记不受影响）。", "ok");
});

run();

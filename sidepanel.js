// Social Extractor 侧栏工作台
// 本页 / 画面 / 集合 / 复制的编排。笔记分区在 lib/notes.js，存储层在 lib/store.js。
// 口播分区仍是空状态（Phase 5）。

const COLLECTION_KEY = "socialExtractorCollection";

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

// 页面身份和提取结果分开：currentContent 是「上次采到了什么」，
// currentPageRef 是「现在停在哪一页」。SPA 内换帖时后者会变、前者不会，
// 笔记必须绑后者，否则会静默记到上一条帖子名下。
let currentPageRef = { url: "", title: "", platform: "" };

/* ---------- 小工具 ---------- */

const $ = (id) => document.getElementById(id);

function setStatus(text, type = "") {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${type}`.trim();
}

// 本页状态：会被记住，进度跑完后靠 restorePageStatus() 还原。
function setPageStatus(text, type = "") {
  pageStatus = { text, type };
  setStatus(text, type);
}

function restorePageStatus() {
  setStatus(pageStatus.text, pageStatus.type);
}

// 顶部状态栏说「本页处于什么状态」（正在提取 / 已采集 / 失败）；
// 动作的结果（已复制 / 已导出 / 已删除）走底部 toast——
// 状态栏在最顶端，用户在长列表底部点按钮时根本看不见它。
let toastTimer = null;
// 扫描过程会把进度写进顶部状态栏；扫完要还原成本页状态，
// 否则状态栏永远停在「正在识别文字」，看起来像卡死了。
let pageStatus = { text: "正在提取页面内容…", type: "loading" };

function notify(text, type = "") {
  const el = $("toast");
  el.textContent = text;
  el.className = `toast ${type}`.trim();
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, type === "error" ? 6000 : 3000);
}

function humanError(err) {
  const raw = String(err?.message || err || "未知错误");
  if (/Receiving end does not exist|Could not establish connection/i.test(raw)) {
    return "连不上页面脚本。请刷新一下目标网页，再点「重新采集」。";
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

function shortTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    ...(sameDay ? {} : { month: "2-digit", day: "2-digit" }),
  });
}

async function getActiveTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

// 只在 content.js 够不着时兜底给个平台名（笔记要记 platform，但可能还没采过页）。
function platformFromUrl(url) {
  const host = hostOf(url);
  if (!host) return "";
  if (host.includes("xiaohongshu.com")) return "xiaohongshu";
  if (host.includes("instagram.com")) return "instagram";
  if (host === "x.com" || host.includes("twitter.com")) return "x-twitter";
  if (host.includes("reddit.com")) return "reddit";
  if (host.includes("youtube.com") || host === "youtu.be") return "youtube";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("threads.net") || host.includes("threads.com")) return "threads";
  if (host.includes("linkedin.com")) return "linkedin";
  if (host.includes("facebook.com")) return "facebook";
  return "generic";
}

// 保存笔记时的唯一真相：当场再问一次当前标签页，不信任缓存变量。
// 只有当活动页确实就是上次采过的那一页，才沿用提取器给的精确标题与平台。
async function currentPageIdentity() {
  const tab = await getActiveTab();
  const url = tab?.url || currentPageRef.url || "";
  const tabTitle = tab?.title || "";
  if (currentContent && url && SocialStore.sameSource(currentContent.url, url)) {
    return {
      url,
      title: currentContent.title || tabTitle,
      platform: currentContent.platform || platformFromUrl(url),
    };
  }
  return { url, title: tabTitle, platform: platformFromUrl(url) };
}

// 扩展页里用 blob + <a download> 存文件，不需要 downloads 权限。
function downloadText(filename, text, mime = "text/markdown;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text, okMessage) {
  if (!text) {
    notify("没有可复制的内容。", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    notify(okMessage, "ok");
  } catch (err) {
    notify(`复制失败：${humanError(err)}`, "error");
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
  const message = { action: "extract", options: { comments: settings.commentsEnabled === true } };
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    await ensureContentScript(tabId);
    return await chrome.tabs.sendMessage(tabId, message);
  }
}

/* ---------- 给 AI 的稿（lib/format.js 定形状，这里只管取材） ---------- */

let settings = { aiPromptMode: "lean", commentsEnabled: false };

function currentMode() {
  return settings.aiPromptMode === "full" ? "full" : "lean";
}

// 「附带我的笔记」勾上时才把本页相关笔记塞进稿里。
function notesForDraft(url) {
  if (!$("withNotes").checked) return [];
  return SocialNotes.relatedFor(url);
}

// 纯稿，不带前言：复制本页、以及「丢进当前笔记」垫底用的瘦身稿。
function leanDraft(content) {
  return SocialFormat.buildPageDraft(content, { mode: "lean", withPreamble: false });
}

function pageDraftForAi(content) {
  return SocialFormat.buildPageDraft(content, {
    mode: currentMode(),
    notes: notesForDraft(content.url),
  });
}

function collectionDraftForAi(items) {
  return SocialFormat.buildCollectionDraft(items, {
    mode: currentMode(),
    notesFor: (item) => notesForDraft(item.url),
  });
}

function renderAiModeHint() {
  $("aiModeHint").textContent =
    currentMode() === "lean"
      ? "标题 + 正文 + 画面字 + 口播"
      : "再加平台 / 链接 / 作者 / 标签 / 图片 / 视频 / 采集时间";
}

function maxCollectionItems() {
  const value = Number(settings.maxCollectionItems);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 80;
}

async function loadSettings() {
  settings = await SocialStore.getSettings();
  $("aiMode").value = currentMode();
  renderAiModeHint();
  SocialOcr.setLangs(settings.ocrLang);
}

// 设置页改了东西之后，侧栏不重开也要跟上。
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[SocialStore.SETTINGS_KEY]) return;
  loadSettings().catch(() => {});
});


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
  // 一个 URL 一条 Capture。fingerprint 只用来判断内容变没变，不参与匹配：
  // Phase 4 起「再扫一屏」会不断改写 ocrText，把它算进匹配键会导致同一页
  // 每扫一屏就多出一条集合项。轮播的多屏合并在 ocrPasses[] 里，不在集合里。
  const existingIndex = collection.findIndex((entry) => entry.url === content.url);

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
    return previous.fingerprint === fingerprint ? "unchanged" : "updated";
  }

  collection.push({
    ...content,
    id: newId(),
    extractedAt: now,
    capturedAt: now,
    updatedAt: now,
    fingerprint,
  });
  const cap = maxCollectionItems();
  if (collection.length > cap) {
    collection = collection.slice(collection.length - cap);
  }
  await saveCollection();
  return "added";
}

function renderCollection() {
  $("collectionCount").textContent = `集合：${collection.length} 页（上限 ${maxCollectionItems()}）`;
  $("copyCollection").disabled = collection.length === 0;

  const list = $("collectionList");
  list.textContent = "";

  if (!collection.length) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "还没有采集记录。打开一个支持的页面，点右上角「重新采集」即可写入。";
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
      notify("已删除一条集合记录。", "ok");
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
  $("ocrText").textContent =
    text || "本页还没扫过画面。翻到有字的那一屏，点上面的「扫本屏」（快捷键 Alt+Shift+S）。";
  $("copyOcr").disabled = !text;
  renderOcrPasses();
}

function renderOcrPasses() {
  const passes = currentContent?.ocrPasses || [];
  const lines = currentContent?.ocrText ? currentContent.ocrText.split(/\r?\n/).length : 0;
  $("ocrPassCount").textContent = passes.length
    ? `本页已扫 ${passes.length} 屏 · 去重后 ${lines} 行`
    : "本页还没扫过";
  $("resetOcr").disabled = passes.length === 0;
}

// 把这一屏并进本页的多屏结果。返回给调用方一句人话。
function absorbOcrPass(text) {
  const before = currentContent.ocrPasses || [];
  const { passes, added, reason } = SocialOcr.appendPass(before, text);
  currentContent.ocrPasses = passes;
  currentContent.ocrText = SocialOcr.mergePasses(passes);
  renderOcr(currentContent.ocrText);
  $("pillOcr").textContent = `画面字 ${passes.length ? `${passes.length} 屏` : "未扫"}`;
  if (added) return { ok: true, message: `已并入第 ${passes.length} 屏。轮播请翻到下一张再扫。` };
  if (reason === "duplicate") return { ok: false, message: "这一屏和之前扫过的一样，没有新内容。翻到下一张再扫。" };
  return { ok: false, message: "本屏没有识别到文字，翻到有字的一屏再扫。" };
}

function renderContent(content) {
  currentContent = content;

  $("platformBadge").textContent = platformLabel(content.platform);
  $("pageHost").textContent = hostOf(content.url) || "—";
  $("pageHost").title = content.url || "";

  $("pillText").textContent = `正文 ${content.body ? "已采" : "为空"}`;
  $("pillOcr").textContent = `画面字 ${content.ocrPasses?.length ? `${content.ocrPasses.length} 屏` : "未扫"}`;
  $("pillImages").textContent = `图片 ${content.images?.length || 0}`;
  $("pillVideos").textContent = `视频 ${content.videos?.length || 0}`;

  $("pageTitle").textContent = content.title || "—";

  $("fieldAuthor").hidden = !content.author;
  $("pageAuthor").textContent = content.author || "";

  const urlEl = $("pageUrl");
  urlEl.textContent = content.url || "—";
  urlEl.href = content.url || "#";

  $("pageBody").textContent =
    content.body || "没有取到正文。可能是懒加载或选择器失效，把页面往下滚一点再点「重新采集」。";

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

  $("sttTranscript").textContent =
    content.transcript || "这一页没有可读的字幕轨道。去「画面」分区一边播一边「再扫一屏」，抓画面上的字。";
  $("sttState").textContent = content.transcript ? "已取到页面字幕" : "没有字幕";

  $("copyPage").disabled = false;
  $("copyAi").disabled = false;
  $("toNote").disabled = false;
  renderNoteFlag();
  renderCollection();
}

// 只改这一个徽标，不碰笔记列表（笔记列表只由笔记自己的事件驱动）。
function renderNoteFlag() {
  const flag = $("hasNotes");
  const count = SocialNotes.relatedFor(currentPageRef.url).length;
  flag.hidden = count === 0;
  flag.textContent = `本页已有笔记 · ${count}`;
}

function resetContent() {
  currentContent = null;
  $("copyPage").disabled = true;
  $("copyAi").disabled = true;
  $("copyOcr").disabled = true;
  $("toNote").disabled = true;
}

/* ---------- 主流程 ---------- */

async function run() {
  if (busy) return;
  busy = true;
  $("refresh").disabled = true;
  $("rescan").disabled = true;

  try {
    // 采集会重渲染集合区并耗时数秒，先把没到点的笔记落盘，别让它跨过这段。
    await SocialNotes.flush();
    await loadCollection();

    const tab = await getActiveTab();
    if (!tab?.id || !tab.url) {
      setStatus("拿不到当前标签页，切到目标网页后再点「重新采集」。", "error");
      return;
    }
    currentTabId = tab.id;
    // 早于 extract / OCR 就把页面身份定下来，中途用户跑去笔记区打字也有正确的 URL 可绑。
    setPageRef({ url: tab.url, title: tab.title || "", platform: platformFromUrl(tab.url) });
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
    // 在这里盖采集时间戳：全量稿要用它，而 upsertCollection 只会给存进集合的那份盖章。
    content.capturedAt = new Date().toISOString();

    // 打开侧栏不自动跑 OCR：截图 + 识别要好几秒，而多数时候用户只是想看正文或笔记。
    // 图上的字到「画面」分区点一下再扫。同一 URL 之前扫过的屏继续沿用。
    const previous = collection.find((entry) => entry.url === content.url);
    content.ocrPasses = previous?.ocrPasses ? [...previous.ocrPasses] : [];
    content.ocrText = SocialOcr.mergePasses(content.ocrPasses);
    if (content.ocrText) {
      content.metadata = [
        ...(content.metadata || []),
        `画面文字来自之前扫过的 ${content.ocrPasses.length} 屏。`,
      ];
    }

    renderContent(content);
    setPageRef({
      url: content.url || tab.url,
      title: content.title || tab.title || "",
      platform: content.platform || platformFromUrl(tab.url),
    });
    const result = await upsertCollection(content);
    const passes = content.ocrPasses?.length || 0;
    const screens = passes ? `画面已有 ${passes} 屏。` : "图上的字要到「画面」点「扫本屏」。";
    setPageStatus(
      result === "added"
        ? `已采集本页文本。${screens}`
        : result === "unchanged"
          ? `本页内容没变。${screens}`
          : `已更新本页记录。${screens}`,
      "ok"
    );
  } catch (err) {
    setPageStatus(humanError(err), "error");
  } finally {
    busy = false;
    $("refresh").disabled = false;
    $("rescan").disabled = false;
  }
}

async function scanAnotherScreen() {
  if (busy) return;
  if (!currentContent) {
    notify("先点顶部「重新采集」采一次本页。", "error");
    return;
  }

  busy = true;
  $("rescan").disabled = true;
  $("refresh").disabled = true;

  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("拿不到当前标签页");

    const ocrText = await SocialOcr.runOcr(tab, (step) => setStatus(`OCR：${step}`, "loading"));
    const result = absorbOcrPass(ocrText);
    await upsertCollection(currentContent);
    const passes = currentContent.ocrPasses?.length || 0;
    pageStatus = { text: `本页已采集。画面已有 ${passes} 屏。`, type: "ok" };
    notify(result.message, result.ok ? "ok" : "");
  } catch (err) {
    notify(`扫描失败：${humanError(err)}`, "error");
  } finally {
    busy = false;
    $("rescan").disabled = false;
    $("refresh").disabled = false;
    restorePageStatus();
  }
}

/* ---------- 标签页变化只提示，不自动重采（OCR 很贵） ---------- */

// 页面身份变了就换「本页相关」那一段。笔记区正在打字时不重绘，等 blur 再补。
function setPageRef(ref) {
  const changed = ref.url !== currentPageRef.url;
  currentPageRef = { url: ref.url || "", title: ref.title || "", platform: ref.platform || "" };
  if (changed) {
    SocialNotes.render();
    renderNoteFlag();
  }
}

async function checkStale() {
  const tab = await getActiveTab();
  if (!tab?.url) return;
  setPageRef({ url: tab.url, title: tab.title || "", platform: platformFromUrl(tab.url) });
  const changed = !currentContent || tab.url !== currentContent.url || tab.id !== currentTabId;
  $("staleBanner").hidden = !changed;
  if (changed) $("pageHost").textContent = hostOf(tab.url) || "—";
}

chrome.tabs.onActivated.addListener(() => {
  checkStale();
});

// info.url 覆盖 SPA 内导航（小红书 / IG 换帖不会再触发 complete）。
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!tab.active) return;
  if (info.url || info.status === "complete") checkStale();
});

/* ---------- 事件绑定 ---------- */

function switchTab(target) {
  for (const el of document.querySelectorAll(".tab")) {
    el.classList.toggle("is-active", el.dataset.tab === target);
  }
  for (const panel of document.querySelectorAll(".panel")) {
    panel.classList.toggle("is-active", panel.id === `panel-${target}`);
  }
  if (target === "notes") SocialNotes.render();
}

for (const tabButton of document.querySelectorAll(".tab")) {
  tabButton.addEventListener("click", async () => {
    await SocialNotes.flush();
    switchTab(tabButton.dataset.tab);
  });
}

$("toNote").addEventListener("click", () => SocialNotes.dropIntoNote());

$("hasNotes").addEventListener("click", () => switchTab("notes"));

$("aiMode").addEventListener("change", async (event) => {
  settings.aiPromptMode = event.target.value === "full" ? "full" : "lean";
  renderAiModeHint();
  try {
    await SocialStore.saveSettings({ aiPromptMode: settings.aiPromptMode });
  } catch (err) {
    notify(humanError(err), "error");
  }
});

// 侧栏被关掉 / 隐藏时尽力把没到点的那次保存写出去。
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") SocialNotes.flush();
});
window.addEventListener("pagehide", () => {
  SocialNotes.flush();
});

// 快捷键由 background.js 转发过来。翻一张图按一下 Alt+Shift+S，
// 手不用离开键盘，也不用把鼠标挪到侧栏。
chrome.runtime.onMessage.addListener((message) => {
  if (message?.action !== "command") return;
  if (message.command === "scan-screen") {
    switchTab("ocr");
    scanAnotherScreen();
  }
  if (message.command === "quick-note") {
    switchTab("notes");
    $("noteInput").focus();
  }
});

$("refresh").addEventListener("click", run);
$("rescan").addEventListener("click", scanAnotherScreen);

$("resetOcr").addEventListener("click", async () => {
  if (!currentContent) return;
  currentContent.ocrPasses = [];
  currentContent.ocrText = "";
  renderOcr("");
  $("pillOcr").textContent = "画面字 未扫";
  await upsertCollection(currentContent);
  notify("本页画面文字已清空，可以重新一屏一屏扫。", "ok");
});

$("copyPage").addEventListener("click", () => {
  copyText(currentContent ? leanDraft(currentContent) : "", "已复制本页文本。");
});

$("copyAi").addEventListener("click", () => {
  if (!currentContent) {
    notify("还没采到本页内容。先点右上角「重新采集」。", "error");
    return;
  }
  const label = currentMode() === "lean" ? "瘦身稿" : "全量稿";
  const withNotes = $("withNotes").checked ? "，含我的笔记" : "";
  copyText(pageDraftForAi(currentContent), `已复制本页${label}${withNotes}。`);
});

$("copyOcr").addEventListener("click", () => {
  copyText(currentContent?.ocrText || "", "已复制画面文字。");
});

$("copyCollection").addEventListener("click", async () => {
  await loadCollection();
  const label = currentMode() === "lean" ? "瘦身稿" : "全量稿";
  await copyText(collectionDraftForAi(collection), `已按采集顺序复制集合 ${collection.length} 条（${label}）。`);
});

$("clearCollection").addEventListener("click", async () => {
  // 只动 collection 那把 key。笔记与文件夹在另外两张表里，这里碰不到。
  collection = [];
  await saveCollection();
  notify("集合已清空（笔记不受影响）。", "ok");
});

// 笔记模块要的东西显式传进去，不靠跨文件的隐式全局。
// 先把笔记读出来再跑采集：run() 中途会调 setPageRef -> SocialNotes.render()。
SocialNotes.init({
  $,
  setStatus: notify,
  humanError,
  hostOf,
  shortTime,
  formatTime,
  formatExtracted: leanDraft,
  downloadText,
  switchTab,
  getPageRef: () => currentPageRef,
  getPageIdentity: currentPageIdentity,
  getContent: () => currentContent,
  onNotesChanged: renderNoteFlag,
})
  .then(loadSettings)
  .then(run);

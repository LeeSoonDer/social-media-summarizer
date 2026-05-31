let lastContent = null;
let lastOutput = "";

function setStatus(text, type = "") {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = type;
}

function isInjectableUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "ping" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
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

function section(title, value) {
  if (Array.isArray(value)) {
    if (!value.length) return "";
    return `## ${title}\n${value.map((item) => `- ${item}`).join("\n")}`;
  }
  if (!value) return "";
  return `## ${title}\n${value}`;
}

function buildSuggestedPrompt(content) {
  const transcriptHint = content.transcript
    ? "Use the transcript/captions as the primary source for video spoken content."
    : "If this is a video and no transcript is included, say that spoken content may be missing.";

  return [
    "Please analyze the extracted social media content below.",
    "Return:",
    "1. concise summary",
    "2. key points",
    "3. important context",
    "4. claims or advice that should be verified",
    "5. actionable takeaways",
    transcriptHint,
  ].join("\n");
}

function formatExtracted(content) {
  const prompt = buildSuggestedPrompt(content);
  const parts = [
    "# Extracted Social Content",
    `Platform: ${content.platform || "unknown"}`,
    `URL: ${content.url || ""}`,
    `Extracted At: ${new Date().toISOString()}`,
    "",
    section("Title", content.title),
    section("Author", content.author),
    section("Main Text", content.body),
    section("Transcript / Captions", content.transcript),
    section("Hashtags", content.tags),
    section("Mentions", content.mentions),
    section("Comments", content.comments),
    section("Images", content.images),
    section("Videos", content.videos),
    section("Links", content.links),
    section("Metadata", content.metadata),
    "## Suggested AI Prompt",
    prompt,
  ].filter(Boolean);
  return parts.join("\n\n");
}

function buildTip(content) {
  const hasVideo = (content.videos?.length || 0) > 0 || content.platform === "youtube";
  if (!hasVideo) return "";
  if (content.transcript) return "已检测到字幕/转录内容。复制全文后可直接交给网页版 AI 分析。";
  if (content.platform === "youtube") return "未检测到完整字幕。CC 只显示当前几句，不等于完整 transcript；如果视频有字幕轨道，请重新提取或打开文字记录面板。";
  return "检测到视频，但未检测到字幕。当前 no-API 版本只能提取页面文字、视频链接和可见 caption。";
}

function render(content) {
  lastContent = content;
  lastOutput = formatExtracted(content);
  document.getElementById("output").value = lastOutput;
  document.getElementById("copy").disabled = !lastOutput;
  document.getElementById("copyPrompt").disabled = !lastOutput;
  document.getElementById("platform").textContent = `Platform: ${content.platform || "unknown"}`;
  document.getElementById("counts").textContent = [
    `Text ${content.body ? "yes" : "no"}`,
    `Transcript ${content.transcript ? "yes" : "no"}`,
    `Images ${content.images?.length || 0}`,
    `Videos ${content.videos?.length || 0}`,
    `Comments ${content.comments?.length || 0}`,
  ].join(" / ");

  const tip = buildTip(content);
  const tipEl = document.getElementById("tips");
  tipEl.textContent = tip;
  tipEl.style.display = tip ? "block" : "none";
}

async function run() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    setStatus("无法获取当前标签页。", "error");
    return;
  }
  if (!isInjectableUrl(tab.url)) {
    setStatus("此页面不允许注入脚本。请在普通网页使用。", "error");
    return;
  }

  setStatus("正在提取页面内容...", "loading");
  try {
    const content = await extractFromTab(tab.id);
    if (!content || content.error) throw new Error(content?.message || "提取失败");
    render(content);
    setStatus("提取完成。可复制到网页版 AI。", "");
  } catch (err) {
    setStatus(String(err?.message || err), "error");
  }
}

document.getElementById("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(lastOutput || document.getElementById("output").value);
  setStatus("已复制全文。", "");
});

document.getElementById("copyPrompt").addEventListener("click", async () => {
  if (!lastContent) return;
  await navigator.clipboard.writeText(`${buildSuggestedPrompt(lastContent)}\n\n${lastOutput}`);
  setStatus("已复制 AI Prompt + 提取内容。", "");
});

document.getElementById("refresh").addEventListener("click", run);
document.addEventListener("DOMContentLoaded", run);

const STORAGE_KEY = "geminiApiKey";
const GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const SUMMARY_PROMPT = `你是社交媒体内容分析助手。根据以下页面文字与图片，输出结构化 JSON（仅 JSON，无 markdown）：

{
  "platform": "xiaohongshu 或 instagram",
  "content_type": "post",
  "中文总结": "2-4 句中文摘要",
  "English Summary": "2-4 sentence English summary",
  "要点 / Key Points": ["要点1", "要点2"],
  "提到的工具或产品": ["产品或工具名，无则空数组"],
  "行动建议": ["可执行建议，无则空数组"]
}`;

function setStatus(text, type = "") {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = type;
}

function showResults(show) {
  document.getElementById("results").style.display = show ? "block" : "none";
}

function setTextField(id, value) {
  const valueEl = document.querySelector(`#${id} .value`);
  if (!value) {
    valueEl.textContent = "（无）";
    valueEl.classList.add("empty");
    return;
  }
  valueEl.classList.remove("empty");
  valueEl.textContent = value;
}

function setListField(id, items) {
  const listEl = document.querySelector(`#${id} .value`);
  listEl.innerHTML = "";
  if (!items?.length) {
    const li = document.createElement("li");
    li.textContent = "（无）";
    li.className = "empty";
    listEl.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    listEl.appendChild(li);
  }
}

function isSupportedUrl(url) {
  try {
    const { hostname } = new URL(url);
    return hostname.includes("xiaohongshu.com") || hostname.includes("instagram.com");
  } catch {
    return false;
  }
}

function openOptions(e) {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
}

document.getElementById("openOptions").addEventListener("click", openOptions);
document.getElementById("setupLink")?.addEventListener("click", openOptions);

async function getApiKey() {
  const { [STORAGE_KEY]: key } = await chrome.storage.local.get(STORAGE_KEY);
  return key?.trim() || "";
}

function buildPageContext(content) {
  return [
    `平台: ${content.platform}`,
    `URL: ${content.url}`,
    `标题: ${content.title || "（无）"}`,
    `正文: ${content.body || "（无）"}`,
    `标签: ${(content.tags || []).join(", ") || "（无）"}`,
    `图片数量: ${content.imageData?.length || 0}`,
  ].join("\n");
}

function parseSummaryJson(text) {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("invalid_json");
  return JSON.parse(jsonMatch[0]);
}

function buildParts(content, includeImages) {
  const parts = [{ text: `${SUMMARY_PROMPT}\n\n---\n页面内容:\n${buildPageContext(content)}` }];
  if (!includeImages) return parts;

  for (const img of content.imageData || []) {
    if (!img.data || img.data.length > 4_000_000) continue;
    parts.push({
      inline_data: {
        mime_type: img.mimeType || "image/jpeg",
        data: img.data,
      },
    });
  }
  return parts;
}

async function requestGemini(apiKey, model, parts) {
  const res = await fetch(
    `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.4,
        },
      }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.model = model;
    err.details = data?.error?.details || [];
    throw err;
  }

  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  const finish = candidate?.finishReason;

  if (finish === "SAFETY") throw new Error("safety_blocked");
  if (!text) throw new Error("empty_response");
  return parseSummaryJson(text);
}

async function callGemini(apiKey, content) {
  const attempts = [
    { includeImages: true, label: "图文" },
    { includeImages: false, label: "纯文字" },
  ];

  let lastError = null;
  const rateLimitErrors = [];

  for (const attempt of attempts) {
    const parts = buildParts(content, attempt.includeImages);

    for (const model of GEMINI_MODELS) {
      try {
        return await requestGemini(apiKey, model, parts);
      } catch (err) {
        lastError = err;
        const msg = err.message || "";
        if (err.status === 429) {
          rateLimitErrors.push(`${model} (${attempt.label}): ${msg}`);
          continue;
        }
        if (msg.includes("API key") || msg.includes("API_KEY")) {
          throw new Error("invalid_api_key");
        }
        if (err.status === 404 || msg.includes("not found")) continue;
        if (attempt.includeImages && (err.status === 400 || msg.includes("image"))) break;
      }
    }
  }

  if (rateLimitErrors.length) {
    const err = new Error(`rate_limited: ${rateLimitErrors.join(" | ")}`);
    err.status = 429;
    throw err;
  }

  throw lastError || new Error("all_models_failed");
}

function renderSummary(summary) {
  showResults(true);
  setTextField("summaryZh", summary["中文总结"]);
  setTextField("summaryEn", summary["English Summary"]);
  setListField("keyPoints", summary["要点 / Key Points"]);
  setListField("products", summary["提到的工具或产品"]);
  setListField("actions", summary["行动建议"]);
}

function mapError(err) {
  const code = err?.message || String(err);
  if (code === "invalid_api_key") return "API Key 无效，请在设置中检查。";
  if (code === "quota_exceeded") return "API 配额已用尽，请稍后再试。";
  if (code.startsWith("rate_limited:")) {
    return `Gemini 返回限速/配额错误：${code.replace("rate_limited: ", "")}`;
  }
  if (code === "invalid_json") return "AI 返回格式异常，请重试。";
  if (code === "safety_blocked") return "内容被安全策略拦截，请换一篇帖子。";
  if (code === "empty_response") return "AI 无返回内容，请重试。";
  if (code === "all_models_failed") return "所有模型均不可用，请检查 API Key 与网络。";
  return code.length > 180 ? `${code.slice(0, 180)}…` : code;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "ping" });
    return;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  }
}

async function extractFromTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { action: "extractWithImages" });
  } catch {
    await ensureContentScript(tabId);
    return await chrome.tabs.sendMessage(tabId, { action: "extractWithImages" });
  }
}

async function run() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    document.getElementById("setup-hint").style.display = "block";
    setStatus("需要配置 API Key", "error");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    setStatus("无法获取当前标签页。", "error");
    return;
  }

  if (!isSupportedUrl(tab.url)) {
    setStatus("请在小红书或 Instagram 页面使用。", "error");
    return;
  }

  setStatus("正在提取页面内容…", "loading");

  let content;
  try {
    content = await extractFromTab(tab.id);
  } catch {
    setStatus("无法连接页面脚本，请刷新页面后重试。", "error");
    return;
  }

  if (!content || content.error) {
    setStatus(content?.message || "提取失败", "error");
    return;
  }

  setStatus("正在调用 Gemini 生成总结…", "loading");

  try {
    const summary = await callGemini(apiKey, content);
    renderSummary(summary);
    setStatus("总结完成");
  } catch (err) {
    setStatus(mapError(err), "error");
  }
}

document.addEventListener("DOMContentLoaded", run);

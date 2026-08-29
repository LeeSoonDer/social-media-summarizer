const COLLECTION_KEY = "socialExtractorCollection";
const MAX_COLLECTION_ITEMS = 80;
const OCR_LANGS = "eng+chi_sim+chi_tra";

let lastContent = null;
let lastOutput = "";
let collection = [];
let ocrWorkerPromise = null;

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

function usefulOcrLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 2)
    .filter((line) => !/^[\W_]+$/.test(line));
}

function cleanOcrText(text) {
  const seen = new Set();
  const lines = [];
  for (const line of usefulOcrLines(text)) {
    const compact = line.replace(/\s+/g, " ");
    if (seen.has(compact)) continue;
    seen.add(compact);
    lines.push(compact);
    if (lines.length >= 160) break;
  }
  return lines.join("\n");
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
  const parts = [
    heading,
    section("Title", content.title),
    section("Main Text / Caption", content.body),
    section("OCR Text From Screenshot", content.ocrText),
  ].filter(Boolean);
  return parts.join("\n\n");
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

function collectionFingerprint(content) {
  return [
    content.url,
    content.title,
    content.body,
    content.ocrText,
  ].join("\n").slice(0, 30000);
}

async function loadCollection() {
  const result = await chrome.storage.local.get(COLLECTION_KEY);
  collection = Array.isArray(result[COLLECTION_KEY]) ? result[COLLECTION_KEY] : [];
  updateCollectionUi();
}

async function saveCollection() {
  await chrome.storage.local.set({ [COLLECTION_KEY]: collection });
  updateCollectionUi();
}

function updateCollectionUi(savedLabel = "-") {
  document.getElementById("batchCount").textContent = `Collection: ${collection.length} pages`;
  document.getElementById("lastSaved").textContent = `Current: ${savedLabel}`;
  document.getElementById("copyBatch").disabled = collection.length === 0;
}

async function addToCollection(content) {
  const item = {
    ...content,
    extractedAt: new Date().toISOString(),
    fingerprint: collectionFingerprint(content),
  };
  const existingIndex = collection.findIndex((entry) => entry.url === item.url && entry.fingerprint === item.fingerprint);
  if (existingIndex >= 0) {
    collection[existingIndex] = item;
    await saveCollection();
    updateCollectionUi("updated");
    return "updated";
  }
  collection.push(item);
  if (collection.length > MAX_COLLECTION_ITEMS) {
    collection = collection.slice(collection.length - MAX_COLLECTION_ITEMS);
  }
  await saveCollection();
  updateCollectionUi("saved");
  return "added";
}

function buildTip(content) {
  const base = "Current page was saved to the collection. Open the next slide/page and open the extension again to keep collecting.";
  if (content.ocrText) return `${base} OCR text was detected from the screenshot.`;
  return `${base} No OCR text was detected from the visible screenshot.`;
}

function render(content) {
  lastContent = content;
  lastOutput = formatSingleOutput(content);
  document.getElementById("output").value = lastOutput;
  document.getElementById("copy").disabled = !lastOutput;
  document.getElementById("platform").textContent = `Platform: ${content.platform || "unknown"}`;
  document.getElementById("counts").textContent = [
    `Text ${content.body ? "yes" : "no"}`,
    `OCR ${content.ocrText ? "yes" : "no"}`,
    `Images ${content.images?.length || 0}`,
    `Videos ${content.videos?.length || 0}`,
  ].join(" / ");

  const tip = buildTip(content);
  const tipEl = document.getElementById("tips");
  tipEl.textContent = tip;
  tipEl.style.display = tip ? "block" : "none";
}

async function getOcrWorker() {
  if (ocrWorkerPromise) return ocrWorkerPromise;
  if (!window.Tesseract?.createWorker) throw new Error("OCR runtime not loaded");

  ocrWorkerPromise = Tesseract.createWorker(OCR_LANGS, 1, {
    workerPath: chrome.runtime.getURL("vendor/tesseract/worker.min.js"),
    corePath: chrome.runtime.getURL("vendor/tesseract/core"),
    langPath: chrome.runtime.getURL("vendor/tesseract/lang"),
    workerBlobURL: false,
    gzip: true,
    cacheMethod: "write",
    logger: (message) => {
      if (!message?.status) return;
      const pct = typeof message.progress === "number" ? ` ${Math.round(message.progress * 100)}%` : "";
      setStatus(`OCR: ${message.status}${pct}`, "loading");
    },
  }).then(async (worker) => {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      user_defined_dpi: "180",
    });
    return worker;
  });

  return ocrWorkerPromise;
}

async function captureCurrentTabImage(tab) {
  return chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
}

async function runOcr(tab) {
  setStatus("Capturing screenshot for OCR...", "loading");
  const dataUrl = await captureCurrentTabImage(tab);
  setStatus("Loading OCR engine...", "loading");
  const worker = await getOcrWorker();
  setStatus("Recognizing image text...", "loading");
  const result = await worker.recognize(dataUrl);
  return cleanOcrText(result?.data?.text || "");
}

async function run() {
  await loadCollection();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    setStatus("Cannot get current tab.", "error");
    return;
  }
  if (!isInjectableUrl(tab.url)) {
    setStatus("This page cannot be extracted.", "error");
    return;
  }

  setStatus("Extracting page text...", "loading");
  try {
    const content = await extractFromTab(tab.id);
    if (!content || content.error) throw new Error(content?.message || "Extraction failed");

    try {
      const ocrText = await runOcr(tab);
      content.ocrText = ocrText;
      content.metadata = [...(content.metadata || []), ocrText ? "OCR screenshot text detected." : "OCR ran, but no screenshot text was detected."];
    } catch (ocrErr) {
      content.ocrText = "";
      content.metadata = [...(content.metadata || []), `OCR failed: ${String(ocrErr?.message || ocrErr)}`];
    }

    render(content);
    const result = await addToCollection(content);
    setStatus(result === "added" ? "Saved page to collection." : "Updated collection item.", "");
  } catch (err) {
    setStatus(String(err?.message || err), "error");
  }
}

document.getElementById("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(lastOutput || document.getElementById("output").value);
  setStatus("Copied current page.", "");
});

document.getElementById("copyBatch").addEventListener("click", async () => {
  await loadCollection();
  const output = formatBatchOutput(collection);
  await navigator.clipboard.writeText(output);
  document.getElementById("output").value = output;
  setStatus("Copied collection prompt and all collected content.", "");
});

document.getElementById("clearBatch").addEventListener("click", async () => {
  collection = [];
  await saveCollection();
  setStatus("Collection cleared.", "");
});

document.getElementById("refresh").addEventListener("click", run);
document.addEventListener("DOMContentLoaded", run);

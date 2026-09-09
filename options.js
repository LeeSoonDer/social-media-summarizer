// 设置页 · Phase 6
// 稿件档位 / 评论开关 / OCR 语言 / 集合上限 / 全量备份导出导入 / 下线 Gemini key。
// 所有设置写进 socialExtractorSettings，侧栏靠 storage.onChanged 跟上。

const LEGACY_KEY = "geminiApiKey";
const S = self.SocialStore;

const $ = (id) => document.getElementById(id);

function say(text, type = "") {
  const el = $("msg");
  el.textContent = text;
  el.className = type;
}

function humanError(err) {
  const raw = String(err?.message || err || "未知错误");
  if (/quota|QUOTA/i.test(raw)) return "本机存储已满。先导出备份，再到侧栏清空集合腾地方。";
  return raw;
}

async function save(patch) {
  try {
    await S.saveSettings(patch);
    say("已保存。", "ok");
  } catch (err) {
    say(`保存失败：${humanError(err)}`, "err");
  }
}

async function loadSettings() {
  const settings = await S.getSettings();
  $("aiPromptMode").value = settings.aiPromptMode === "full" ? "full" : "lean";
  $("commentsEnabled").checked = settings.commentsEnabled === true;
  $("ocrLang").value = ["eng", "eng+chi_sim", "eng+chi_sim+chi_tra"].includes(settings.ocrLang)
    ? settings.ocrLang
    : "eng+chi_sim";
  $("maxCollectionItems").value = Number(settings.maxCollectionItems) || 80;
}

async function refreshStat() {
  try {
    const backup = await S.exportAll();
    $("stat").textContent =
      `本机现有：集合 ${backup.collection.length} 页 · 笔记 ${backup.notes.length} 条 · 文件夹 ${backup.folders.length} 个`;
  } catch (err) {
    $("stat").textContent = `读不到本机数据：${humanError(err)}`;
  }
}

async function refreshKeyState() {
  const stored = await chrome.storage.local.get(LEGACY_KEY);
  const has = !!stored[LEGACY_KEY];
  $("keyState").textContent = has
    ? "本机还存着一个旧的 Gemini Key（没有被任何功能使用）。"
    : "本机没有保存任何 Gemini Key。";
  $("clearKey").disabled = !has;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/* ---------- 事件 ---------- */

$("aiPromptMode").addEventListener("change", (event) => save({ aiPromptMode: event.target.value }));
$("commentsEnabled").addEventListener("change", (event) => save({ commentsEnabled: event.target.checked }));
$("ocrLang").addEventListener("change", (event) => save({ ocrLang: event.target.value }));

$("maxCollectionItems").addEventListener("change", (event) => {
  const value = Number(event.target.value);
  if (!Number.isFinite(value) || value < 10) {
    say("集合上限至少 10 页，已改回原值。", "err");
    loadSettings();
    return;
  }
  save({ maxCollectionItems: Math.min(500, Math.floor(value)) });
});

$("exportJson").addEventListener("click", async () => {
  try {
    const backup = await S.exportAll();
    downloadJson(`social-extractor-${stamp()}.json`, backup);
    say(`已导出：集合 ${backup.collection.length} 页、笔记 ${backup.notes.length} 条。`, "ok");
  } catch (err) {
    say(`导出失败：${humanError(err)}`, "err");
  }
});

$("importPick").addEventListener("click", () => $("importFile").click());

$("importFile").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = ""; // 让同一个文件能再选一次
  if (!file) return;

  try {
    const raw = JSON.parse(await file.text());
    S.validateBackup(raw); // 先整份校验，宁可一条都不导，也不要导进来一半

    const current = await S.exportAll();
    const ok = confirm(
      [
        "导入会覆盖本机现有数据：",
        `　现在：集合 ${current.collection.length} 页 · 笔记 ${current.notes.length} 条`,
        `　导入：集合 ${(raw.collection || []).length} 页 · 笔记 ${(raw.notes || []).length} 条`,
        "",
        "确定要覆盖吗？",
      ].join("\n")
    );
    if (!ok) {
      say("已取消，什么都没改。", "");
      return;
    }

    const result = await S.importAll(raw);
    await loadSettings();
    await refreshStat();
    say(`已导入：集合 ${result.collection} 页、笔记 ${result.notes} 条、文件夹 ${result.folders} 个。`, "ok");
  } catch (err) {
    say(`导入失败：${humanError(err)}`, "err");
  }
});

$("clearKey").addEventListener("click", async () => {
  try {
    await chrome.storage.local.remove(LEGACY_KEY);
    await refreshKeyState();
    say("已删掉本机保存的 Gemini Key。", "ok");
  } catch (err) {
    say(`删除失败：${humanError(err)}`, "err");
  }
});

/* ---------- 启动 ---------- */

(async () => {
  try {
    await loadSettings();
    await refreshStat();
    await refreshKeyState();
  } catch (err) {
    say(`设置读取失败：${humanError(err)}`, "err");
  }
})();

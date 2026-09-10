// 视口截图 + 本地 Tesseract OCR。
// Phase 4：送进 Tesseract 前先按 2x 放大；多屏结果按行合并去重。
// 依赖：调用方先加载 vendor/tesseract/tesseract.min.js。
(function () {
  const MAX_LINES_PER_PASS = 160;
  const MAX_MERGED_LINES = 400;
  const MAX_PASSES = 12;
  const UPSCALE = 2;
  const MAX_CANVAS_SIDE = 4000; // 放大后别超过这个边长，免得大屏截图吃爆内存
  const DEFAULT_LANGS = "eng+chi_sim";

  let workerPromise = null;
  let progressHandler = null;

  // 默认不带 chi_tra：那个语言包 26MB，起 worker 时要整个加载，简体页面用不上。
  // 设置页可以改，改了就把旧 worker 丢掉重建。
  let ocrLangs = DEFAULT_LANGS;

  function setLangs(langs) {
    const next = String(langs || "").trim() || DEFAULT_LANGS;
    if (next === ocrLangs) return;
    ocrLangs = next;
    workerPromise = null;
  }

  // Tesseract 的 logger 吐的是英文 status，直接透给用户就成了
  // 「OCR：recognizing text 45%」。这里翻成人话。
  const STATUS_ZH = {
    "loading tesseract core": "正在装载识别引擎",
    "loading tesseract": "正在装载识别引擎",
    "initializing tesseract": "正在初始化引擎",
    "loading language traineddata": "正在装载语言包",
    "loading language traineddata (from cache)": "正在装载语言包",
    "initializing api": "正在准备识别",
    "recognizing text": "正在识别文字",
    "done": "识别完成",
  };

  function zhStatus(status) {
    const key = String(status || "").toLowerCase().trim();
    if (STATUS_ZH[key]) return STATUS_ZH[key];
    // 没收录的状态别把英文原文丢给用户，给个笼统但中文的说法。
    if (key.includes("load")) return "正在装载";
    if (key.includes("recogniz")) return "正在识别文字";
    if (key.includes("initializ")) return "正在初始化";
    return "正在处理";
  }

  function usefulOcrLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 2)
      // 只丢纯符号噪声。必须用 Unicode 类：JS 的 \w 不含中文，
      // 原来的 /^[\W_]+$/ 会把整行中文当噪声删掉。
      .filter((line) => /[\p{L}\p{N}]/u.test(line));
  }

  // 比对用的形态：去掉空白与常见标点，中英文大小写归一。
  // OCR 在不同屏上对同一行字的空格/标点判断经常不一致，不归一就去不掉重复。
  function dedupeKey(line) {
    return line
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[.,，。、；;：:!！?？·・…—\-_'"“”‘’()（）\[\]【】]/g, "");
  }

  function cleanOcrText(text, limit = MAX_LINES_PER_PASS) {
    const seen = new Set();
    const lines = [];
    for (const line of usefulOcrLines(text)) {
      const compact = line.replace(/\s+/g, " ");
      const key = dedupeKey(compact);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      lines.push(compact);
      if (lines.length >= limit) break;
    }
    return lines.join("\n");
  }

  // 多屏合并：按扫描先后铺开，逐行去重。轮播每一屏的用户名、关注按钮、
  // 点赞数都是一模一样的，去重后只剩真正新增的内容。
  function mergePasses(passes) {
    const seen = new Set();
    const lines = [];
    for (const pass of passes || []) {
      for (const line of usefulOcrLines(pass?.text)) {
        const compact = line.replace(/\s+/g, " ");
        const key = dedupeKey(compact);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        lines.push(compact);
        if (lines.length >= MAX_MERGED_LINES) return lines.join("\n");
      }
    }
    return lines.join("\n");
  }

  // 同一屏重复扫（比如连点两下刷新）不该再堆一条 pass。
  function isDuplicatePass(passes, text) {
    const key = dedupeKey(String(text || ""));
    if (!key) return false;
    return (passes || []).some((pass) => dedupeKey(String(pass?.text || "")) === key);
  }

  function appendPass(passes, text) {
    const clean = cleanOcrText(text);
    const list = [...(passes || [])];
    if (!clean) return { passes: list, added: false, reason: "empty" };
    if (isDuplicatePass(list, clean)) return { passes: list, added: false, reason: "duplicate" };
    list.push({ text: clean, at: new Date().toISOString() });
    // 超上限就丢最早的一屏，保住最近扫的。
    while (list.length > MAX_PASSES) list.shift();
    return { passes: list, added: true, reason: "" };
  }

  /* ---------- 引擎 ---------- */

  function getWorker() {
    if (workerPromise) return workerPromise;
    if (!self.Tesseract?.createWorker) {
      return Promise.reject(new Error("OCR 引擎未加载，请重新打开侧栏"));
    }

    workerPromise = Tesseract.createWorker(ocrLangs, 1, {
      workerPath: chrome.runtime.getURL("vendor/tesseract/worker.min.js"),
      corePath: chrome.runtime.getURL("vendor/tesseract/core"),
      langPath: chrome.runtime.getURL("vendor/tesseract/lang"),
      workerBlobURL: false,
      gzip: true,
      cacheMethod: "write",
      logger: (message) => {
        if (!message?.status || !progressHandler) return;
        const pct = typeof message.progress === "number" ? ` ${Math.round(message.progress * 100)}%` : "";
        progressHandler(`${zhStatus(message.status)}${pct}`);
      },
    }).then(async (worker) => {
      await worker.setParameters({
        preserve_interword_spaces: "1",
        user_defined_dpi: "180",
      });
      return worker;
    }).catch((err) => {
      workerPromise = null;
      throw err;
    });

    return workerPromise;
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("截图解码失败"));
      img.src = dataUrl;
    });
  }

  // 放大再识别：社媒正文字号小，Tesseract 在原始像素上对中文很吃力。
  // 失败就退回原图，绝不因为预处理挂掉整次扫描。
  async function upscale(dataUrl, scale = UPSCALE) {
    try {
      if (typeof document === "undefined" || !document.createElement) return dataUrl;
      const img = await loadImage(dataUrl);
      const longest = Math.max(img.width || 0, img.height || 0);
      if (!longest) return dataUrl;
      const factor = Math.min(scale, MAX_CANVAS_SIDE / longest);
      if (factor <= 1) return dataUrl;

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * factor);
      canvas.height = Math.round(img.height * factor);
      const ctx = canvas.getContext("2d");
      if (!ctx) return dataUrl;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas;
    } catch {
      return dataUrl;
    }
  }

  // tab: chrome.tabs.Tab；onProgress: (人话进度) => void
  async function runOcr(tab, onProgress) {
    progressHandler = typeof onProgress === "function" ? onProgress : null;
    try {
      progressHandler?.("正在截取当前视口");
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      progressHandler?.("正在放大画面");
      const source = await upscale(dataUrl);
      progressHandler?.("正在载入 OCR 引擎");
      const worker = await getWorker();
      progressHandler?.("正在识别画面文字");
      const result = await worker.recognize(source);
      return cleanOcrText(result?.data?.text || "");
    } finally {
      progressHandler = null;
    }
  }

  self.SocialOcr = {
    runOcr,
    cleanOcrText,
    mergePasses,
    appendPass,
    upscale,
    setLangs,
    getLangs: () => ocrLangs,
    zhStatus,
    MAX_PASSES,
  };
})();

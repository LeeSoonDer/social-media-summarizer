// 视口截图 + 本地 Tesseract OCR。
// Phase 4：送进 Tesseract 前先按 2x 放大；多屏结果按行合并去重。
// 降噪改造：截图先裁到内容区再放大，识别结果按行的置信度过闸。
// 依赖：调用方先加载 vendor/tesseract/tesseract.min.js。
(function () {
  const MAX_LINES_PER_PASS = 160;
  const MAX_MERGED_LINES = 400;
  const MAX_PASSES = 12;
  const UPSCALE = 2;
  const MAX_CANVAS_SIDE = 4000; // 放大后别超过这个边长，免得大屏截图吃爆内存
  const MIN_CROP_SIDE = 40; // 裁出来比这还小说明取景数据不对，退回整屏
  const MIN_LINE_CONFIDENCE = 60; // Tesseract 给每行的把握度，低于这个当噪声
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

  /* ---------- 行级过滤 ---------- */

  // 符号占比过高的行基本是图标、边框、圆角头像被当成了字。
  // 正常中文句子带标点实字占比也在 0.8 以上，0.5 这道线不会误伤。
  function isSymbolSoup(line) {
    const chars = [...line.replace(/\s/g, "")];
    if (!chars.length) return true;
    const real = chars.filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length;
    return real / chars.length < 0.5;
  }

  // 「口口口口」「|||||」这类单字重复行是 OCR 对着网格或分隔线的典型产物。
  function isRepeatedChar(line) {
    const compact = line.replace(/\s/g, "");
    return compact.length >= 3 && new Set(compact).size === 1;
  }

  function usefulOcrLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 2)
      // 只丢纯符号噪声。必须用 Unicode 类：JS 的 \w 不含中文，
      // 原来的 /^[\W_]+$/ 会把整行中文当噪声删掉。
      .filter((line) => /[\p{L}\p{N}]/u.test(line))
      .filter((line) => !isSymbolSoup(line))
      .filter((line) => !isRepeatedChar(line));
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

  // Tesseract 对每一行都给了把握度，之前只取 data.text 等于把它整个扔了。
  // 图标、头像、渐变背景被当成字的时候，那几行的 confidence 通常明显低于真文字。
  // 但闸门也可能一刀切光（字太小、背景太花），那就退回全文——宁可多也别交白卷。
  function confidentText(data, minConfidence = MIN_LINE_CONFIDENCE) {
    const raw = String(data?.text || "");
    if (!Array.isArray(data?.blocks)) return raw; // 没要到 blocks 就照旧
    const lines = [];
    for (const block of data.blocks) {
      for (const paragraph of block?.paragraphs || []) {
        for (const line of paragraph?.lines || []) {
          const text = String(line?.text || "").trim();
          if (!text) continue;
          if (Number(line?.confidence) < minConfidence) continue;
          lines.push(text);
        }
      }
    }
    const kept = lines.join("\n");
    return kept.trim() || raw;
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

  // 截图是设备像素，取景矩形是 CSS 像素。优先用「截图宽 ÷ 视口宽」反推倍率，
  // 比直接信 devicePixelRatio 稳：Chrome 在高分屏上会给截图封顶。
  function captureRatio(img, target) {
    const viewportWidth = Number(target?.viewport?.width) || 0;
    if (viewportWidth > 0 && img.width > 0) return img.width / viewportWidth;
    return Number(target?.dpr) || 1;
  }

  // 取景矩形换算成截图里的源区域。数据不对就退回整屏。
  function sourceBox(img, target) {
    const rect = target?.rect;
    if (!rect) return { sx: 0, sy: 0, sw: img.width, sh: img.height, cropped: false };

    const ratio = captureRatio(img, target);
    const sx = Math.max(0, Math.round(Number(rect.left) * ratio));
    const sy = Math.max(0, Math.round(Number(rect.top) * ratio));
    const sw = Math.min(img.width - sx, Math.round(Number(rect.width) * ratio));
    const sh = Math.min(img.height - sy, Math.round(Number(rect.height) * ratio));
    if (!(sw >= MIN_CROP_SIDE) || !(sh >= MIN_CROP_SIDE)) {
      return { sx: 0, sy: 0, sw: img.width, sh: img.height, cropped: false };
    }
    return { sx, sy, sw, sh, cropped: true };
  }

  // 裁剪 + 放大一次画完。
  // 先裁再放大是这次降噪的重点：原来整屏 2x，1920×1080 的屏要开一张
  // 3840×2160 的画布（约 33MB 像素）；裁到内容区之后通常只剩零头，
  // 既少喂 Tesseract 一堆导航栏和侧栏推荐，也少占一大块内存。
  // 任何一步出问题都退回原图，绝不因为预处理挂掉整次扫描。
  async function prepareImage(dataUrl, target, scale = UPSCALE) {
    try {
      if (typeof document === "undefined" || !document.createElement) {
        return { source: dataUrl, canvas: null, cropped: false };
      }
      const img = await loadImage(dataUrl);
      const box = sourceBox(img, target);
      const longest = Math.max(box.sw, box.sh);
      if (!longest) return { source: dataUrl, canvas: null, cropped: false };

      const factor = Math.max(1, Math.min(scale, MAX_CANVAS_SIDE / longest));
      if (factor <= 1 && !box.cropped) return { source: dataUrl, canvas: null, cropped: false };

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(box.sw * factor);
      canvas.height = Math.round(box.sh * factor);
      const ctx = canvas.getContext("2d");
      if (!ctx) return { source: dataUrl, canvas: null, cropped: false };
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, box.sx, box.sy, box.sw, box.sh, 0, 0, canvas.width, canvas.height);
      return { source: canvas, canvas, cropped: box.cropped };
    } catch {
      return { source: dataUrl, canvas: null, cropped: false };
    }
  }

  // tab: chrome.tabs.Tab；onProgress: (人话进度) => void
  // target: content.js 的 ocrTarget 回执 { rect, viewport, dpr, label }，给 null 就扫整屏。
  // 返回 { text, cropped, label }。
  async function runOcr(tab, onProgress, target) {
    progressHandler = typeof onProgress === "function" ? onProgress : null;
    let canvas = null;
    try {
      progressHandler?.("正在截取当前视口");
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      progressHandler?.(target?.rect ? `正在裁出${target.label || "内容区"}` : "正在放大画面");
      const prepared = await prepareImage(dataUrl, target);
      canvas = prepared.canvas;
      progressHandler?.("正在载入 OCR 引擎");
      const worker = await getWorker();
      progressHandler?.("正在识别画面文字");
      const result = await worker.recognize(prepared.source, {}, { text: true, blocks: true });
      return {
        text: cleanOcrText(confidentText(result?.data)),
        cropped: prepared.cropped,
        label: prepared.cropped ? target?.label || "内容区" : "",
      };
    } finally {
      // 画布不主动清掉会一直占着像素内存，等 GC 不靠谱。
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      progressHandler = null;
    }
  }

  self.SocialOcr = {
    runOcr,
    cleanOcrText,
    confidentText,
    mergePasses,
    appendPass,
    prepareImage,
    sourceBox,
    setLangs,
    getLangs: () => ocrLangs,
    zhStatus,
    MAX_PASSES,
    MIN_LINE_CONFIDENCE,
  };
})();

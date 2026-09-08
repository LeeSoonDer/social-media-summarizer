// 视口截图 + 本地 Tesseract OCR。从 popup.js 原样迁出，逻辑未改。
// 依赖：调用方先加载 vendor/tesseract/tesseract.min.js。
(function () {
  const OCR_LANGS = "eng+chi_sim+chi_tra";
  const MAX_OCR_LINES = 160;

  let workerPromise = null;
  let progressHandler = null;

  function usefulOcrLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 2)
      // 只丢纯符号噪声。必须用 Unicode 类：JS 的 \w 不含中文，
      // 原来的 /^[\W_]+$/ 会把整行中文当噪声删掉。
      .filter((line) => /[\p{L}\p{N}]/u.test(line));
  }

  function cleanOcrText(text) {
    const seen = new Set();
    const lines = [];
    for (const line of usefulOcrLines(text)) {
      const compact = line.replace(/\s+/g, " ");
      if (seen.has(compact)) continue;
      seen.add(compact);
      lines.push(compact);
      if (lines.length >= MAX_OCR_LINES) break;
    }
    return lines.join("\n");
  }

  function getWorker() {
    if (workerPromise) return workerPromise;
    if (!self.Tesseract?.createWorker) {
      return Promise.reject(new Error("OCR 引擎未加载，请重新打开侧栏"));
    }

    workerPromise = Tesseract.createWorker(OCR_LANGS, 1, {
      workerPath: chrome.runtime.getURL("vendor/tesseract/worker.min.js"),
      corePath: chrome.runtime.getURL("vendor/tesseract/core"),
      langPath: chrome.runtime.getURL("vendor/tesseract/lang"),
      workerBlobURL: false,
      gzip: true,
      cacheMethod: "write",
      logger: (message) => {
        if (!message?.status || !progressHandler) return;
        const pct = typeof message.progress === "number" ? ` ${Math.round(message.progress * 100)}%` : "";
        progressHandler(`${message.status}${pct}`);
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

  // tab: chrome.tabs.Tab；onProgress: (人话进度) => void
  async function runOcr(tab, onProgress) {
    progressHandler = typeof onProgress === "function" ? onProgress : null;
    try {
      progressHandler?.("正在截取当前视口");
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      progressHandler?.("正在载入 OCR 引擎");
      const worker = await getWorker();
      progressHandler?.("正在识别画面文字");
      const result = await worker.recognize(dataUrl);
      return cleanOcrText(result?.data?.text || "");
    } finally {
      progressHandler = null;
    }
  }

  self.SocialOcr = { runOcr, cleanOcrText, OCR_LANGS };
})();

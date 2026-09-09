// 给 AI 的稿件成型 · Phase 3
//
// 两档：
//   lean 瘦身 —— 标题 + 正文 + 画面文字 + 口播（有才带）
//   full 全量 —— 再加 平台 / 链接 / 作者 / 标签 / 图片 / 视频 / 可见字幕 / 采集时间
// 每份稿开头都是同一段中文说明，防止模型假装看过视频。
(function () {
  const PREAMBLE = [
    "以下是我用浏览器扩展从页面上直接提取的原料：正文、图片上的字（截图 OCR）、页面已有的字幕。",
    "请只基于下面的原文来分析。你没有看过这个视频或这些图片，不要假装看过，也不要凭标题推测内容。",
    "原料里没有的信息，直接说没有，不要推测补全；OCR 可能有错字，遇到明显识别错误请按上下文判断而不是照抄。",
  ].join("\n");

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

  function zhTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  function heading(level, text) {
    return `${"#".repeat(level)} ${text}`;
  }

  function block(level, title, value) {
    const text = String(value || "").trim();
    if (!text) return "";
    return `${heading(level, title)}\n${text}`;
  }

  function listBlock(level, title, items, limit = 20) {
    const clean = (items || []).map((item) => String(item || "").trim()).filter(Boolean);
    if (!clean.length) return "";
    const shown = clean.slice(0, limit);
    const tail = clean.length > shown.length ? `\n- …另有 ${clean.length - shown.length} 项` : "";
    return `${heading(level, title)}\n${shown.map((item) => `- ${item}`).join("\n")}${tail}`;
  }

  // 口播与可见字幕语义相同（都是「视频里说的话」），来源不同。
  // Phase 5 接入本地转写后填 content.speech，在此之前只有平台字幕。
  // 只出一段，标明来源，避免全量稿里同一段文字出现两次。
  function speechOf(content) {
    if (content.speech) return { text: content.speech, source: content.speechSource || "本地转写" };
    if (content.transcript) return { text: content.transcript, source: "页面已有的字幕轨道" };
    return { text: "", source: "" };
  }

  // content.js 的 images/videos 有时是字符串，有时是带 alt/duration 的对象，两种都吃。
  function mediaLines(items) {
    return (items || [])
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const url = item.url || item.src || "";
        const extra = [item.alt, item.duration, item.poster ? "有封面" : ""].filter(Boolean).join(" · ");
        return extra ? `${url}（${extra}）` : url;
      })
      .filter(Boolean);
  }

  // 一条 Capture 的正文块。level 是这条的标题层级。
  function captureBlocks(content, mode, level) {
    const field = level + 1;
    const speech = speechOf(content);
    const parts = [];

    if (mode === "full") {
      const info = [
        `- 平台：${PLATFORM_LABELS[content.platform] || content.platform || "未识别"}`,
        content.url ? `- 链接：${content.url}` : "",
        content.author ? `- 作者：${content.author}` : "",
        content.capturedAt || content.extractedAt
          ? `- 采集时间：${zhTime(content.capturedAt || content.extractedAt)}`
          : "",
      ].filter(Boolean);
      parts.push(`${heading(field, "页面信息")}\n${info.join("\n")}`);
    }

    parts.push(block(field, "标题", content.title));
    parts.push(block(field, "正文 / Caption", content.body));
    parts.push(block(field, "画面文字（截图 OCR）", content.ocrText));

    if (speech.text) {
      parts.push(`${heading(field, "口播 / 字幕")}\n（来源：${speech.source}）\n${speech.text}`);
    }

    if (mode === "full") {
      parts.push(listBlock(field, "标签", (content.tags || []).map((tag) => `#${tag}`), 30));
      parts.push(listBlock(field, "图片", mediaLines(content.images), 20));
      parts.push(listBlock(field, "视频", mediaLines(content.videos), 10));
      parts.push(listBlock(field, "评论（默认关，设置页可开）", content.comments, 30));
      parts.push(listBlock(field, "提取说明", content.metadata, 12));
    }

    return parts.filter(Boolean);
  }

  function notesBlock(notes, level) {
    if (!notes || !notes.length) return "";
    const body = notes
      .map((note) => {
        const when = zhTime(note.updatedAt || note.createdAt);
        return `- （${when}）${String(note.body || "").trim()}`;
      })
      .join("\n");
    return `${heading(level, "我的笔记（我自己写的，不是页面内容）")}\n${body}`;
  }

  /* ---------- 对外 ---------- */

  // 复制本页 / 复制给 AI。withPreamble=false 时就是纯稿，给「丢进当前笔记」用。
  function buildPageDraft(content, options = {}) {
    const mode = options.mode === "full" ? "full" : "lean";
    const parts = [];
    if (options.withPreamble !== false) parts.push(PREAMBLE);
    parts.push(heading(1, "本页原料"));
    parts.push(...captureBlocks(content, mode, 1));
    const notes = notesBlock(options.notes, 2);
    if (notes) parts.push(notes);
    return parts.filter(Boolean).join("\n\n");
  }

  // 复制集合：按采集时间从早到晚拼接。
  function buildCollectionDraft(items, options = {}) {
    const mode = options.mode === "full" ? "full" : "lean";
    const notesFor = typeof options.notesFor === "function" ? options.notesFor : () => [];

    const ordered = [...(items || [])].sort((a, b) =>
      String(a.capturedAt || a.extractedAt || "").localeCompare(String(b.capturedAt || b.extractedAt || ""))
    );

    const parts = [
      PREAMBLE,
      "这一份里有多条，按我采集的先后顺序排列，可能来自同一组轮播图或彼此相关的几个帖子。",
      "请先合并去重，再整体分析。",
      heading(1, "采集合集"),
      `共 ${ordered.length} 条 · 生成于 ${zhTime(new Date().toISOString())}`,
    ];

    ordered.forEach((item, index) => {
      const title = item.title || item.url || "（无标题）";
      parts.push(heading(2, `第 ${index + 1} 条 · ${title}`));
      parts.push(...captureBlocks(item, mode, 2));
      const notes = notesBlock(notesFor(item), 3);
      if (notes) parts.push(notes);
    });

    return parts.filter(Boolean).join("\n\n");
  }

  /* ---------- 笔记导出（Phase 6） ---------- */

  // Windows 和 macOS 都不接受的字符，外加控制字符，一律换成下划线。
  function safeFileName(name, fallback = "笔记") {
    const clean = String(name || "")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\p{C}/gu, "") // 控制字符与格式字符，文件名里放不得
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    return clean || fallback;
  }

  function noteToMarkdown(note, folderLabel = "") {
    const meta = [
      note.sourceTitle ? `- 来源：${note.sourceTitle}` : "",
      note.sourceUrl ? `- 链接：${note.sourceUrl}` : "",
      note.platform ? `- 平台：${PLATFORM_LABELS[note.platform] || note.platform}` : "",
      folderLabel ? `- 文件夹：${folderLabel}` : "",
      note.createdAt ? `- 记于：${zhTime(note.createdAt)}` : "",
      note.updatedAt && note.updatedAt !== note.createdAt ? `- 改于：${zhTime(note.updatedAt)}` : "",
    ].filter(Boolean);

    return [
      heading(1, note.title || "无标题笔记"),
      meta.length ? meta.join("\n") : "",
      String(note.body || "").trim(),
    ].filter(Boolean).join("\n\n");
  }

  function folderToMarkdown(notes, folderLabel) {
    const ordered = [...(notes || [])].sort((a, b) =>
      String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
    );
    const parts = [
      heading(1, `${folderLabel}（${ordered.length} 条）`),
      `导出于 ${zhTime(new Date().toISOString())}`,
    ];
    for (const note of ordered) {
      parts.push("---");
      // 单条在合并稿里降一级，免得出现一堆 h1。
      parts.push(noteToMarkdown(note, "").replace(/^# /, "## "));
    }
    return parts.join("\n\n");
  }

  self.SocialFormat = {
    PREAMBLE,
    buildPageDraft,
    buildCollectionDraft,
    noteToMarkdown,
    folderToMarkdown,
    safeFileName,
    zhTime,
  };
})();

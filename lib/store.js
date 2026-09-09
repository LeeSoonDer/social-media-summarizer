// 笔记与文件夹的本地存储层 · Phase 2
//
// 三条硬约束（CLAUDE.md）：
//   1. folders 与 notes 分开存，且都不能和 socialExtractorCollection 同表。
//      清空集合走的是 collection 那把 key，碰不到这里。
//   2. id 为 "inbox" 的收集箱必须永远存在，且不可删除、不可改名。
//   3. 保存笔记不需要先选文件夹——没指定就进 inbox。
//
// 普通 <script> 加载，不用 ES module（sidepanel.html 没有构建链）。
(function () {
  const FOLDERS_KEY = "socialExtractorFolders";
  const NOTES_KEY = "socialExtractorNotes";
  const SETTINGS_KEY = "socialExtractorSettings";
  const INBOX_ID = "inbox";

  const COLLECTION_KEY = "socialExtractorCollection";

  // 架构 §6.4 的设置形状。口播已取消，sttEnabled / sttModel 不再保留。
  // ocrLang 默认不带 chi_tra：那个语言包 26MB，每次起 worker 都要加载，
  // 而简体页面用不上它。需要繁体的人在设置里自己开。
  const DEFAULT_SETTINGS = {
    aiPromptMode: "lean",
    commentsEnabled: false,
    ocrLang: "eng+chi_sim",
    maxCollectionItems: 80,
  };

  /* ---------- id ---------- */

  let idCounter = 0;
  function newId(prefix) {
    idCounter += 1;
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${stamp}_${idCounter.toString(36)}${rand}`;
  }

  /* ---------- 写队列：串行化读-改-写，避免同一侧栏内互相覆盖 ---------- */

  let writeChain = Promise.resolve();
  function serialize(task) {
    const next = writeChain.then(task, task);
    // 让链条不因为单次失败而卡死
    writeChain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  async function readKey(key, fallback) {
    const result = await chrome.storage.local.get(key);
    const value = result[key];
    if (Array.isArray(fallback)) return Array.isArray(value) ? value : [];
    return value && typeof value === "object" ? value : { ...fallback };
  }

  async function writeKey(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (err) {
      const raw = String(err?.message || err);
      if (/quota|QUOTA/i.test(raw)) {
        throw new Error("本机存储已满，笔记没能保存。请到设置页导出备份后再删掉一些旧记录。");
      }
      throw err;
    }
  }

  /* ---------- URL 归一化：决定「本页相关」 ---------- */

  // 到处都有的追踪参数，以及各平台会变但不影响是哪条内容的参数。
  const VOLATILE_PARAMS = [
    /^utm_/i,
    /^xsec_/i, // 小红书 xsec_token / xsec_source，每次进页面都不同
    /^igsh/i, // Instagram igshid / igsh
    /^fbclid$/i,
    /^gclid$/i,
    /^ref$/i,
    /^ref_src$/i,
    /^ref_url$/i,
    /^source$/i,
    /^share_/i,
    /^si$/i, // YouTube 分享链接
    /^feature$/i,
    /^s$/i, // X 的 ?s=20
    /^t$/i, // YouTube 时间戳
    /^spm/i,
    /^app_platform$/i,
    /^author_share$/i,
    /^apptime$/i,
    /^exSource$/i,
  ];

  // 这些参数是内容标识，必须留。
  const ESSENTIAL_PARAMS = ["v", "list", "story_fbid", "id", "p", "comment_id"];

  // 能认出内容 id 的平台，直接归到 id，比增删参数稳。
  function platformKey(host, path, params) {
    if (host.includes("xiaohongshu.com")) {
      // /explore/<id>、/discovery/item/<id>、/user/profile/<uid>/<noteId> 是同一条笔记
      const id =
        path.match(/^\/(?:explore|discovery\/item)\/([0-9a-z]+)/i)?.[1] ||
        path.match(/^\/user\/profile\/[0-9a-z]+\/([0-9a-z]+)/i)?.[1];
      if (id) return `xhs:note:${id}`;
    }
    if (host.includes("youtube.com") || host === "youtu.be") {
      const id =
        params.get("v") ||
        path.match(/^\/(?:shorts|embed|live)\/([\w-]+)/i)?.[1] ||
        (host === "youtu.be" ? path.replace(/^\//, "") : "");
      if (id) return `yt:video:${id}`;
    }
    if (host.includes("instagram.com")) {
      const id = path.match(/^\/(?:p|reel|reels|tv)\/([\w-]+)/i)?.[1];
      if (id) return `ig:post:${id}`;
    }
    if (host === "x.com" || host.includes("twitter.com")) {
      const id = path.match(/\/status(?:es)?\/(\d+)/i)?.[1];
      if (id) return `x:tweet:${id}`;
    }
    if (host.includes("tiktok.com")) {
      const id = path.match(/\/video\/(\d+)/i)?.[1];
      if (id) return `tiktok:video:${id}`;
    }
    return "";
  }

  function normalizeUrl(rawUrl) {
    let parsed;
    try {
      parsed = new URL(String(rawUrl || ""));
    } catch {
      return String(rawUrl || "").trim();
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");

    const byId = platformKey(host, path, parsed.searchParams);
    if (byId) return byId;

    const params = [];
    for (const [key, value] of parsed.searchParams.entries()) {
      const essential = ESSENTIAL_PARAMS.includes(key);
      const volatile = VOLATILE_PARAMS.some((re) => re.test(key));
      // 内容标识优先：v / list 这类就算撞上易变名单也要留。
      if (essential || !volatile) params.push([key, value]);
    }
    params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const query = params.map(([k, v]) => `${k}=${v}`).join("&");

    return `${host}${path}${query ? `?${query}` : ""}`;
  }

  function sameSource(a, b) {
    if (!a || !b) return false;
    return normalizeUrl(a) === normalizeUrl(b);
  }

  /* ---------- 文件夹 ---------- */

  function inboxFolder() {
    return { id: INBOX_ID, name: "收集箱", sort: 0, createdAt: new Date().toISOString() };
  }

  async function readFolders() {
    const folders = await readKey(FOLDERS_KEY, []);
    if (!folders.some((folder) => folder.id === INBOX_ID)) {
      folders.unshift(inboxFolder());
    }
    return folders;
  }

  // 惰性保证 inbox 存在。任何读路径都会先过这里。
  async function listFolders() {
    return serialize(async () => {
      const stored = await readKey(FOLDERS_KEY, []);
      const hasInbox = stored.some((folder) => folder.id === INBOX_ID);
      const folders = hasInbox ? stored : [inboxFolder(), ...stored];
      if (!hasInbox) await writeKey(FOLDERS_KEY, folders);
      return sortFolders(folders);
    });
  }

  function sortFolders(folders) {
    return [...folders].sort((a, b) => {
      if (a.id === INBOX_ID) return -1;
      if (b.id === INBOX_ID) return 1;
      const bySort = (a.sort || 0) - (b.sort || 0);
      if (bySort !== 0) return bySort;
      return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
    });
  }

  async function createFolder(name) {
    const clean = String(name || "").trim();
    if (!clean) throw new Error("文件夹名不能为空。");
    return serialize(async () => {
      const folders = await readFolders();
      if (folders.some((folder) => folder.name === clean)) {
        throw new Error(`已经有叫「${clean}」的文件夹了。`);
      }
      const folder = {
        id: newId("fld"),
        name: clean,
        sort: folders.length,
        createdAt: new Date().toISOString(),
      };
      const next = [...folders, folder];
      await writeKey(FOLDERS_KEY, next);
      return folder;
    });
  }

  async function renameFolder(id, name) {
    const clean = String(name || "").trim();
    if (id === INBOX_ID) throw new Error("收集箱不能改名。");
    if (!clean) throw new Error("文件夹名不能为空。");
    return serialize(async () => {
      const folders = await readFolders();
      if (folders.some((folder) => folder.id !== id && folder.name === clean)) {
        throw new Error(`已经有叫「${clean}」的文件夹了。`);
      }
      const next = folders.map((folder) => (folder.id === id ? { ...folder, name: clean } : folder));
      await writeKey(FOLDERS_KEY, next);
      return next.find((folder) => folder.id === id) || null;
    });
  }

  // 删文件夹绝不删笔记：先把笔记搬回 inbox，搬成功了再删文件夹。
  // 顺序反了的话中途失败会留下一批指向不存在文件夹的孤儿笔记。
  async function deleteFolder(id) {
    if (id === INBOX_ID) throw new Error("收集箱不能删除。");
    return serialize(async () => {
      const notes = await readKey(NOTES_KEY, []);
      const moved = notes.filter((note) => note.folderId === id).length;
      if (moved) {
        const next = notes.map((note) =>
          note.folderId === id ? { ...note, folderId: INBOX_ID, updatedAt: new Date().toISOString() } : note
        );
        await writeKey(NOTES_KEY, next);
      }
      const folders = await readFolders();
      await writeKey(FOLDERS_KEY, folders.filter((folder) => folder.id !== id));
      return { movedToInbox: moved };
    });
  }

  /* ---------- 笔记 ---------- */

  async function listNotes() {
    const notes = await readKey(NOTES_KEY, []);
    // 指向已删除文件夹的笔记，读的时候当作在 inbox，不改盘上数据。
    return notes.map((note) => ({ ...note }));
  }

  function noteTitleFrom(body, fallback) {
    const firstLine = String(body || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return (firstLine || fallback || "").slice(0, 80);
  }

  async function createNote(input) {
    const now = new Date().toISOString();
    const note = {
      id: newId("note"),
      folderId: input.folderId || INBOX_ID,
      title: input.title || noteTitleFrom(input.body, input.sourceTitle),
      body: String(input.body || ""),
      sourceUrl: input.sourceUrl || "",
      sourceTitle: input.sourceTitle || "",
      platform: input.platform || "",
      createdAt: now,
      updatedAt: now,
    };
    return serialize(async () => {
      const notes = await readKey(NOTES_KEY, []);
      await writeKey(NOTES_KEY, [...notes, note]);
      return note;
    });
  }

  async function updateNote(id, patch) {
    return serialize(async () => {
      const notes = await readKey(NOTES_KEY, []);
      const index = notes.findIndex((note) => note.id === id);
      if (index < 0) return null;
      const merged = {
        ...notes[index],
        ...patch,
        id: notes[index].id,
        createdAt: notes[index].createdAt,
        updatedAt: new Date().toISOString(),
      };
      if (patch.body !== undefined && patch.title === undefined) {
        merged.title = noteTitleFrom(patch.body, notes[index].sourceTitle);
      }
      const next = [...notes];
      next[index] = merged;
      await writeKey(NOTES_KEY, next);
      return merged;
    });
  }

  async function deleteNote(id) {
    return serialize(async () => {
      const notes = await readKey(NOTES_KEY, []);
      await writeKey(NOTES_KEY, notes.filter((note) => note.id !== id));
    });
  }

  async function moveNote(id, folderId) {
    return updateNote(id, { folderId: folderId || INBOX_ID });
  }

  /* ---------- 设置（Phase 3 用，这里先给个安全的读写） ---------- */

  async function getSettings() {
    const stored = await readKey(SETTINGS_KEY, DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async function saveSettings(patch) {
    return serialize(async () => {
      const stored = await readKey(SETTINGS_KEY, DEFAULT_SETTINGS);
      const next = { ...DEFAULT_SETTINGS, ...stored, ...patch };
      await writeKey(SETTINGS_KEY, next);
      return next;
    });
  }

  /* ---------- 全量导出 / 导入（Phase 6） ---------- */

  const BACKUP_FORMAT = "social-extractor-backup";
  const BACKUP_VERSION = 1;

  async function exportAll() {
    const data = await chrome.storage.local.get([COLLECTION_KEY, FOLDERS_KEY, NOTES_KEY, SETTINGS_KEY]);
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      collection: Array.isArray(data[COLLECTION_KEY]) ? data[COLLECTION_KEY] : [],
      folders: Array.isArray(data[FOLDERS_KEY]) ? data[FOLDERS_KEY] : [],
      notes: Array.isArray(data[NOTES_KEY]) ? data[NOTES_KEY] : [],
      settings: { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) },
    };
  }

  // 宁可一条都不导，也不要导进来一半。先整份校验，通过了再写。
  function validateBackup(raw) {
    if (!raw || typeof raw !== "object") throw new Error("这不是一个有效的备份文件。");
    if (raw.format !== BACKUP_FORMAT) {
      throw new Error("这个文件不是 Social Extractor 导出的备份，没有导入。");
    }
    for (const field of ["collection", "folders", "notes"]) {
      if (raw[field] !== undefined && !Array.isArray(raw[field])) {
        throw new Error(`备份里的 ${field} 结构不对，没有导入。`);
      }
    }
    for (const note of raw.notes || []) {
      if (!note || typeof note !== "object" || typeof note.id !== "string") {
        throw new Error("备份里有结构不对的笔记，整份都没有导入。");
      }
    }
    return true;
  }

  async function importAll(raw) {
    validateBackup(raw);
    return serialize(async () => {
      const folders = Array.isArray(raw.folders) ? [...raw.folders] : [];
      if (!folders.some((folder) => folder.id === INBOX_ID)) folders.unshift(inboxFolder());

      // 指向不存在文件夹的笔记一律归到收集箱，避免导入后笔记看不见。
      const folderIds = new Set(folders.map((folder) => folder.id));
      const notes = (Array.isArray(raw.notes) ? raw.notes : []).map((note) => ({
        ...note,
        folderId: folderIds.has(note.folderId) ? note.folderId : INBOX_ID,
      }));

      await chrome.storage.local.set({
        [COLLECTION_KEY]: Array.isArray(raw.collection) ? raw.collection : [],
        [FOLDERS_KEY]: folders,
        [NOTES_KEY]: notes,
        [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      });

      return { collection: (raw.collection || []).length, folders: folders.length, notes: notes.length };
    });
  }

  self.SocialStore = {
    INBOX_ID,
    FOLDERS_KEY,
    NOTES_KEY,
    SETTINGS_KEY,
    COLLECTION_KEY,
    DEFAULT_SETTINGS,
    exportAll,
    importAll,
    validateBackup,
    normalizeUrl,
    sameSource,
    noteTitleFrom,
    listFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    listNotes,
    createNote,
    updateNote,
    deleteNote,
    moveNote,
    getSettings,
    saveSettings,
  };
})();

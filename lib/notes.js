// 笔记分区的 UI 与交互 · Phase 2
//
// 依赖由 init(deps) 显式传入，不靠跨文件的隐式全局。
// 三条纪律（全是会吃掉用户正在打的字的地方）：
//   1. 列表只由笔记自己的事件驱动。采集、集合、清空集合一律不得触发这里的重绘。
//   2. 正文 textarea 有焦点时整次跳过重绘，blur 再补。
//   3. 400ms 落盘只改「已保存 HH:mm」那一个文本节点，不重建 DOM。
(function () {
  const S = self.SocialStore;

  let deps = null;
  let folders = [];
  let notes = [];
  let currentFolderId = S.INBOX_ID;
  let renderPending = false;
  let folderEditorMode = null; // "new" | "rename"
  let deleteArmed = null; // 需要点第二次才真删

  // noteId -> { timer, body, hintEl }
  const pendingSaves = new Map();

  const $ = (id) => deps.$(id);

  /* ---------- 查询 ---------- */

  function folderName(id) {
    return folders.find((folder) => folder.id === id)?.name || "收集箱";
  }

  function resolvedFolderId(note) {
    // 指向已删除文件夹的笔记，显示时算在收集箱里。
    return folders.some((folder) => folder.id === note.folderId) ? note.folderId : S.INBOX_ID;
  }

  function relatedNotesFor(url) {
    if (!url) return [];
    return notes.filter((note) => note.sourceUrl && S.sameSource(note.sourceUrl, url));
  }

  function byUpdatedDesc(a, b) {
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  }

  // 只护「正在打字的笔记正文」。文件夹下拉和顶部输入框不该挡住重绘。
  function isEditingNoteBody() {
    const el = document.activeElement;
    return !!el && el.classList && el.classList.contains("note-body");
  }

  /* ---------- 自动保存：停键 400ms ---------- */

  function scheduleSave(noteId, body, hintEl) {
    const previous = pendingSaves.get(noteId);
    if (previous) clearTimeout(previous.timer);
    const timer = setTimeout(() => commitSave(noteId), 400);
    // 值在 input 那一刻就捕获，400ms 后不再回 DOM 取。
    pendingSaves.set(noteId, { timer, body, hintEl });
  }

  async function commitSave(noteId) {
    const entry = pendingSaves.get(noteId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingSaves.delete(noteId);

    try {
      const saved = await S.updateNote(noteId, { body: entry.body });
      if (!saved) return;
      const local = notes.find((note) => note.id === noteId);
      if (local) {
        local.body = saved.body;
        local.title = saved.title;
        local.updatedAt = saved.updatedAt;
      }
      if (entry.hintEl) entry.hintEl.textContent = `已保存 ${deps.shortTime(saved.updatedAt)}`;
    } catch (err) {
      if (entry.hintEl) entry.hintEl.textContent = "没保存上";
      deps.setStatus(deps.humanError(err), "error");
    }
  }

  async function flush() {
    for (const noteId of [...pendingSaves.keys()]) {
      await commitSave(noteId);
    }
  }

  /* ---------- 读取 ---------- */

  async function reloadFolders() {
    folders = await S.listFolders();
    if (!folders.some((folder) => folder.id === currentFolderId)) {
      currentFolderId = S.INBOX_ID;
    }
  }

  async function reloadNotes() {
    notes = await S.listNotes();
    render();
    deps.onNotesChanged?.();
  }

  /* ---------- 渲染 ---------- */

  function renderFolderSelect() {
    const select = $("folderSelect");
    const counts = new Map();
    for (const note of notes) {
      const id = resolvedFolderId(note);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    select.textContent = "";
    for (const folder of folders) {
      const option = document.createElement("option");
      option.value = folder.id;
      option.textContent = `${folder.name}（${counts.get(folder.id) || 0}）`;
      if (folder.id === currentFolderId) option.selected = true;
      select.appendChild(option);
    }
    const isInbox = currentFolderId === S.INBOX_ID;
    $("folderRename").disabled = isInbox;
    $("folderDelete").disabled = isInbox;
  }

  function armDelete(key, button, label) {
    if (deleteArmed === key) return false;
    deleteArmed = key;
    button.textContent = "再点删除";
    setTimeout(() => {
      if (deleteArmed === key) {
        deleteArmed = null;
        button.textContent = label;
      }
    }, 4000);
    return true;
  }

  function noteCard(note) {
    const li = document.createElement("li");
    li.dataset.noteId = note.id;

    const body = document.createElement("textarea");
    body.className = "note-body";
    body.dataset.noteId = note.id;
    body.value = note.body || "";
    li.appendChild(body);

    const meta = document.createElement("div");
    meta.className = "note-meta";

    if (note.sourceUrl) {
      const link = document.createElement("a");
      link.href = note.sourceUrl;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.textContent = note.sourceTitle || deps.hostOf(note.sourceUrl) || "来源";
      link.title = note.sourceUrl;
      meta.appendChild(link);
    }

    const where = document.createElement("span");
    where.textContent = folderName(resolvedFolderId(note));
    meta.appendChild(where);

    const time = document.createElement("span");
    time.textContent = deps.shortTime(note.updatedAt || note.createdAt);
    meta.appendChild(time);

    const hint = document.createElement("span");
    hint.className = "saved-hint";
    meta.appendChild(hint);

    const spacer = document.createElement("span");
    spacer.className = "spacer";
    meta.appendChild(spacer);

    const exportOne = document.createElement("button");
    exportOne.className = "link-btn plain";
    exportOne.textContent = "导出";
    exportOne.title = "把这条笔记存成 .md";
    exportOne.addEventListener("click", () => {
      try {
        const md = self.SocialFormat.noteToMarkdown(note, folderName(resolvedFolderId(note)));
        const name = self.SocialFormat.safeFileName(note.title || note.sourceTitle, "笔记");
        deps.downloadText(`${name}.md`, md);
        deps.setStatus("已导出这条笔记。", "ok");
      } catch (err) {
        deps.setStatus(`导出失败：${deps.humanError(err)}`, "error");
      }
    });
    meta.appendChild(exportOne);

    const del = document.createElement("button");
    del.className = "link-btn";
    del.textContent = "删除";
    del.addEventListener("click", async () => {
      if (armDelete(note.id, del, "删除")) return;
      deleteArmed = null;
      const pending = pendingSaves.get(note.id);
      if (pending) clearTimeout(pending.timer);
      pendingSaves.delete(note.id);
      try {
        await S.deleteNote(note.id);
        await reloadNotes();
        deps.setStatus("已删除这条笔记。", "ok");
      } catch (err) {
        deps.setStatus(deps.humanError(err), "error");
      }
    });
    meta.appendChild(del);

    li.appendChild(meta);

    // 拼音组合期间 input 每敲一个字母都触发，此时落盘的是没上屏的中间态。
    let composing = false;
    body.addEventListener("compositionstart", () => {
      composing = true;
      const pending = pendingSaves.get(note.id);
      if (pending) clearTimeout(pending.timer);
    });
    body.addEventListener("compositionend", (event) => {
      composing = false;
      hint.textContent = "…";
      scheduleSave(note.id, event.target.value, hint);
    });
    body.addEventListener("input", (event) => {
      if (composing) return;
      hint.textContent = "…";
      scheduleSave(note.id, event.target.value, hint);
    });
    body.addEventListener("blur", async () => {
      await commitSave(note.id);
      if (renderPending) render();
    });

    return li;
  }

  function fillList(listEl, items, emptyText) {
    listEl.textContent = "";
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "empty-line";
      li.textContent = emptyText;
      listEl.appendChild(li);
      return;
    }
    for (const note of items) listEl.appendChild(noteCard(note));
  }

  function render() {
    if (!deps) return;
    // 正在打字就整次跳过，blur 时补。宁可列表晚一拍，也不能把光标吃掉。
    if (isEditingNoteBody()) {
      renderPending = true;
      return;
    }
    renderPending = false;

    renderFolderSelect();

    const pageUrl = deps.getPageRef().url;
    const related = relatedNotesFor(pageUrl).sort(byUpdatedDesc);
    const relatedIds = new Set(related.map((note) => note.id));
    // 「本页相关」不按文件夹过滤——笔记挪进自建文件夹后，回到同一页仍要看得见。
    // 「其它笔记」排掉已经在上面露过面的，同一条不出现两次（两个 textarea 会互相覆盖）。
    const others = notes
      .filter((note) => resolvedFolderId(note) === currentFolderId && !relatedIds.has(note.id))
      .sort(byUpdatedDesc);

    $("relatedCount").textContent = String(related.length);
    fillList(
      $("relatedNotes"),
      related,
      pageUrl ? "这一页还没有笔记。在上面打一句，回车即存。" : "还没停在可记录的页面上。"
    );

    $("otherTitle").textContent = `${folderName(currentFolderId)}里的其它笔记`;
    fillList($("otherNotes"), others, "这个文件夹里没有别的笔记。");

    $("notesHint").textContent = `共 ${notes.length} 条 · 回车先进收集箱，之后再分文件夹`;
  }

  function focusNoteEnd(noteId) {
    const textarea = document.querySelector(`.note-body[data-note-id="${noteId}"]`);
    if (!textarea) return;
    textarea.focus();
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
    textarea.scrollTop = textarea.scrollHeight;
  }

  /* ---------- 顶部输入框：回车即存 ---------- */

  async function saveQuickNote() {
    const input = $("noteInput");
    const body = input.value.trim();
    if (!body) return;

    const page = await deps.getPageIdentity();
    try {
      const note = await S.createNote({
        body,
        folderId: S.INBOX_ID, // 先收后分：保存路径上不问文件夹
        sourceUrl: page.url,
        sourceTitle: page.title,
        platform: page.platform,
      });
      input.value = "";
      // 新笔记进收集箱。若当前在看别的文件夹、这条又跟本页无关，切回收集箱，别让它凭空消失。
      const visibleHere = S.sameSource(note.sourceUrl, deps.getPageRef().url);
      if (!visibleHere && currentFolderId !== S.INBOX_ID) currentFolderId = S.INBOX_ID;
      await reloadNotes();
      deps.setStatus("已存进收集箱。", "ok");
      input.focus();
    } catch (err) {
      deps.setStatus(deps.humanError(err), "error");
    }
  }

  /* ---------- 一层文件夹 ---------- */

  function openFolderEditor(mode) {
    folderEditorMode = mode;
    const input = $("folderName");
    $("folderEditor").hidden = false;
    input.value = mode === "rename" ? folderName(currentFolderId) : "";
    input.focus();
    input.select();
  }

  function closeFolderEditor() {
    folderEditorMode = null;
    $("folderEditor").hidden = true;
    $("folderName").value = "";
  }

  async function submitFolderEditor() {
    const name = $("folderName").value.trim();
    if (!name) {
      deps.setStatus("文件夹名不能为空。", "error");
      return;
    }
    try {
      if (folderEditorMode === "rename") {
        await S.renameFolder(currentFolderId, name);
        deps.setStatus("文件夹已改名。", "ok");
      } else {
        const folder = await S.createFolder(name);
        currentFolderId = folder.id;
        deps.setStatus(`已建好「${name}」。`, "ok");
      }
      closeFolderEditor();
      await reloadFolders();
      render();
    } catch (err) {
      deps.setStatus(deps.humanError(err), "error");
    }
  }

  async function deleteCurrentFolder() {
    const button = $("folderDelete");
    if (armDelete(currentFolderId, button, "删除")) return;
    deleteArmed = null;
    button.textContent = "删除";
    try {
      await flush();
      const result = await S.deleteFolder(currentFolderId);
      currentFolderId = S.INBOX_ID;
      await reloadFolders();
      await reloadNotes();
      deps.setStatus(
        result.movedToInbox
          ? `文件夹已删，${result.movedToInbox} 条笔记回到收集箱。`
          : "文件夹已删。",
        "ok"
      );
    } catch (err) {
      deps.setStatus(deps.humanError(err), "error");
    }
  }

  // 导出当前文件夹：合并成一份 .md，按记录时间从早到晚。
  async function exportCurrentFolder() {
    await flush();
    const label = folderName(currentFolderId);
    const mine = notes.filter((note) => resolvedFolderId(note) === currentFolderId);
    if (!mine.length) {
      deps.setStatus(`「${label}」里还没有笔记，没有可导出的内容。`, "error");
      return;
    }
    try {
      const md = self.SocialFormat.folderToMarkdown(mine, label);
      deps.downloadText(`${self.SocialFormat.safeFileName(label, "收集箱")}.md`, md);
      deps.setStatus(`已导出「${label}」共 ${mine.length} 条。`, "ok");
    } catch (err) {
      deps.setStatus(`导出失败：${deps.humanError(err)}`, "error");
    }
  }

  /* ---------- 丢进当前笔记 ---------- */

  async function dropIntoNote() {
    const content = deps.getContent();
    if (!content) {
      deps.setStatus("还没采到本页内容。先点顶部「刷新」，再丢进笔记。", "error");
      return;
    }
    await flush();

    const page = await deps.getPageIdentity();
    const lean = deps.formatExtracted(content);
    const related = relatedNotesFor(page.url).sort(byUpdatedDesc);

    try {
      let targetId;
      if (related.length) {
        const target = related[0];
        const divider = `\n\n---\n（本页 · ${page.title || deps.hostOf(page.url) || "来源"} · ${deps.formatTime(
          new Date().toISOString()
        )}）\n`;
        await S.updateNote(target.id, {
          body: `${target.body || ""}${divider}${lean}`,
          title: target.title, // 显式带上，免得标题被稿子首行顶掉
        });
        targetId = target.id;
        deps.setStatus("已追加到本页最近一条笔记。", "ok");
      } else {
        const note = await S.createNote({
          body: lean,
          title: content.title || page.title,
          sourceUrl: page.url,
          sourceTitle: page.title || content.title,
          platform: page.platform,
        });
        targetId = note.id;
        deps.setStatus("已新建笔记，本页稿子垫在底下。", "ok");
      }
      await reloadNotes();
      deps.switchTab("notes");
      focusNoteEnd(targetId);
    } catch (err) {
      deps.setStatus(deps.humanError(err), "error");
    }
  }

  /* ---------- 启动 ---------- */

  async function init(injected) {
    deps = injected;

    $("noteInput").addEventListener("keydown", (event) => {
      // 拼音候选窗开着时的 Enter 是「选词」，不是「保存」。
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      saveQuickNote();
    });

    $("folderSelect").addEventListener("change", async (event) => {
      await flush();
      currentFolderId = event.target.value;
      closeFolderEditor();
      render();
    });

    $("folderNew").addEventListener("click", () => openFolderEditor("new"));
    $("folderRename").addEventListener("click", () => openFolderEditor("rename"));
    $("folderSave").addEventListener("click", submitFolderEditor);
    $("folderCancel").addEventListener("click", closeFolderEditor);
    $("folderDelete").addEventListener("click", deleteCurrentFolder);
    $("folderExport").addEventListener("click", exportCurrentFolder);

    $("folderName").addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Enter") {
        event.preventDefault();
        submitFolderEditor();
      }
      if (event.key === "Escape") closeFolderEditor();
    });

    try {
      await reloadFolders();
      notes = await S.listNotes();
      render();
      deps.onNotesChanged?.();
    } catch (err) {
      deps.setStatus(`笔记读取失败：${deps.humanError(err)}`, "error");
    }
  }

  self.SocialNotes = {
    init,
    render,
    flush,
    dropIntoNote,
    // 给本页徽标和「附带我的笔记」用；只读，不触发任何重绘
    relatedFor: (url) => relatedNotesFor(url).sort(byUpdatedDesc),
    // 给冒烟测试用
    _state: () => ({ folders, notes, currentFolderId, pending: pendingSaves.size }),
  };
})();

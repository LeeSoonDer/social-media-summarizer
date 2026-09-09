# Decisions

## 2026-05-22 - Use Chrome Extension as Product Form
Decision: Build Social Summarizer as a Chrome Extension.
Reason: It provides the lowest-friction UX and can access the current logged-in page context.
Tradeoff: Browser extension APIs and platform review rules constrain implementation.
Future Implications: Production release should go through Chrome Web Store.

## 2026-05-22 - Use Vanilla JavaScript and Manifest V3 for MVP
Decision: Use native Manifest V3 with vanilla JS.
Reason: The developer is learning and the MVP does not require a framework.
Tradeoff: Less structure than a framework as code grows.
Future Implications: Revisit modularization only when file complexity becomes painful.

## 2026-05-22 - No Backend for MVP
Decision: Call Gemini directly from the extension during MVP.
Reason: Fastest path to validate extraction and summarization UX.
Tradeoff: API key is stored client-side and not suitable for public multi-user production.
Future Implications: Add backend before serious public launch if key protection, quotas, billing, or analytics are needed.

## 2026-05-22 - GitHub as Source Control, Local Folder as Runtime During Development
Decision: Use GitHub as the remote source of truth, but run the extension from a local unpacked folder during development.
Reason: Chrome does not run unpacked extensions directly from GitHub.
Tradeoff: Developer must reload extension after local changes.
Future Implications: Chrome Web Store will become the production distribution/update channel.

## 2026-05-22 - Add Markdown AI Memory System
Decision: Maintain project memory in `ai/` markdown files.
Reason: Chat context is temporary and grows stale; markdown memory keeps decisions and state portable across AI tools.
Tradeoff: Requires regular updates.
Future Implications: New AI sessions should read `ai/project_overview.md`, `ai/current_state.md`, `ai/architecture.md`, `ai/coding_rules.md`, and `ai/decisions.md` first.
## 2026-05-26 - Pivot to No-API Social Content Extractor
Decision: Change the default product flow from AI summarization to direct social content extraction as copyable markdown.
Reason: User wants fast, universal extraction and will manually paste the output into web AI tools. This avoids Gemini quota, API key, cost, and upload-by-default privacy concerns.
Tradeoff: The extension will not understand images or transcribe speech by itself. Video content depends on visible captions/transcripts, video metadata, or future optional recording/STT.
Future Implications: Prioritize platform-specific extractors for major social sites. Keep AI/STT/OCR as optional future modes, not MVP dependencies.

## 2026-09-09 - 主界面改为 Side Panel 工作台（Phase 1）
Decision: 弹窗不再是主界面。点击扩展图标直接打开右侧 Side Panel，五分区为「本页 / 画面 / 口播 / 集合 / 笔记」，底栏常驻「复制本页 / 丢进当前笔记 / 复制给 AI」。`popup.html` 降级为跳板。
Reason: 弹窗一失焦就死，翻轮播、切标签页都要重开，长时间的 OCR / 未来的 Whisper 无法在弹窗里跑完。侧栏可长期存活，符合「边看边采」的主手顺。
Tradeoff: manifest 必须去掉 `action.default_popup`，否则点击会被弹窗抢走，`openPanelOnActionClick` 不生效。
Future Implications: 长任务（OCR、STT）一律放侧栏或 offscreen document，不再放弹窗。

## 2026-09-09 - host_permissions 升为 <all_urls>
Decision: 把 `host_permissions` 从站点白名单改成 `<all_urls>`。
Reason: `chrome.tabs.captureVisibleTab` 只接受 `activeTab` 或 `<all_urls>`，而**打开侧栏不授予 activeTab**（弹窗时代能跑是因为点击图标给了 activeTab）。不升权限，侧栏里的画面 OCR 必然报「Either the '<all_urls>' or 'activeTab' permission is required」。
Tradeoff: Chrome 会提示「读取和更改你在所有网站上的数据」，上架审核也会追问。本项目定位为个人本机使用，可接受。
Future Implications: 若将来要上架，可考虑改为 `optional_host_permissions` 按需申请，或只在用户点击时通过 `activeTab` 路径取图。

## 2026-09-09 - OCR 行过滤改用 Unicode 类
Decision: `lib/ocr.js` 的噪声过滤由 `!/^[\W_]+$/` 改为 `/[\p{L}\p{N}]/u`。
Reason: JS 的 `\w` 只含 `[A-Za-z0-9_]`，中文字符全部算 `\W`，原写法会把整行纯中文的 OCR 结果当噪声删掉——正好废掉小红书这条主路径。
Tradeoff: 无。语义仍是「丢掉纯符号行」，只是这次对中日韩正确。
Future Implications: 后续任何针对文本的正则过滤都要显式考虑 CJK。

## 2026-09-09 - 笔记绑「实时页面身份」而不是提取结果
Decision: 新增 `currentPageRef`（url/title/platform，由 tab 事件实时更新），与 `currentContent`（上次采到了什么）分开。笔记的 sourceUrl 一律取前者，且保存那一刻再 `getActiveTab()` 问一次。
Reason: 小红书 / IG 是 SPA，站内换帖不触发 `complete`，`currentContent` 会停在上一条帖子上。若笔记绑它，用户在新帖上打的字会静默记到旧帖名下——这是不可感知的脏数据，比报错更糟。
Tradeoff: 多一次 `chrome.tabs.query`，可忽略。
Future Implications: 任何「跟当前页绑定」的新功能都走 `currentPageRef`，不要读 `currentContent.url`。

## 2026-09-09 - 「本页相关」按归一化后的内容 id 匹配
Decision: `lib/store.js` 的 `normalizeUrl()` 先按平台提取内容 id（`xhs:note:<id>`、`yt:video:<id>`、`ig:post:<id>`、`x:tweet:<id>`、`tiktok:video:<id>`），取不到再退回「host+path+过滤后的参数」。Note 只存原始 `sourceUrl`，匹配一律在运行时归一化后比较。
Reason: 验收线「同一 URL 再打开能看到旧笔记」用 `location.href` 精确匹配必挂：小红书 `xsec_token` 每次会话都变，IG 带 `igshid`，X 带 `?s=20`，YouTube 带 `&t=`。同一条小红书笔记还有 explore / discovery/item / user/profile 三种路径。
Tradeoff: 归一化规则会随平台改版失效，需要跟选择器一起维护。
Future Implications: 不加派生字段进 Note，保持 CLAUDE.md 数据形状不变；规则变了不用迁移历史数据。

## 2026-09-09 - 笔记列表只由笔记自己的事件驱动
Decision: `SocialNotes.render()` 在正文 textarea 有焦点时整次跳过（置 renderPending，blur 再补）；400ms 自动保存落盘后只改「已保存 HH:mm」那一个文本节点，绝不重建列表；采集 / 集合保存 / 清空集合的调用链里不得出现 render。
Reason: 每条笔记正文是 textarea，一旦重建节点，光标、选区、滚动位置全丢，正在打的字也可能被旧值覆盖。这是本阶段唯一会让用户可感知丢字的地方。
Tradeoff: 列表可能晚一拍才刷新。宁可晚一拍。
Future Implications: 以后给笔记加任何展示（标签、计数），也只能改文本节点，不能整块重建。

## 2026-09-09 - 中文输入法组合态防护
Decision: 顶部输入框的 Enter 处理首行 `if (e.isComposing || e.keyCode === 229) return;`，Shift+Enter 留给换行；正文 textarea 在 compositionstart 取消待落盘计时器，compositionend 后重新起 400ms。
Reason: 这是中文 UI 产品，用户全程用拼音。候选窗开着时按 Enter 是「选词」，若直接保存会把半截拼音存成笔记并打断输入。
Tradeoff: 无。
Future Implications: 之后任何绑 Enter 或 input 的输入框都要照做。

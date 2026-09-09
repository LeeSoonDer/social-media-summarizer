# 当前状态

版本：0.7.0 · 分支 `feat/sidepanel` · 更新于 2026-09-10

## 三行现状

1. 右侧 Side Panel 工作台五分区可用，原有的平台提取、视口 OCR、集合、复制全在里面，翻页时侧栏常驻。
2. 笔记最小闭环已通：回车即存收集箱、停键 400ms 自动保存、一层文件夹、「丢进当前笔记」、本页相关聚合。
3. 复制给 AI 已定稿：瘦身/全量两档 + 固定中文前言 + 可选附带笔记，集合按采集顺序拼接。
4. 画面已支持多屏追加合并去重与 2x 预处理；只剩口播是空状态（Phase 5）与设置页/导出（Phase 6）。

## 已完成（Phase 4 · 画面增强）

- `lib/ocr.js` 的 `appendPass` / `mergePasses`：同一 url 的多屏按扫描先后铺开、逐行去重，
  去重键去掉空白与中英标点（OCR 对同一行的空格/标点判断经常不一致）。
- 整屏重复不再堆 pass；上限 12 屏。「清空重扫」是追加式设计的退路。
- `upscale()`：截图先 2x 画到 canvas 再送识别，边长封顶 4000，失败退回原图。
- 「再扫一屏」按钮 + 「轮播请翻到下一张再扫」提示 + 「已扫 N 屏 · 去重后 M 行」。
- 集合改为一个 URL 一条 Capture（见 decisions 同日那条）。

## 已完成（Phase 3 · 复制给 AI）

- `lib/format.js`：两档稿。瘦身 = 标题 + 正文 + 画面文字 + 口播；
  全量再加 平台 / 链接 / 作者 / 标签 / 图片 / 视频 / 采集时间 / 提取说明。
- 每份稿开头固定中文说明：只基于原文分析、没看过别假装看过、没有的别推测补全、OCR 可能有错字。
- 口播与可见字幕合成一段并标来源，全量稿里不会出现两次。Phase 5 填 `content.speech` 后自动优先。
- 底栏上方的档位条：瘦身/全量切换 + 「附带我的笔记」勾选框；档位存进 `socialExtractorSettings`。
- 集合稿按 `capturedAt` 从早到晚拼接，前置「先合并去重再整体分析」。
- 本页分区顶部「本页已有笔记 · N」，点一下跳笔记分区。

## 已完成（Phase 2 · 笔记）

- `lib/store.js`：folders / notes 各自一把 key，与集合彻底分表；inbox 惰性兜底且不可删改；
  删文件夹先搬笔记再删夹；所有写走串行事务并在事务内重读，不写回快照。
- `lib/notes.js`：笔记分区 UI。顶部输入框回车即存（不问文件夹）、拼音组合态防护、
  停键 400ms 自动保存、有焦点时跳过重绘、本页相关与其它笔记去重、一层文件夹增删改。
- `normalizeUrl` 按平台提取内容 id（xhs / yt / ig / x / tiktok），剥掉 xsec_token、igshid、?s=、&t=、utm_*，
  「同一 URL 再打开能看到旧笔记」才不会被易变参数打穿。
- `currentPageRef` 与 `currentContent` 解耦，笔记绑实时页面身份；保存时再问一次 activeTab。
- 「丢进当前笔记」：本页已有笔记追加分隔块，没有则新建并把本页稿子垫底。

## 已完成（Phase 1 · 侧栏）

- MV3 + `sidePanel` 权限 + `side_panel.default_path` + `background.js` service worker。
- 点击扩展图标 = 打开侧栏（`setPanelBehavior({ openPanelOnActionClick: true })`，manifest 里已移除 `default_popup`）。
- `sidepanel.html/js/css` 新建；`lib/ocr.js` 从 `popup.js` 抽出。
- `popup.html/js` 缩成跳板，只剩一个「打开侧栏工作台」按钮。
- 集合沿用 `socialExtractorCollection` key，旧数据不丢；新增 `id` / `capturedAt` / `updatedAt`，读取时自动补 `id`。
- 集合可看列表、删单条、清空、复制。
- 平台提取器 `content.js` 未改动，返回形状照旧。

## 已知限制

- 社媒 DOM 频繁改版，选择器会失效（Phase 6 按真实常用站修）。
- OCR 只扫当前视口，需要用户自己翻页再扫；不会自动点轮播下一张（那是 Phase 7 可选项）。
- 非 YouTube 的口播没有文字来源；YouTube 字幕轨道仍走 `content.js` 原逻辑。
- Tesseract 语言包打包在 `vendor/`，扩展体积偏大。
- `host_permissions` 已升为 `<all_urls>`：侧栏拿不到 `activeTab`，`tabs.captureVisibleTab` 只认 `<all_urls>` 或 `activeTab`，否则侧栏里 OCR 必挂。

## 欠账（开 Phase 6 时必须做）

- 笔记导出：单条 .md、当前文件夹合并 .md、全部 JSON 备份 / 导入。
  Phase 2 按 CLAUDE.md 跳过了，用户已确认推到 Phase 6，见 `ai/decisions.md` 2026-09-09 那条。

## 下一步

Phase 5 口播，分两步且先 UI 后引擎：
5a 状态机（未开始 / 进行中 / 已完成）、开始与停止、失败说人话。
5b 引擎按 Google 的 MV3 模式：service worker 里用户点击后 `getMediaStreamId`，
offscreen document 里 `getUserMedia` 吃这个 id，把 tab 声音接回 AudioContext destination
避免标签页静音；本地 Whisper 按需加载，禁止把模型权重打进 git。
字幕优先于 STT，YouTube 的 captionTracks 逻辑留在 content.js 不动。
转写结果写进 `content.speech`（`lib/format.js` 已经预留，会自动优先于平台字幕）。

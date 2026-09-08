# CLAUDE.md · Social Extractor

给 Claude Code 的执行说明书。先读本文件，再读 `ai/product_architecture.md`（若尚未拷入仓库，用本目录的 `social-extractor-product-architecture.md`）。

仓库：https://github.com/LeeSoonDer/social-media-summarizer  
形态：Chrome MV3 桌面扩展。用户本机 `chrome://extensions` → Load unpacked 开发。

你有 GitHub MCP 和本地目录权限。改完按小提交推送。不要开 PR 洪水，不要重构与当前阶段无关的代码。

---

## 任务

把现有 popup 提取器做成右侧 Side Panel 工作台，五分区：本页 / 画面 / 口播 / 集合 / 笔记。

打开侧栏即采当前页标题+正文+视口 OCR，写入集合。口播必须用户点开始。笔记先入收集箱，禁止保存前强迫选文件夹。默认不上传任何用户内容。

产品定位、字段、拒稿条件以架构文档为准。本文件只下令怎么做。

---

## 硬约束

- 只做当前已打开的标签页。禁止做「粘贴任意链接就下载视频」的 yt-dlp 服务端。
- 禁止恢复默认调用 Gemini / 任何云模型。`options.html` 里的 API key 页可以留着但必须标成停用，不得接到主路径。
- 禁止把集合和笔记存成同一张表。清空集合不得删除笔记。
- 禁止第一期就上 Whisper 模型文件（体积爆炸）。口播分区可以先做 UI 和「尚未接入」状态。
- 禁止 Quill / 富文本 / 双向链 / 嵌套文件夹 / 云同步 / 账号。
- 保持 vanilla JS。不要上 React/Vue/Tailwind 构建链，除非现有仓库已经有。
- UI 文案用中文。
- 每阶段结束必须能在 Chrome Load unpacked 后手动走通验收手顺。

---

## 现在仓库里有什么（不要丢掉）

已能跑：

- `manifest.json` MV3，popup + content_scripts + host_permissions
- `content.js` 平台路由与提取（小红书 / IG / X / Reddit / YouTube / TikTok / Threads / LinkedIn / Facebook / generic）
- `popup.js` 提取编排、集合、Tesseract OCR、复制本页/集合
- `vendor/tesseract/` 本地 OCR
- `ai/` 项目记忆

直接复用 `content.js` 的提取结果形状和 `popup.js` 里的 collection / OCR 逻辑，迁到 sidepanel，不要重写提取器除非选择器已死。

---

## 阶段顺序（一次只做当前阶段）

默认从 **Phase 1** 开始。用户如果说「继续」，再做下一阶段。不要一次做完 1.0。

### Phase 1 — 侧栏换壳（先做这个）

目标：现在 popup 能做的事，全部改在 Side Panel 里做，且翻页时侧栏还在。

要做：

1. `manifest.json`
   - 加 `"sidePanel"` 权限
   - 加 `"side_panel": { "default_path": "sidepanel.html" }`
   - 加 `background.js` service worker
   - popup 可保留，但点击图标应打开侧栏
2. `background.js`
   - `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
   - 参考官方做法，不要发明新交互
3. 新建 `sidepanel.html` / `sidepanel.js` / `sidepanel.css`
   - 顶栏：平台徽章 + 刷新
   - 五个 tab：本页、画面、口播、集合、笔记
   - 底栏三键：复制本页、丢进当前笔记、复制给 AI
   - Phase 1 里「丢进当前笔记」「口播」「笔记」可以是可用的空状态，按钮 disable + 一句「下一阶段」
4. 把 `popup.js` 的 `run()` / OCR / collection / copy 迁到 `sidepanel.js`
5. 打开侧栏 = 对当前 tab 抽一次 + OCR + upsert 集合 + 停在「本页」
6. popup 缩成跳板：一开就 `sidePanel.open`，或提示「请使用侧栏」

官方必须对照：

- Side Panel API：https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- 创建侧栏教程：https://developer.chrome.com/docs/extensions/develop/ui/create-a-side-panel
- 点击图标打开侧栏：https://developer.chrome.com/blog/extension-side-panel-launch
- 官方示例仓库：https://github.com/GoogleChrome/chrome-extensions-samples

验收：

- Load unpacked 后点图标出现右侧栏
- 打开小红书或任意已支持页，本页有标题/正文
- 画面 tab 能看到 OCR（或「未识别到」）
- 集合 tab 能看到刚写入的一条，复制集合可用
- 刷新页面或切到下一张图再点刷新，侧栏还在

### Phase 2 — 笔记最小闭环

要做：`lib/store.js`（或等价）分开存 `folders` + `notes`。固定文件夹 id=`inbox`。

交互（必须按这个，不要自行加步骤）：

- 笔记 tab 顶部永远有 textarea/input：回车保存到收集箱，自动写入当前 tab 的 url/title/platform
- 先列出「本页相关」，再列出当前文件夹其它笔记
- 停键 400ms 自动保存正文
- 一层文件夹：新建、重命名、删除（删除后笔记回 inbox）
- 「丢进当前笔记」：本页已有笔记则追加分隔块；没有则新建并把当前瘦身稿垫底

抄交互，不抄架构：

- Cubox 收集箱 / 同页聚合：https://help.cubox.pro/save/5c6c/ 与 https://help.cubox.pro/save/5f70/
- Cubox 文件夹 vs 标签：https://help.cubox.pro/manage/organize/
- Obsidian Web Clipper 侧栏常开 + 保存时才选目的地：https://github.com/obsidianmd/obsidian-clipper  
  文档：https://obsidian.md/help/web-clipper  
  高亮进笔记：https://obsidian.md/help/web-clipper/highlight
- 笔记绑当前 URL：https://github.com/siegerts/dossi-ext
- 侧栏打字即存（不要抄它的按域名拆本）：ClipNote 产品说明可作手顺参考，无强制源码依赖

验收：不选文件夹能记；同一 URL 再打开能看到旧笔记；清空集合后笔记还在。

### Phase 3 — 复制给 AI 定稿

两档稿，设置或底栏切换：

- 瘦身：标题 + 正文 + OCR + 口播（有才带）
- 全量：再加 platform、url、author、tags、images、videos、可见字幕、采集时间
- 可选勾选「附带我的笔记」（本页相关 notes）

复制集合 = 按时间顺序拼接。开头一段固定中文说明：这是提取原料，请基于原文分析，不要假装看过视频。

### Phase 4 — 画面增强

- 「再扫一屏」对同一 url 追加 `ocrPasses[]`，合并进 `ocrText`，去重
- 提示文案：「轮播请翻到下一张再扫」
- 可做简单预处理（画布放大 2x）再送 Tesseract
- 不要在本阶段替换整个 OCR 引擎，除非 Tesseract 已完全不可用

参考（只看管线，不要整仓搬进来）：

- 语音 + 画面字合并的产品形态：https://github.com/dagonet/panoscribe
- 小红书短链与 Whisper 降级：https://github.com/Delk/universal-video-extractor

### Phase 5 — 口播（单独开，先 UI 后引擎）

5a UI：未开始 / 进行中 / 已完成；开始、停止；失败说人话。

5b 引擎，严格按 Google 的 MV3 模式：

- service worker 里用户点击后 `chrome.tabCapture.getMediaStreamId`
- offscreen document 里 `getUserMedia` 吃这个 id
- 把 tab 声音接到 AudioContext destination，避免标签页变静音
- 本地 Whisper 再接入；模型按需加载，禁止把 large 模型打进 git

官方：

- tabCapture：https://developer.chrome.com/docs/extensions/reference/api/tabCapture
- offscreen：https://developer.chrome.com/docs/extensions/reference/api/offscreen
- SW + offscreen 录音说明：https://developer.chrome.com/docs/extensions/mv3/screen_capture/
- 官方 sample PR（可对照代码结构）：https://github.com/GoogleChrome/chrome-extensions-samples/pull/974

浏览器内 Whisper 可对照，择一借鉴，不要同时引入三套：

- https://github.com/ainoya/chrome-extension-web-transcriptor-ai
- https://github.com/tanpreetjolly/browser-whisper
- https://github.com/ayushsaun24024/srutilekhak

字幕优先于 STT（有官方字幕就别录音），对照：

- https://github.com/TheSethRose/Social-Media-Video-Transcriber
- https://github.com/Delk/universal-video-extractor

YouTube 现有 captionTracks 逻辑留在 `content.js`，不要用 Whisper 覆盖它。

### Phase 6 — 打磨

- 按真实常用站修选择器：小红书、IG、TikTok、X
- 设置页：稿件档位、评论开关、导出/导入 JSON、下线 Gemini 主路径
- 全部错误文案中文且告诉下一步
- 更新 `ai/current_state.md` `ai/decisions.md` `ai/roadmap.md`

---

## 建议目录（Phase 1 起逐步拆，不要一次搬空）

```
manifest.json
background.js
sidepanel.html
sidepanel.js
sidepanel.css
content.js
popup.html          // 过渡：打开侧栏
popup.js
lib/format.js       // Phase 3
lib/store.js        // Phase 2
lib/ocr.js          // 从 popup.js 抽出
options.html
vendor/tesseract/   // 保留
ai/
```

Phase 1 允许先把逻辑放在 `sidepanel.js`。文件超过 ~800 行再拆。

---

## 数据形状（Phase 2 起必须遵守）

```js
// chrome.storage.local
{
  socialExtractorCollection: Capture[],      // 已有 key，保持兼容
  socialExtractorFolders: [{ id, name, sort, createdAt }],
  socialExtractorNotes: [{
    id, folderId, title, body,
    sourceUrl, sourceTitle, platform,
    createdAt, updatedAt
  }],
  socialExtractorSettings: {
    aiPromptMode: "lean" | "full",
    commentsEnabled: false
  }
}
```

`inbox` 文件夹必须存在。旧 collection 数据不得因改版丢失。

---

## 借鉴清单（按功能）

| 要做的功能 | 看这个 | 抄什么 | 别抄什么 |
|---|---|---|---|
| 侧栏打开方式 | https://developer.chrome.com/docs/extensions/reference/api/sidePanel | `setPanelBehavior({ openPanelOnActionClick: true })` | DevTools sidebar |
| 侧栏常开剪藏 | https://github.com/obsidianmd/obsidian-clipper | 侧栏不随页面卸载；保存与整理分开 | 模板引擎、写盘到 Vault |
| 收集箱 | https://help.cubox.pro/save/5c6c/ | 先收后分；同 URL 聚合 | 智能列表、会员嵌套、云账号 |
| URL 绑定笔记 | https://github.com/siegerts/dossi-ext | 回到同一页还能看见笔记 | GitHub 专用社交功能 |
| 提取后复制给 AI | https://github.com/steipete/summarize | extract 与 summarize 分开；扩展只负责干净文本 | 默认绑定某个 LLM CLI |
| 多平台社媒提取形态 | https://github.com/JNHFlow21/social-media-toolkit | 输出 schema 稳定（meta/text/media） | 付费 ASR 链路、TikHub |
| 小红书/B站/YT 转写降级 | https://github.com/Delk/universal-video-extractor | YT 先字幕；其它再 STT；处理 xhslink | 做成独立 Gradio 应用 |
| 口播+画面字一份稿 | https://github.com/dagonet/panoscribe | 两个通道合并去重的产品目标 | 第一期就上 RapidOCR+Whisper 全管线 |
| MV3 抓标签页声音 | https://developer.chrome.com/docs/extensions/mv3/screen_capture/ | getMediaStreamId → offscreen → 回放音频 | 在 content script 里 capture |
| 扩展内 Whisper | https://github.com/ainoya/chrome-extension-web-transcriptor-ai | tab 音频本地转写 | 一打开扩展就录音 |
| 通用网页正文 | https://github.com/obsidianmd/obsidian-clipper （其 Defuddle/可读性抽取） | 仅 generic 平台可借鉴可读性抽取 | 替换社媒专用选择器 |

更多竞品背景（不必克隆）：

- https://github.com/TheSethRose/Social-Media-Video-Transcriber
- https://github.com/Allenyan07/video-to-text
- https://github.com/wwwzhouhui/video-parser
- https://github.com/mrizwan47/transcribe-social
- https://www.videotranscriptapi.com/ （商业对照，不要接他们的 API）

---

## Git 习惯

- 分支：`feat/sidepanel` 做 Phase 1；笔记用 `feat/notes`；口播用 `feat/stt`
- 提交信息中文或英文均可，但一条提交只做一件事
- 不要把 `vendor/tesseract` 的 wasm 再复制一份
- 不要提交 Whisper 模型权重
- 改完更新 `ai/current_state.md` 三行现状

---

## 本地验收（每阶段结束你必须自己做）

1. Chrome → `chrome://extensions` → Developer mode → Load unpacked → 选仓库根目录
2. 改代码后点扩展卡片上的 Reload，再刷新目标网页
3. 用真实已登录页测：小红书笔记、Instagram、一条短视频
4. 不要用 chrome:// 或 Web Store 页当测试页

---

## 若用户只说「开始」

执行 Phase 1，做完用中文汇报：改了哪些文件、怎么 Load unpacked、哪三条手顺已通、下一步是 Phase 2。不要自动开始 Phase 2。

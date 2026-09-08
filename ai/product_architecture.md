# Social Extractor · 产品与架构大纲

版本：1.0  
日期：2026-09-08  
形态：Chrome Manifest V3 桌面扩展 · Side Panel 工作台  
仓库：https://github.com/LeeSoonDer/social-media-summarizer  
当前代码名：Social Extractor 0.4.0

本文是已锁定意愿的完整展开：现状、目标产品、信息架构、模块细节、数据与技术架构、分期计划、范围外、验收标准。

---

## 0. 一句话

打开任意社媒页，右侧钉住工作台：采下正文、图上的字、视频里说的话，加上你自己的笔记，一键复制给网页 AI。

不是摘要器，不是下载器，不是第二个 Notion。  
是「当前已打开、已登录的这一页」的采集与记录层。

---

## 1. 问题与定位

### 1.1 要解决的问题

网页 AI（Gemini / Claude / ChatGPT）仍然很难稳定「看见」：

- Instagram / TikTok / 小红书 / X / Reddit 的视频口播
- 图文笔记里印在图片上的字
- 需要登录才能看到的正文与轮播

用户现在的办法是暂停视频手打、截图、来回复制。慢，而且丢信息。

### 1.2 产品定位

| 是 | 不是 |
|---|---|
| 浏览器侧、登录态下的内容提取器 | 匿名链接服务器爬虫 |
| 把当前页变成可复制的结构化文本 | 默认调用云端模型做摘要 |
| 给人用的工作台，结果再丢给任意 AI | 又一个聊天机器人 |
| 本机存储的轻量笔记 | 云知识库 / 多人协作 |

### 1.3 成功时的一条路径

1. 打开一条小红书 / IG / TikTok  
2. 点扩展 → 右侧侧栏已在，本页标题和 caption 已在  
3. 需要图字：看「画面」，翻下一张再扫  
4. 需要口播：点「开始转写」，播完即原文  
5. 自己补一句判断，进「笔记 / 收集箱」  
6. 「复制给 AI」得到一份可粘贴的 Markdown  

全程不离开当前标签页，不强制选文件夹，不强制上传。

### 1.4 已锁定的产品决策

- 壳：Chrome Side Panel，不是 460px 弹窗当主界面  
- 打开时：自动采标题 + 正文 + 当前视口 OCR  
- 口播：手动点开始，不自动录音  
- 笔记：先入收集箱，文件夹后补  
- 默认不上传用户内容  
- 无后端  

---

## 2. 现状（2026-09，仓库真实状态）

### 2.1 形态

Manifest V3 Chrome 扩展。点击图标打开 `popup.html`（宽 460px）。  
`content.js` 按域名路由到平台提取器。无 Side Panel，无后台 service worker 业务逻辑。

### 2.2 已支持平台

小红书、Instagram、X/Twitter、Reddit、YouTube、TikTok、Threads、LinkedIn、Facebook，以及普通网页兜底。

### 2.3 已有功能

| 能力 | 现状 | 质量 |
|---|---|---|
| 平台识别 | hostname 路由 | 可用 |
| 标题 / 作者 / caption | 平台选择器 + 可见文字兜底 + og/meta | 随 DOM 变化会挂 |
| 图片 URL | img + og:image，过滤头像图标 | 有 URL，无理解 |
| 视频 URL | og:video、twitter:player、video 标签、JSON-LD | 常拿不到直链 |
| YouTube 字幕 | captionTracks / 可见 CC / 转写面板 | 相对完整 |
| 非 YouTube 口播 | 无 STT | 缺口 |
| 画面文字 | 当前视口截图 + 本地 Tesseract（英/简/繁） | 设计字、竖排、轮播未打开的图弱 |
| 多页集合 | 打开扩展即写入 local collection，最多 80 条 | 可用 |
| 复制 | 本页 / 集合 Prompt | 给 AI 的稿偏瘦：默认只有标题+正文+OCR |
| 评论 | 代码里关掉，减少噪音 | 有意为之 |
| Gemini 调用 | 已从默认 UX 移除，options 里残留 API key 页 | 废弃主路径 |
| 笔记 / 文件夹 | 无 | — |
| 侧栏 / 分区 | 无 | — |

### 2.4 已知限制

- 社媒 DOM 频繁改版，选择器会失效  
- 烧录字幕是像素，不是 DOM  
- 语音没有字幕轨道就无法变成文字  
- OCR 只扫当前视口，轮播要用户自己翻并再开一次扩展  
- Tesseract 语言包打进 `vendor/`，扩展体积大  
- 部分内容在登录墙或懒加载后面  
- 未打开的页面、纯链接，扩展够不到（这是设计，不是 bug）

### 2.5 现有技术栈

- 原生 JS，无框架  
- `chrome.scripting` / `activeTab` / `storage`  
- 本地 Tesseract.js + chi_sim / chi_tra / eng  
- 项目记忆在仓库 `ai/` 目录（overview / current_state / decisions / roadmap）  
- 旧 roadmap 仍写着 Gemini、抽帧、录音，与 2026-05-26「默认无 API 提取器」的决策部分过时

### 2.6 现状结论

半成品已经证明「打开页 → 抽文本 → 复制」这条手顺成立。  
缺的是工作台壳、图文深度、口播、以及可留存的笔记。  
下一阶段是换壳 + 补模块，不是再做一个摘要模型。

---

## 3. 最终产品说明

### 3.1 产品名与一句话介绍

工作名保持 **Social Extractor**（可在发布前改中文名，例如「页侧采集」）。

桌面 Chrome 右侧工作台。对当前打开的社交帖、图文、视频做最大信息提取，并允许随手记录。输出是一份人能读、模型能吃的 Markdown。

### 3.2 给谁用

第一用户就是作者本人：拆竞品账号、做资料研究、把看过的视频变成可粘贴上下文。  
不做商店冷启动、不做多用户配额、不做账号系统。

### 3.3 最终形态（用户每天看到的）

浏览器右侧固定约 400px 侧栏。顶部是平台徽章和刷新。下面五个分区：

1. 本页  
2. 画面  
3. 口播  
4. 集合  
5. 笔记  

底栏三颗键常在：

- 复制本页  
- 丢进当前笔记  
- 复制给 AI（瘦身稿 / 全量稿）

点扩展图标 = 打开或聚焦这座侧栏。弹窗不再承担主界面，最多做一个「打开工作台」的跳板。

### 3.4 最终能力清单（做到即「完成品」）

- 打开即采当前页结构化字段  
- 视口 OCR，支持「下一张再扫」并入同一条  
- 当前标签页口播转写（用户点开始）  
- 本页 + 画面 + 口播 合成一份稿  
- 多页集合，批量复制给 AI  
- 笔记：打字即存、本页聚合、一层文件夹、收集箱默认  
- 选区右键「追加到笔记」  
- 本地导出 Markdown / JSON  
- 默认数据不离开本机  

### 3.5 最终明确不做

- 未打开页面的万能链接解析与无水印下载  
- 默认把音视频传到自家服务器  
- 自动发帖、矩阵运营、评论互动  
- 云同步、登录、多设备  
- 嵌套文件夹、双向链、块编辑器  
- 内置聊天机器人作为主界面  

### 3.6 完成时的产品承诺（对外可写的）

「你已经打开的这一页，文字、图上的字、视频里说的话，加上你自己记的一句，可以在侧栏一次性拿走。」

---

## 4. 信息架构

### 4.1 两层对象，不要混

| 层 | 名字 | 是什么 | 生命周期 |
|---|---|---|---|
| 原料 | 集合项 Capture | 机器从页面采下来的结构化结果 | 一次研究过程，可清空 |
| 判断 | 笔记 Note | 你写的话，可附带一份原料快照 | 长期留着 |

清空集合不影响笔记。删除笔记不影响集合。  
「丢进当前笔记」是两层之间唯一的正式桥。

### 4.2 侧栏分区职责

| 分区 | 进来时已有 | 主操作 | 禁止塞进来的 |
|---|---|---|---|
| 本页 | 标题、作者、caption、标签、媒体计数、可见字幕 | 刷新、复制本页、丢进笔记 | 录音、建文件夹 |
| 画面 | 最近一次 OCR 文本 | 再扫一屏、翻页提示、丢进笔记 | 让用户精细涂抹选区（二期） |
| 口播 | 状态：未开始 / 进行中 / 已完成 | 开始、停止、把稿并入本页 | 打开即录、任意 URL 下载 |
| 集合 | 已保存的 Capture 列表 | 复制瘦身稿、复制全量稿、清空、删除单条 | 当笔记库编辑 |
| 笔记 | 输入框 + 本页相关笔记 | Enter 保存、改文件夹、导出 | 同步到第三方笔记软件 |

### 4.3 打开扩展的默认路径

```
点击图标
  → 打开 Side Panel
  → 识别平台
  → 抽 DOM/meta/JSON-LD
  → 截当前视口 OCR
  → 写入/更新本页 Capture
  → 自动 upsert 进集合
  → 停在「本页」分区
口播不启动
不弹文件夹选择
若该 URL 已有笔记，本页顶部显示「本页已有笔记 · N」
```

### 4.4 三条主手顺（最终产品必须同样短）

A. 只要原料  
打开 → 看本页 → 复制本页或复制给 AI  

B. 图文轮播  
打开 → 画面 → 翻下一张 → 再扫一屏 → 重复 → 复制给 AI  

C. 边看边记  
打开 → 笔记输入框打一句回车（进收集箱，自带当前 URL）  
或在本页点「丢进当前笔记」

---

## 5. 模块详述

### 5.1 本页提取

输入：当前 tab 的 DOM + 已登录会话。  
输出：统一 Capture 对象。

字段：

- platform, url, title, author  
- body（caption / 正文）  
- tags, mentions  
- images[]（url, alt）  
- videos[]（src 或占位, duration, poster）  
- transcript（平台已暴露的字幕，可为空）  
- ocrText  
- metadata（og、JSON-LD 摘要、限制说明）  
- capturedAt  

策略优先级：

1. 平台选择器  
2. 页面 hydration JSON / JSON-LD / og  
3. 可见正文兜底  
4. 视口 OCR 作为图字补充，不覆盖 caption  

平台策略：

- YouTube：继续吃 captionTracks，优先级高于 OCR 和 STT  
- 小红书 / IG 图文：caption + 多图 OCR 是主路径  
- TikTok / Reels / Shorts：caption 很短，口播和烧录字才是正文  
- X / Reddit / Threads：正文和楼中楼可选；默认仍不抓评论，设置里再开  
- 通用网页：Readability 式可见正文 + OCR  

给 AI 的两档稿：

- 瘦身：标题、正文、OCR、口播（若有）  
- 全量：上述 + 作者、URL、平台、标签、图片 URL、视频元数据、可见字幕原文  

### 5.2 画面文字

第一版：

- `chrome.tabs.captureVisibleTab` 截当前视口  
- 本地 OCR  
- 清洗：去重、丢掉过短噪声、限制行数  
- 同一 URL 多次扫描：按页序追加，不覆盖  

交互：

- 主按钮「再扫一屏」  
- 文案提示：「轮播请翻到下一张再扫」  
- 结果可单独复制，也可丢进笔记  

引擎演进：

- 现在：Tesseract  
- 下一档：RapidOCR / PaddleOCR 类中文引擎，或语言包按需加载以减小体积  
- 可选档：用户明确点「用视觉模型看这一屏」才上传截图  

二期才做：框选区域、自动点击轮播下一张、视频按时序抽帧 OCR。

### 5.3 口播转写

原则：只处理「当前正在播的这一路声音」，不处理未打开链接。

瀑布流：

1. 平台官方字幕 / captionTracks / 已打开的转写面板  
2. 页面上正在显示的 CC  
3. 用户点「开始」后：`tabCapture` / `getMediaStreamId` 抓当前标签页音频  
4. 浏览器内 Whisper（Transformers.js / WebGPU，WASM 兜底）  
5. 用户授权后的云 STT（Groq / FunASR / Gemini）——默认关  

约束：

- 必须用户手势启动（Chrome 对 tabCapture 的要求）  
- 抓流后要把声音回放到扬声器，否则标签页会静音  
- 进行中显示时长与「停止并出稿」  
- 停止后稿进入本页 `transcript`，并出现在全量 AI 稿里  
- 不在后台对所有视频预转写  

不做（完成品之前）：

- yt-dlp 伴侣进程  
- 播放列表批量转写  
- 说话人分离（可当二期）

### 5.4 集合

沿用现有 collection，换壳不换概念。

- 打开侧栏即 upsert 本页  
- fingerprint：url + title + body + ocr + transcript  
- 上限 80，可在设置里改  
- 列表可删单条、清空全部  
- 复制集合 = 按顺序拼接，前置一段固定 AI 说明  

集合是「这一次要丢给模型的材料包」，不是档案柜。

### 5.5 笔记

抄的交互，不抄整套产品：

- Cubox：先入收集箱，同一 URL 聚合  
- Obsidian Clipper：侧栏常开，保存时才关心目的地  
- dossi：笔记绑在当前 URL，回到这页还在  
- flomo：输入框 + 回车  

结构：

- 一层文件夹 + 固定「收集箱」  
- 顶上永远有输入框：`记一句，回车即存到收集箱`  
- 先列出「本页相关」，再列出当前文件夹其它笔记  
- 纯文本，停键 400ms 自动保存  
- 一条笔记一个文件夹，删除文件夹则笔记回收集箱  
- 每条显示：来源标题（可跳转）、时间、文件夹  

「丢进当前笔记」规则：

- 本页已有笔记：追加到最近一条，前面加引用分隔（来源字段 + 时间）  
- 本页没有笔记：新建，标题用帖子标题，正文先贴当前瘦身稿，光标到文末  

右键（完成品应有）：

- 追加选区到笔记  
- 打开工作台  

导出：

- 当前笔记 .md  
- 当前文件夹 .md 合并  
- 全部 JSON 备份  

不做：富文本工具栏、双向链、云、标签体系（标签若要做，放在完成品之后，且不能挡保存）。

---

## 6. 数据架构

全部 `chrome.storage.local`。无后端。无账号。

### 6.1 Capture（集合项）

```
{
  id,
  platform,
  url,
  title,
  author,
  body,
  tags[],
  mentions[],
  images[],
  videos[],
  transcript,
  ocrText,
  ocrPasses[],
  metadata,
  capturedAt,
  updatedAt
}
```

### 6.2 Folder

```
{
  id,          // inbox 为保留 id
  name,
  sort,
  createdAt
}
```

### 6.3 Note

```
{
  id,
  folderId,
  title,
  body,
  sourceUrl,
  sourceTitle,
  platform,
  createdAt,
  updatedAt
}
```

### 6.4 Settings

```
{
  aiPromptMode: "lean" | "full",
  commentsEnabled: false,
  ocrLang: "eng+chi_sim+chi_tra",
  sttEnabled: false,
  sttModel: "whisper-small",
  maxCollectionItems: 80
}
```

### 6.5 容量与备份

- 笔记与集合都可能含长文本，注意 `chrome.storage.local` 配额（约 10 MB 量级）  
- 超限时提示导出，而不是静默丢数据  
- 设置页提供「导出全部 / 导入 JSON」

---

## 7. 技术架构

### 7.1 文件与职责（目标结构）

```
manifest.json          MV3 + sidePanel + 权限
background.js          打开侧栏、右键菜单、tabCapture 中转
sidepanel.html/js/css  工作台 UI
popup.html/js          仅跳转到 side panel（过渡期可保留旧 UI）
content.js             平台路由与 DOM 提取
lib/platforms/*        每平台一个提取器（从 content.js 拆出）
lib/format.js          瘦身稿 / 全量稿 / 集合稿
lib/ocr.js             截图与 OCR
lib/stt.js             抓音与转写（可后加）
lib/store.js           collection / notes / folders
vendor/                OCR / Whisper 运行时
options.html           设置、导出导入、废弃 Gemini key 入口下线
ai/                    项目记忆，继续维护
```

### 7.2 权限（按需申请，不一次开满）

现在已有：`activeTab` `scripting` `storage` + 各平台 host。

目标增量：

- `sidePanel`  
- `contextMenus`  
- `tabs`（刷新、取当前 URL）  
- 口播阶段：`tabCapture` 或等价的 `getMediaStreamId` 流程  
- 截图：`chrome.tabs.captureVisibleTab` 所需的 activeTab / tabs  

能晚申请的晚申请。商店审核会问「为什么要听标签页声音」。

### 7.3 运行时关系

```
用户点击图标
    → background.open side panel
sidepanel
    → scripting.executeScript / 发消息给 content.js
content.js
    → 返回 Capture
sidepanel
    → OCR（扩展页里跑，不进页面 JS）
    → 写入 storage
    → 渲染
口播
    → background 拿 streamId
    → sidepanel / offscreen document 里跑 Whisper
```

MV3 注意：popup 关闭即死；侧栏可长期活。长时间 OCR / Whisper 放在 side panel 或 offscreen document，不要放在会关掉的 popup。

### 7.4 平台提取原则

- 每平台独立函数，禁止一个巨型 if 无限膨胀（现在 content.js 已有这个趋势）  
- 每个平台留 3–5 个真实 DOM fixture，选择器回归用  
- 失败要写人话：「没有字幕轨道，请到口播点开始」而不是空字段

### 7.5 安全与隐私

- 默认不把截图、音频、正文发到任何 API  
- 若未来打开「视觉模型看图」或「云转写」，必须每动作一次确认  
- 笔记与集合明文存在本机配置里，导出是用户自己的事  
- 不采集浏览历史，只处理用户主动打开工作台的当前页

---

## 8. 分期计划

原则：先换壳能用，再加深提取，最后才上重模型。

### Phase 0 · 冻结现状（0.5 天）

- 把本文写入仓库 `ai/product_architecture.md`  
- 更新 `ai/current_state.md` / `ai/roadmap.md` / `ai/decisions.md`  
- 旧 Phase 2「默认调 Gemini」标记为废弃  
- 不在这时重构提取器

### Phase 1 · 侧栏工作台空壳（优先）

交付：

- manifest 打开 sidePanel  
- 五分区骨架 + 底栏三键  
- 现有提取、OCR、集合原样迁到对应分区  
- 弹窗只负责打开侧栏  
- 打开即采 + 视口 OCR 的行为保持  

验收：现在能做的事，在侧栏里都能做，且可边翻页边开着。

### Phase 2 · 笔记最小闭环

交付：

- 收集箱 + 一层自定义文件夹  
- 输入框回车即存，绑当前 URL  
- 本页相关笔记聚合  
- 自动保存  
- 「丢进当前笔记」  
- 单条 / 文件夹导出 md  

验收：不选文件夹也能记；回到同一帖能看见昨天写的。

### Phase 3 · 复制给 AI 定稿

交付：

- 瘦身 / 全量两档  
- 集合拼接格式固定  
- 本页顶部提示「本页已有笔记」，复制给 AI 时可勾选「附带我的笔记」  
- 输出开头带平台、URL、采集时间  

验收：一份稿贴进 Gemini，不必再回页面补上下文。

### Phase 4 · 画面增强

交付：

- 「再扫一屏」追加而不是覆盖  
- OCR 预处理（放大、裁掉底栏）  
- 语言包按需加载或换中文更强的本地引擎  
- 可选：右键追加选区到笔记  

验收：小红书多图笔记扫完，图上关键句都在稿里。

### Phase 5 · 口播

交付：

- 口播分区状态机  
- tabCapture + 本地 Whisper  
- 转写结果写入 Capture.transcript  
- 明确的权限说明与失败提示  

验收：一条无字幕的 Reels / TikTok，播完能复制口播原文。

### Phase 6 · 打磨与个人可用的完成态

交付：

- 平台选择器修复（按你真实常看的站排优先级：小红书、IG、TikTok、X）  
- 设置页：评论开关、稿件档位、导出导入、下线 Gemini key  
- 体积：Tesseract / Whisper 不一次全打进首包  
- 空状态、错误文案全部中文且可执行  
- 更新 `ai/` 记忆  

此时即可称为个人完成品。不必上架。

### Phase 7 · 可选，非完成定义

- 用户确认后的视觉模型看图  
- 用户确认后的云 STT  
- 自动点击轮播下一张  
- 视频关键帧 + OCR 时间轴（panoscribe 路线）  
- 本机 sidecar（yt-dlp）处理「只丢链接、页没打开」  
- Chrome Web Store 上架与隐私政策  

没有 Phase 7，Phase 6 仍然是完整产品。

---

## 9. 里程碑与版本建议

| 版本 | 对应 | 对外可说的 |
|---|---|---|
| 0.4.0 | 现在 | 弹窗提取 + OCR + 集合 |
| 0.5.0 | Phase 1 | 侧栏五分区，旧功能迁完 |
| 0.6.0 | Phase 2–3 | 笔记 + 两档 AI 稿 |
| 0.7.0 | Phase 4 | 多屏 OCR |
| 1.0.0 | Phase 5–6 | 口播可用，个人完成品 |
| 1.x | Phase 7 | 可选云能力 / 上架 |

---

## 10. 验收标准

### 10.1 必须通过的手顺

1. 打开小红书图文 → 侧栏已有 caption → 翻图再扫 → 复制给 AI 含图字  
2. 打开无字幕短视频 → 点开始转写 → 停止 → 稿在本页也在 AI 稿里  
3. 打开任意已支持站 → 打一句回车 → 收集箱出现，带 URL  
4. 同一 URL 再打开 → 「本页已有笔记」  
5. 清空集合 → 笔记还在  
6. 导出 JSON → 清空扩展存储 → 导入 → 笔记和文件夹回来  

### 10.2 拒稿条件

- 保存笔记必须先选文件夹  
- 打开扩展自动开始录音  
- 弹窗重新变成主界面  
- 默认上传截图或音频  
- 集合删除时连笔记一起没  

---

## 11. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 平台改 DOM | 本页提取变空 | fixture + 可见文字兜底 + meta |
| IG/TikTok 反爬 | 不要走匿名下载 | 只吃已打开页 |
| tabCapture 审核 / 静音 | 口播体验差 | 回放音频；权限文案写清楚 |
| storage 配额 | 长转写 + 多笔记撑爆 | 导出提醒；集合上限 |
| 扩展体积 | Tesseract + Whisper 模型 | 按需加载；完成品可拆可选包 |
| 选择器无限膨胀 | content.js 不可维护 | 按平台拆文件 |
| 做成小 Notion | 主路径变慢 | 笔记保持纯文本 + 收集箱 |

---

## 12. 与旧文档的关系

仓库里现有：

- `ai/project_overview.md`：定位仍对，壳要从 popup 改成 side panel  
- `ai/architecture.md`：提取分层仍对，需补 sidepanel / notes / stt  
- `ai/roadmap.md`：Phase 2 默认 Gemini、Phase 3 抽帧送 Gemini，已不是默认产品路径  
- `ai/decisions.md`：2026-05-26「无 API 提取器」继续有效；本文追加「侧栏工作台 + 笔记收集箱」  
- `ai/current_state.md`：以本文第 2 节为准重写  

旧计划里「抽帧给 Gemini」「录音给 Gemini」降级为 Phase 7 可选，且必须用户确认。

---

## 13. 立即下一步（只一件）

实施 Phase 1：Side Panel 五分区空壳，把现有提取 / OCR / 集合搬进去。  
笔记和口播在壳稳定之前不要开工。

---

## 14. 交给 Claude Code

可执行说明书在 `CLAUDE.md`。把它和本文件一起放进仓库：

- `CLAUDE.md` → 仓库根目录（Claude Code 会先读）
- 本文件 → `ai/product_architecture.md`

Claude Code 只应从 Phase 1 开工，结束就停。参考项目链接、抄什么 / 不抄什么写在 `CLAUDE.md` 的「借鉴清单」。

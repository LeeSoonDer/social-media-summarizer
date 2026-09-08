# 当前状态

版本：0.5.0 · 分支 `feat/sidepanel` · 更新于 2026-09-09

## 三行现状

1. 主界面已从 460px 弹窗换成右侧 Side Panel 工作台，五分区（本页 / 画面 / 口播 / 集合 / 笔记）+ 底栏三键。
2. 原有能力（平台提取、视口 OCR、集合 upsert、复制本页 / 复制集合）已整体迁入侧栏，翻页时侧栏常驻。
3. 笔记（Phase 2）与口播引擎（Phase 5）仍是空状态，按钮 disable 并写明「下一阶段」。

## 已完成

- MV3 + `sidePanel` 权限 + `side_panel.default_path` + `background.js` service worker。
- 点击扩展图标 = 打开侧栏（`setPanelBehavior({ openPanelOnActionClick: true })`，manifest 里已移除 `default_popup`）。
- `sidepanel.html/js/css` 新建；`lib/ocr.js` 从 `popup.js` 抽出。
- `popup.html/js` 缩成跳板，只剩一个「打开侧栏工作台」按钮。
- 集合沿用 `socialExtractorCollection` key，旧数据不丢；新增 `id` / `capturedAt` / `updatedAt`，读取时自动补 `id`。
- 集合可看列表、删单条、清空、复制。
- 平台提取器 `content.js` 未改动，返回形状照旧。

## 已知限制

- 社媒 DOM 频繁改版，选择器会失效（Phase 6 按真实常用站修）。
- OCR 只扫当前视口；重扫会覆盖上一次结果，多屏合并留到 Phase 4。
- 非 YouTube 的口播没有文字来源；YouTube 字幕轨道仍走 `content.js` 原逻辑。
- Tesseract 语言包打包在 `vendor/`，扩展体积偏大。
- `host_permissions` 已升为 `<all_urls>`：侧栏拿不到 `activeTab`，`tabs.captureVisibleTab` 只认 `<all_urls>` 或 `activeTab`，否则侧栏里 OCR 必挂。

## 下一步

Phase 2 笔记最小闭环：`lib/store.js` 分开存 `folders` + `notes`，固定 `inbox`，输入框回车即存，本页相关聚合，停键 400ms 自动保存，「丢进当前笔记」接通。

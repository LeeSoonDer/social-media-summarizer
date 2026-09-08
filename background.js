// Social Extractor · MV3 service worker
// Phase 1 职责只有一件事：点击扩展图标 = 打开右侧工作台。
// 官方做法：https://developer.chrome.com/docs/extensions/reference/api/sidePanel
// 注意：manifest 的 action 里不能再写 default_popup，否则点击会被弹窗抢走。

async function openPanelOnActionClick() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.error("[social-extractor] 设置侧栏打开方式失败：", err);
  }
}

// service worker 每次唤醒都跑一次，保证行为不会因为 SW 被回收而丢失。
openPanelOnActionClick();

chrome.runtime.onInstalled.addListener(openPanelOnActionClick);
chrome.runtime.onStartup.addListener(openPanelOnActionClick);

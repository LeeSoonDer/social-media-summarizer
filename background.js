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

// 快捷键在 service worker 里触发，转发给侧栏。
// 侧栏没开的时候没有接收方，sendMessage 会 reject，吞掉即可。
chrome.commands.onCommand.addListener((command) => {
  if (command === "_execute_action") return; // 由 Chrome 自己打开侧栏
  chrome.runtime.sendMessage({ action: "command", command }).catch(() => {
    // 侧栏没开着。这里不能替用户打开它：sidePanel.open 需要用户手势，
    // 而快捷键在 SW 里不算。用户按 Alt+Shift+E 打开即可。
  });
});

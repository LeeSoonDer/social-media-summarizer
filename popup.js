// 过渡期跳板：弹窗不再是主界面，只负责把用户送进侧栏工作台。
// 正常情况下 manifest 里没有 default_popup，点图标由 background.js 直接开侧栏，
// 这个文件只在有人手动把 default_popup 加回去时才会跑。

document.getElementById("open").addEventListener("click", async () => {
  const msg = document.getElementById("msg");
  try {
    const window_ = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: window_.id });
    close();
  } catch (err) {
    msg.textContent = `打开侧栏失败：${String(err?.message || err)}`;
  }
});

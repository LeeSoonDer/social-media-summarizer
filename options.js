const STORAGE_KEY = "geminiApiKey";

async function loadKey() {
  const { [STORAGE_KEY]: key } = await chrome.storage.local.get(STORAGE_KEY);
  if (key) document.getElementById("apiKey").value = key;
}

document.getElementById("save").addEventListener("click", async () => {
  const msg = document.getElementById("msg");
  const key = document.getElementById("apiKey").value.trim();

  if (!key) {
    msg.textContent = "请输入 API Key。";
    msg.className = "err";
    return;
  }

  if (!key.startsWith("AIza")) {
    msg.textContent = "Key 格式异常（通常以 AIza 开头），请检查是否复制完整。";
    msg.className = "err";
    return;
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: key });
  msg.textContent = "已保存。可关闭此页，回到小红书/Instagram 使用扩展。";
  msg.className = "ok";
});

loadKey();

const BRIDGE_URL = "http://127.0.0.1:8765/backup";
const MENU_ID = "drive-backup-selected";

async function callBridge(ids) {
  const { bridgeToken } = await chrome.storage.local.get("bridgeToken");
  const headers = { "Content-Type": "application/json" };
  if (bridgeToken) headers["X-Bridge-Token"] = bridgeToken;

  const res = await fetch(BRIDGE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bridge error (${res.status}): ${text}`);
  }
  return res.json();
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
    return;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  }
}

async function getSelectedFiles(tabId) {
  await ensureContentScript(tabId);
  const response = await chrome.tabs.sendMessage(tabId, {
    type: "GET_SELECTED_FILES",
  });
  return response?.files ?? [];
}

async function runBackupForTab(tabId) {
  const files = await getSelectedFiles(tabId);
  const ids = files.map((f) => f.id);

  if (ids.length === 0) {
    await chrome.action.setBadgeText({ text: "0", tabId });
    await chrome.action.setBadgeBackgroundColor({ color: "#666", tabId });
    return { ok: false, error: "No files selected." };
  }

  await chrome.action.setBadgeText({ text: "…", tabId });
  await chrome.action.setBadgeBackgroundColor({ color: "#3b82f6", tabId });

  const result = await callBridge(ids);
  const okCount = Array.isArray(result?.results)
    ? result.results.filter((r) => r.ok).length
    : 0;

  await chrome.action.setBadgeText({ text: String(okCount), tabId });
  await chrome.action.setBadgeBackgroundColor({ color: "#16a34a", tabId });

  return { ok: true, result, files };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Backup selected in Drive",
    contexts: ["page", "action"],
    documentUrlPatterns: ["https://drive.google.com/*"],
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  try {
    await runBackupForTab(tab.id);
  } catch (err) {
    await chrome.action.setBadgeText({ text: "!", tabId: tab.id });
    await chrome.action.setBadgeBackgroundColor({ color: "#dc2626", tabId: tab.id });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  if (!tab?.id) return;
  try {
    await runBackupForTab(tab.id);
  } catch {
    await chrome.action.setBadgeText({ text: "!", tabId: tab.id });
    await chrome.action.setBadgeBackgroundColor({ color: "#dc2626", tabId: tab.id });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "RUN_BACKUP_FOR_TAB") {
    runBackupForTab(message.tabId)
      .then((data) => sendResponse(data))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message ?? String(err) })
      );
    return true;
  }
  if (message?.type === "GET_SELECTED_FILES_FOR_TAB") {
    getSelectedFiles(message.tabId)
      .then((files) => sendResponse({ ok: true, files }))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message ?? String(err) })
      );
    return true;
  }
  if (message?.type === "RUN_BACKUP_FOR_SENDER_TAB") {
    const tabId = message?.tabId;
    if (!tabId) {
      sendResponse({ ok: false, error: "Missing tabId" });
      return false;
    }
    runBackupForTab(tabId)
      .then((data) => sendResponse(data))
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message ?? String(err) })
      );
    return true;
  }
  return false;
});

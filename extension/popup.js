const statusEl = document.getElementById("status");
const listEl = document.getElementById("file-list");
const runBtn = document.getElementById("run");
const resultsEl = document.getElementById("results");

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function renderList(files) {
  listEl.innerHTML = "";
  if (!files.length) return;
  files.forEach((f) => {
    const li = document.createElement("li");
    li.textContent = f.name || f.id;
    listEl.appendChild(li);
  });
}

function renderResults(results, files) {
  const byId = new Map(results.map((r) => [r.id, r]));
  resultsEl.innerHTML = "";
  files.forEach((f) => {
    const r = byId.get(f.id);
    const div = document.createElement("div");
    if (r?.ok) {
      div.className = "ok";
      div.textContent = `${f.name} ✓`;
    } else {
      div.className = "err";
      div.textContent = `${f.name} ✕ ${r?.error ?? "error"}`;
    }
    resultsEl.appendChild(div);
  });
}

async function fetchSelectedFiles() {
  const tab = await getActiveTab();
  if (!tab?.id) return [];
  const response = await chrome.runtime.sendMessage({
    type: "GET_SELECTED_FILES_FOR_TAB",
    tabId: tab.id,
  });
  return response?.ok ? response.files ?? [] : [];
}

async function runBackup() {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  runBtn.disabled = true;
  statusEl.textContent = "Running backup...";

  const response = await chrome.runtime.sendMessage({
    type: "RUN_BACKUP_FOR_TAB",
    tabId: tab.id,
  });

  if (!response?.ok) {
    statusEl.textContent = response?.error ?? "Backup failed.";
    runBtn.disabled = false;
    return;
  }

  const results = response.result?.results ?? [];
  const files = response.files ?? [];
  renderResults(results, files);
  statusEl.textContent = "Done.";
  runBtn.disabled = false;
}

async function init() {
  const files = await fetchSelectedFiles();
  if (files.length === 0) {
    statusEl.textContent = "No files selected in Drive.";
    runBtn.disabled = true;
    return;
  }
  statusEl.textContent = `${files.length} file(s) selected.`;
  renderList(files);
  runBtn.disabled = false;
}

runBtn.addEventListener("click", runBackup);
init();

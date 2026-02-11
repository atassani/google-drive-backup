function findIdFromNode(node) {
  let current = node;
  for (let i = 0; i < 8 && current; i++) {
    if (current.dataset) {
      const id =
        current.dataset.id ||
        current.dataset.itemId ||
        current.dataset.fileId ||
        current.dataset.driveId;
      if (id) return id;
    }
    current = current.parentElement;
  }
  return null;
}

function findNameFromNode(node) {
  let current = node;
  for (let i = 0; i < 8 && current; i++) {
    const aria = current.getAttribute && current.getAttribute("aria-label");
    if (aria && aria !== "Item list") return aria.split(",")[0].trim();
    const title = current.getAttribute && current.getAttribute("title");
    if (title) return title.trim();
    const tooltip = current.getAttribute && current.getAttribute("data-tooltip");
    if (tooltip) return tooltip.trim();

    if (current.querySelector) {
      const linkish = current.querySelector(
        '[role="link"][aria-label], [data-tooltip], [aria-label][role="gridcell"]'
      );
      if (linkish) {
        const linkAria = linkish.getAttribute("aria-label");
        if (linkAria && linkAria !== "Item list") return linkAria.split(",")[0].trim();
        const linkTooltip = linkish.getAttribute("data-tooltip");
        if (linkTooltip) return linkTooltip.trim();
      }

      const textCell = current.querySelector('[role="gridcell"] span');
      if (textCell && textCell.textContent) return textCell.textContent.trim();
    }
    current = current.parentElement;
  }
  return null;
}

function getSelectedFiles() {
  const selected = document.querySelectorAll('[aria-selected="true"]');
  const items = [];
  const seen = new Set();
  selected.forEach((el) => {
    const id = findIdFromNode(el);
    if (id && !seen.has(id)) {
      const name = findNameFromNode(el) || "(unknown)";
      items.push({ id, name });
      seen.add(id);
    }
  });

  if (items.length > 0) return items;

  const url = window.location.href;
  const match = url.match(/\/d\/([\w-]{20,})/);
  if (match) return [{ id: match[1], name: "(current file)" }];

  const q = new URLSearchParams(window.location.search);
  const idParam = q.get("id");
  if (idParam) return [{ id: idParam, name: "(current file)" }];

  return [];
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === "GET_SELECTED_FILES") {
    const files = getSelectedFiles();
    sendResponse({ files });
  }
  return true;
});

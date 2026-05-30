import { valueOrUnknown } from "./renderStatePanel.js";

export function renderDebugPanel(els, state) {
  els.sessionSummary.textContent = valueOrUnknown(state.sessionSummary);
  renderLog(els.changeLog, state.changeLog);
  renderLog(els.parserWarnings, state.warnings, "None");
  renderSourceMap(els.parserSourceMap, state.sourceMap);
}

function renderLog(container, entries, emptyText = "Unknown") {
  container.innerHTML = "";
  if (!entries || !entries.length) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  for (const entry of entries) {
    const item = document.createElement("div");
    item.className = "log-item";
    item.textContent = typeof entry === "string"
      ? entry
      : `${entry.field || "field"}: ${entry.old ?? ""} → ${entry.new ?? ""} ${entry.reason ? `(${entry.reason})` : ""}`;
    container.append(item);
  }
}

function renderSourceMap(container, sourceMap) {
  if (!container) return;
  container.innerHTML = "";
  const entries = Object.entries(sourceMap || {});
  if (!entries.length) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "Unknown";
    container.append(empty);
    return;
  }

  for (const [field, source] of entries) {
    const item = document.createElement("div");
    item.className = "log-item";
    item.textContent = `${field}: from ${source}`;
    container.append(item);
  }
}

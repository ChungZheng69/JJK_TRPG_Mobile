import { escapeHtml, stripThinkBlocks } from "../utils/sanitize.js";

export function addMessage(messagesEl, role, text, rawJsonBlocks = [], options = {}) {
  const article = document.createElement("article");
  article.className = `message ${role === "player" ? "player-message" : "gm-message ai-message"} fade-in`;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = role === "player" ? "PLAYER COMMAND" : "AI GM";

  const content = document.createElement("div");
  content.className = "message-content";
  content.innerHTML = role === "player"
    ? renderPlayerMessage(text)
    : renderAiMessageHtml(text, rawJsonBlocks);

  article.append(meta, content);
  messagesEl.append(article);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderPlayerMessage(text) {
  return `<div class="player-command-text">${preserveLines(cleanDisplayText(text))}</div>`;
}

function renderAiMessageHtml(text, rawJsonBlocks) {
  return `${renderAiMessageSections(text)}${renderDebugBlocks(rawJsonBlocks)}`;
}

export function renderAiMessageSections(messageText) {
  const cleaned = cleanDisplayText(messageText);
  const sections = splitIntoSections(cleaned);

  if (!sections.length) {
    return renderSectionCard({
      title: "场景记录",
      body: cleaned,
      type: "scene"
    });
  }

  return sections.map(renderSectionCard).join("");
}

function splitIntoSections(text) {
  const lines = String(text || "").split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const line of lines) {
    const headingMatch = line.match(/^###\s*(.+?)\s*$/);
    if (headingMatch) {
      if (current) sections.push(current);
      const title = headingMatch[1].trim();
      current = { title, type: classifySection(title), bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    } else if (line.trim()) {
      current = { title: "场景记录", type: "scene", bodyLines: [line] };
    }
  }

  if (current) sections.push(current);
  return sections
    .map((section) => ({
      title: section.title,
      type: section.type,
      body: section.bodyLines.join("\n").trim()
    }))
    .filter((section) => section.title || section.body);
}

function classifySection(title) {
  if (/📅|当前时间|地点|场景状态/i.test(title)) return "meta";
  if (/🎬|场景叙事|叙事|剧情/i.test(title)) return "scene";
  if (/🎲|系统判定|判定栏|骰/i.test(title)) return "system";
  if (/🧭|命运的选择|选择肢|选择|行动/i.test(title)) return "choices";
  if (/🧪|debug/i.test(title)) return "debug";
  return "scene";
}

function renderSectionCard(section) {
  if (section.type === "debug") {
    return renderInlineDebugSection(section);
  }

  const bodyHtml = section.type === "choices"
    ? renderChoices(section.body)
    : renderBodyWithHighlights(section.body, section.type);

  return `
    <section class="gm-section-card gm-section-${section.type}">
      <div class="gm-section-title">${escapeHtml(section.title)}</div>
      <div class="gm-section-body">${bodyHtml}</div>
    </section>
  `;
}

function renderInlineDebugSection(section) {
  const parsed = parseDebugBlock(section.body);
  const body = parsed.ok
    ? escapeHtml(JSON.stringify(parsed.value, null, 2))
    : escapeHtml(section.body || "");

  return `
    <details class="gm-section-card gm-section-debug debug-json-panel">
      <summary>🧪 Debug JSON</summary>
      ${parsed.ok ? "" : '<p class="debug-json-error">Invalid JSON debug block</p>'}
      <pre><code>${body}</code></pre>
    </details>
  `;
}

function renderChoices(body) {
  const rows = String(body || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!rows.length) return "";
  return rows
    .map((row) => `<div class="choice-row">${escapeHtml(row)}</div>`)
    .join("");
}

function renderBodyWithHighlights(body, type) {
  const html = preserveLines(body);
  if (type !== "system") return html;

  return html
    .replace(/(大成功|critical_success)/gi, '<span class="system-success">$1</span>')
    .replace(/(大失败|critical_failure)/gi, '<span class="system-failure">$1</span>')
    .replace(/(成功|\bsuccess\b)/gi, '<span class="system-success">$1</span>')
    .replace(/(失败|\bfailure\b|\bfail\b)/gi, '<span class="system-failure">$1</span>');
}

function renderDebugBlocks(rawJsonBlocks) {
  if (!rawJsonBlocks?.length) return "";

  const panels = rawJsonBlocks.map((block, index) => {
    const parsed = parseDebugBlock(block);
    const title = rawJsonBlocks.length > 1 ? `Debug JSON ${index + 1}` : "Debug JSON";
    const body = parsed.ok
      ? escapeHtml(JSON.stringify(parsed.value, null, 2))
      : escapeHtml(String(block || ""));
    const label = parsed.ok ? title : `${title} - Invalid JSON debug block`;

    return `
      <details class="debug-json-panel">
        <summary>${escapeHtml(label)}</summary>
        ${parsed.ok ? "" : '<p class="debug-json-error">Invalid JSON debug block</p>'}
        <pre><code>${body}</code></pre>
      </details>
    `;
  }).join("");

  return `
    <details class="debug-json-group">
      <summary>🧪 Debug JSON</summary>
      ${panels}
    </details>
  `;
}

function parseDebugBlock(block) {
  if (block && typeof block === "object") return { ok: true, value: block };
  const text = String(block || "").trim();
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (_error) {
    return { ok: false, value: text };
  }
}

function preserveLines(text) {
  return escapeHtml(text || "").replace(/\n/g, "<br>");
}

function cleanDisplayText(text) {
  return removeAccidentalMetaLines(stripThinkBlocks(text || "")).trim();
}

function removeAccidentalMetaLines(text) {
  const metaLinePattern = /^\s*(?:Need dice check|Provide narration|Player attempts|Thought\s*\(|We need|Need to|Plan:|Analysis:).*$/i;
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !metaLinePattern.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

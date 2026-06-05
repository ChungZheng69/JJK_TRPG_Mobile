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
    : renderAiMessageHtml(text, rawJsonBlocks, options.dice);

  article.append(meta, content);
  messagesEl.append(article);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderPlayerMessage(text) {
  return `<div class="player-command-text">${preserveLines(cleanDisplayText(text))}</div>`;
}

function renderAiMessageHtml(text, rawJsonBlocks, dice) {
  return `${renderAiMessageSections(text)}${renderDiceConsequenceCard(dice)}${renderDebugBlocks(rawJsonBlocks)}`;
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

export function renderDiceConsequenceCard(dice) {
  if (!dice || typeof dice !== "object" || !(dice.required || dice.dice_required)) return "";
  const success = Boolean(dice.success);
  const criticalSuccess = Boolean(dice.criticalSuccess || dice.critical_success);
  const criticalFailure = Boolean(dice.criticalFailure || dice.critical_failure);
  const consequence = buildDiceConsequenceText(dice, success, criticalSuccess, criticalFailure);
  const statusClass = success ? "success" : "failure";
  const resultText = criticalSuccess
    ? "大成功"
    : criticalFailure
      ? "大失败"
      : success ? "成功" : "失败";

  return `
    <section class="gm-section-card gm-section-dice-consequence dice-result-card dice-result-${statusClass}">
      <div class="gm-section-title">🎲 Dice Result / Consequence</div>
      <dl class="dice-result-grid">
        <div><dt>Attribute</dt><dd>${escapeHtml(valueOrUnknown(dice.attribute))}</dd></div>
        <div><dt>Attribute Score</dt><dd>${escapeHtml(valueOrUnknown(dice.attributeScore ?? dice.attribute_score ?? dice.base_attribute))}</dd></div>
        <div><dt>Difficulty</dt><dd>${escapeHtml(valueOrUnknown(dice.difficulty ?? dice.difficulty_modifier))}</dd></div>
        <div><dt>Final Target</dt><dd>${escapeHtml(valueOrUnknown(dice.finalTarget ?? dice.final_target ?? dice.target))}</dd></div>
        <div><dt>Roll</dt><dd>${escapeHtml(valueOrUnknown(dice.roll ?? dice.dice_roll))}</dd></div>
        <div><dt>Result</dt><dd><span class="dice-result-badge">${escapeHtml(resultText)}</span></dd></div>
      </dl>
      <p class="dice-result-critical">${escapeHtml(formatCriticalText(criticalSuccess, criticalFailure))}</p>
      <p class="dice-result-consequence">${escapeHtml(consequence)}</p>
    </section>
  `;
}

function buildDiceConsequenceText(dice, success, criticalSuccess, criticalFailure) {
  if (criticalSuccess) {
    return "判定大成功。行动取得比预期更强的成果，你在当前局面中获得明显优势。";
  }
  if (criticalFailure) {
    return `判定大失败。${failureConsequenceText(dice)} 局势进一步恶化，需要立刻调整战术。`;
  }
  if (success) {
    return "判定成功。行动顺利推进，你取得了当前目标所需的效果。";
  }
  return `判定失败。${failureConsequenceText(dice)}`;
}

function failureConsequenceText(dice) {
  const explicit = String(dice.failure_consequence || "").trim();
  if (explicit) return explicit;
  const attribute = String(dice.attribute || "").trim();
  if (attribute === "technique") return "术式没有完全成型，消耗已发生，但效果不完整。";
  if (attribute === "cursed_energy") return "咒力流动紊乱，感知或压制没有达到预期。";
  if (attribute === "physique") return "动作没有完全跟上，位置或节奏变得不利。";
  if (attribute === "mind") return "精神压力上升，判断出现短暂迟滞。";
  return "行动没有达到预期，局面需要重新处理。";
}

function formatCriticalText(criticalSuccess, criticalFailure) {
  if (criticalSuccess) return "Critical: 大成功";
  if (criticalFailure) return "Critical: 大失败";
  return "Critical: 否";
}

function valueOrUnknown(value) {
  return value === undefined || value === null || value === "" ? "Unknown" : String(value);
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

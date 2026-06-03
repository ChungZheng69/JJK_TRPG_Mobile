export function extractJsonCodeBlocks(text) {
  const jsonBlocks = [];
  const textWithoutJson = text.replace(/```[ \t]*(?:json)?[ \t]*(?:\r?\n)?([\s\S]*?)```/gi, (match, body) => {
    const trimmed = body.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      jsonBlocks.push(trimmed);
      return "";
    }
    return match;
  });

  return { textWithoutJson, jsonBlocks };
}

export function extractLikelyJsonObjects(text, warnings = []) {
  const found = [];
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    const raw = balancedJsonFrom(text, start);
    if (!raw) continue;
    // Ordinary narration can contain braces. Do not spam parser warnings for
    // inline candidates unless they successfully look like game payloads.
    const value = safeJsonParse(raw, "inline JSON object", []);
    if (value && looksLikeGamePayload(value)) {
      found.push({ raw, value });
    }
  }
  return found;
}

export function extractNamedJsonPayloads(text, warnings = []) {
  const names = [
    "frontend_state_json",
    "full_response_json",
    "p_visible_summary_json",
    "full_response_payload_json",
    "player_visible_summary_json",
    "dice_result_json",
    "state_change_log_json",
    "parser_warnings_json"
  ];
  const found = [];

  for (const name of names) {
    let searchIndex = 0;
    while (searchIndex < text.length) {
      const index = text.indexOf(name, searchIndex);
      if (index < 0) break;
      const afterName = text.slice(index + name.length);
      const separatorMatch = afterName.match(/^\s*[:=]\s*/);
      if (!separatorMatch) {
        searchIndex = index + name.length;
        continue;
      }

      const valueStart = index + name.length + separatorMatch[0].length;
      const firstChar = text[valueStart];
      let raw = "";
      if (firstChar === "{" || firstChar === "[") {
        raw = firstChar === "{" ? balancedJsonFrom(text, valueStart) : balancedArrayFrom(text, valueStart);
      } else if (firstChar === '"') {
        raw = readJsonStringLiteral(text, valueStart);
      }

      if (raw) {
        const value = safeJsonParse(raw, name, []);
        found.push({ name, raw, value });
        searchIndex = valueStart + raw.length;
      } else {
        warnings.push(`${name} was found but its JSON payload could not be extracted.`);
        searchIndex = valueStart + 1;
      }
    }
  }

  return found.filter((item) => item.raw);
}

export function safeJsonParse(text, label = "JSON", warnings = []) {
  if (text === undefined || text === null || text === "") return null;
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch (error) {
    warnings.push(`${label} parse failed: ${error.message}`);
    return null;
  }
}

function balancedJsonFrom(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function balancedArrayFrom(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function readJsonStringLiteral(text, start) {
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) escaped = false;
    else if (char === "\\") escaped = true;
    else if (char === '"') return text.slice(start, index + 1);
  }
  return "";
}

function looksLikeGamePayload(value) {
  if (!value || typeof value !== "object") return false;
  const keys = JSON.stringify(value);
  return /dice|state|mechanics|player_visible_summary|full_response_payload|Current_HP|Inventory|Active_Flag|Session_Summary/i.test(keys);
}

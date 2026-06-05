const LLM_HISTORY_TURN_LIMIT = 12;
const RESPONSE_HISTORY_TURN_LIMIT = 30;
const SUMMARIZED_HISTORY_TURN_LIMIT = 16;

export function buildRecentHistoryContext(chatHistory = []) {
  const entries = normalizeChatHistory(chatHistory).slice(-LLM_HISTORY_TURN_LIMIT);
  if (!entries.length) return "【最近剧情记录】\n暂无。";

  const lines = ["【最近剧情记录】"];
  for (const entry of entries) {
    const label = entry.role === "player" ? "玩家" : "GM";
    lines.push(`${label}：${entry.text}`);
  }
  return lines.join("\n");
}

export function buildUpdatedChatHistory({ chatHistory = [], userMessage = "", visibleText = "" }) {
  const now = new Date().toISOString();
  const normalized = normalizeChatHistory(chatHistory);
  const withoutCurrentPlayer = removeTrailingDuplicatePlayerMessage(normalized, userMessage);
  return [
    ...withoutCurrentPlayer,
    {
      role: "player",
      text: String(userMessage || ""),
      timestamp: now
    },
    {
      role: "gm",
      text: String(visibleText || ""),
      timestamp: now
    }
  ].slice(-RESPONSE_HISTORY_TURN_LIMIT);
}

export function shouldUpdateSessionSummary({ chatHistory = [], turnCount = null } = {}) {
  if (String(process.env.FORCE_SUMMARY_UPDATE || "").toLowerCase() === "true") return true;
  const normalized = normalizeChatHistory(chatHistory);
  const playerTurnCount = turnCount !== null && turnCount !== undefined && Number.isFinite(Number(turnCount))
    ? Number(turnCount)
    : normalized.filter((entry) => entry.role === "player").length;
  return (playerTurnCount > 0 && playerTurnCount % 6 === 0) || normalized.length >= 24;
}

export function trimChatHistoryAfterSummary(chatHistory = []) {
  return normalizeChatHistory(chatHistory).slice(-SUMMARIZED_HISTORY_TURN_LIMIT);
}

export function normalizeChatHistory(chatHistory = []) {
  return (Array.isArray(chatHistory) ? chatHistory : [])
    .map((entry) => {
      const role = normalizeRole(entry?.role);
      const text = String(entry?.text ?? entry?.content ?? entry?.message ?? "").trim();
      if (!role || !text) return null;
      return {
        role,
        text,
        timestamp: entry?.timestamp ? String(entry.timestamp) : ""
      };
    })
    .filter(Boolean);
}

function removeTrailingDuplicatePlayerMessage(chatHistory, userMessage) {
  const last = chatHistory.at(-1);
  if (last?.role === "player" && last.text === String(userMessage || "").trim()) {
    return chatHistory.slice(0, -1);
  }
  return chatHistory;
}

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "player" || value === "user") return "player";
  if (value === "gm" || value === "assistant" || value === "ai") return "gm";
  return null;
}

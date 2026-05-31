const STORAGE_KEYS = {
  conversationId: "jjk_trpg_conversation_id",
  userId: "jjk_trpg_user_id",
  debugMode: "jjk_trpg_debug_mode",
  chatHistory: "jjk_trpg_chat_history",
  gameState: "jjk_trpg_game_state"
};

export function ensureUserId() {
  let userId = getUserId();
  if (!userId) {
    userId = `jjk-player-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
    setUserId(userId);
  }
  return userId;
}

export function getUserId() {
  return localStorage.getItem(STORAGE_KEYS.userId) || "";
}

export function setUserId(userId) {
  if (userId) localStorage.setItem(STORAGE_KEYS.userId, String(userId));
}

export function getConversationId() {
  return localStorage.getItem(STORAGE_KEYS.conversationId) || "";
}

export function setConversationId(conversationId) {
  if (conversationId) {
    localStorage.setItem(STORAGE_KEYS.conversationId, conversationId);
  }
}

export function clearConversationId() {
  localStorage.removeItem(STORAGE_KEYS.conversationId);
}

export function getDebugMode() {
  return localStorage.getItem(STORAGE_KEYS.debugMode) === "true";
}

export function setDebugMode(enabled) {
  localStorage.setItem(STORAGE_KEYS.debugMode, enabled ? "true" : "false");
}

export function saveChatHistory(chatHistory) {
  localStorage.setItem(STORAGE_KEYS.chatHistory, JSON.stringify(chatHistory || []));
}

export function loadChatHistory() {
  return readJsonStorage(STORAGE_KEYS.chatHistory, []);
}

export function saveGameState(gameState) {
  localStorage.setItem(STORAGE_KEYS.gameState, JSON.stringify(gameState || {}));
}

export function loadGameState() {
  return readJsonStorage(STORAGE_KEYS.gameState, null);
}

export function clearSession({ clearUser = false } = {}) {
  clearConversationId();
  localStorage.removeItem(STORAGE_KEYS.chatHistory);
  localStorage.removeItem(STORAGE_KEYS.gameState);
  if (clearUser) localStorage.removeItem(STORAGE_KEYS.userId);
}

export function restoreSessionFromLocalStorage() {
  return {
    conversationId: getConversationId(),
    userId: ensureUserId(),
    chatHistory: loadChatHistory(),
    gameState: loadGameState()
  };
}

export function exportTextLog(chatHistory, gameState) {
  const timestamp = new Date();
  const lines = [
    `TRPG Session Log`,
    `Exported At: ${timestamp.toISOString()}`,
    "",
    ...formatChatHistory(chatHistory),
    "",
    "=== Current Game State ===",
    JSON.stringify(gameState || {}, null, 2)
  ];
  downloadFile(`trpg-session-log-${formatFileTimestamp(timestamp)}.txt`, lines.join("\n"), "text/plain;charset=utf-8");
}

export function exportJsonSave({ conversationId, userId, chatHistory, gameState }) {
  const timestamp = new Date();
  const payload = {
    conversation_id: conversationId || "",
    user_id: userId || "",
    chatHistory: chatHistory || [],
    gameState: gameState || {},
    exportedAt: timestamp.toISOString()
  };
  downloadFile(
    `trpg-save-${formatFileTimestamp(timestamp)}.json`,
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8"
  );
}

export async function importJsonSave(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON save file: ${error.message}`);
  }

  if (!Array.isArray(payload.chatHistory) || !payload.gameState || typeof payload.gameState !== "object") {
    throw new Error("Invalid save file. Expected chatHistory array and gameState object.");
  }

  return payload;
}

function readJsonStorage(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

function formatChatHistory(chatHistory) {
  return (chatHistory || []).map((entry) => {
    const stamp = entry.timestamp ? `[${entry.timestamp}] ` : "";
    const label = entry.role === "player" ? "Player" : "AI GM";
    return `${stamp}${label}:\n${entry.text || ""}\n`;
  });
}

function formatFileTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + `-${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

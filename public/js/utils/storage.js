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
    userId = `jjk-player-${safeRandomId()}`;
    setUserId(userId);
  }
  return userId;
}

export function getUserId() {
  return safeStorageGet(STORAGE_KEYS.userId);
}

export function setUserId(userId) {
  if (userId) safeStorageSet(STORAGE_KEYS.userId, String(userId));
}

export function getConversationId() {
  return safeStorageGet(STORAGE_KEYS.conversationId);
}

export function setConversationId(conversationId) {
  if (conversationId) {
    safeStorageSet(STORAGE_KEYS.conversationId, conversationId);
  }
}

export function clearConversationId() {
  safeStorageRemove(STORAGE_KEYS.conversationId);
}

export function getDebugMode() {
  return safeStorageGet(STORAGE_KEYS.debugMode) === "true";
}

export function setDebugMode(enabled) {
  safeStorageSet(STORAGE_KEYS.debugMode, enabled ? "true" : "false");
}

export function saveChatHistory(chatHistory) {
  safeStorageSet(STORAGE_KEYS.chatHistory, JSON.stringify(chatHistory || []));
}

export function clearChatHistory() {
  safeStorageRemove(STORAGE_KEYS.chatHistory);
}

export function loadChatHistory() {
  return readJsonStorage(STORAGE_KEYS.chatHistory, []);
}

export function saveGameState(gameState) {
  safeStorageSet(STORAGE_KEYS.gameState, JSON.stringify(gameState || {}));
}

export function loadGameState() {
  return readJsonStorage(STORAGE_KEYS.gameState, null);
}

export function clearSession({ clearUser = false } = {}) {
  clearConversationId();
  safeStorageRemove(STORAGE_KEYS.chatHistory);
  safeStorageRemove(STORAGE_KEYS.gameState);
  if (clearUser) safeStorageRemove(STORAGE_KEYS.userId);
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
  const payload = parseSaveJsonText(text);

  if (!Array.isArray(payload.chatHistory) || !payload.gameState || typeof payload.gameState !== "object") {
    throw new Error("Invalid save file. Expected chatHistory array and gameState object.");
  }

  return payload;
}

export async function importJsonStateOnly(file) {
  const text = await file.text();
  const payload = parseSaveJsonText(text);

  if (!payload.gameState || typeof payload.gameState !== "object") {
    throw new Error("Invalid save file. Expected gameState object.");
  }

  return {
    conversation_id: payload.conversation_id || "",
    user_id: payload.user_id || "",
    gameState: payload.gameState
  };
}

function parseSaveJsonText(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON save file: ${error.message}`);
  }
}

function readJsonStorage(key, fallback) {
  const raw = safeStorageGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn("LOCAL_STORAGE_PARSE_ERROR", {
      key,
      error: error instanceof Error ? error.message : String(error)
    });
    safeStorageRemove(key);
    return fallback;
  }
}

function safeStorageGet(key) {
  if (typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(key) || "";
  } catch (error) {
    console.warn("LOCAL_STORAGE_READ_ERROR", {
      key,
      error: error instanceof Error ? error.message : String(error)
    });
    return "";
  }
}

function safeStorageSet(key, value) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn("LOCAL_STORAGE_WRITE_ERROR", {
      key,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function safeStorageRemove(key) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn("LOCAL_STORAGE_REMOVE_ERROR", {
      key,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function safeRandomId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch (_error) {
    // Fall through to timestamp-based id.
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

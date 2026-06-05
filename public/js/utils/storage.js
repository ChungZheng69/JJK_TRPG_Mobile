import { getGameState, normalizeGameState } from "../state/gameState.js";

const STORAGE_KEYS = {
  conversationId: "jjk_trpg_conversation_id",
  userId: "jjk_trpg_user_id",
  debugMode: "jjk_trpg_debug_mode",
  chatHistory: "jjk_trpg_chat_history",
  gameState: "jjk_trpg_game_state",
  localSave: "jjk_trpg_save_local_main"
};

const LOCAL_SAVE_VERSION = 1;
const DEFAULT_LOCAL_SAVE_CODE = "local-main";
const SENSITIVE_SAVE_KEYS = new Set([
  "userapikey",
  "user_api_key",
  "apikey",
  "api_key",
  "geminiapikey",
  "gemini_api_key",
  "googleapikey",
  "google_api_key"
]);

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
  safeStorageSet(STORAGE_KEYS.chatHistory, JSON.stringify(normalizeChatHistory(chatHistory)));
}

export function clearChatHistory() {
  safeStorageRemove(STORAGE_KEYS.chatHistory);
}

export function loadChatHistory() {
  return normalizeChatHistory(readJsonStorage(STORAGE_KEYS.chatHistory, []));
}

export function saveGameState(gameState) {
  safeStorageSet(STORAGE_KEYS.gameState, JSON.stringify(stripSensitiveSaveFields(gameState || {})));
}

export function loadGameState() {
  return stripSensitiveSaveFields(readJsonStorage(STORAGE_KEYS.gameState, null));
}

export function clearSession({ clearUser = false } = {}) {
  clearConversationId();
  safeStorageRemove(STORAGE_KEYS.chatHistory);
  safeStorageRemove(STORAGE_KEYS.gameState);
  if (clearUser) safeStorageRemove(STORAGE_KEYS.userId);
}

export function restoreSessionFromLocalStorage() {
  const localSave = loadLocalSave();
  if (localSave) {
    return {
      conversationId: getConversationId(),
      userId: ensureUserId(),
      chatHistory: localSave.chatHistory,
      gameState: {
        ...localSave.gameState,
        sessionSummary: localSave.sessionSummary
      },
      sessionSummary: localSave.sessionSummary,
      turnCount: localSave.turnCount,
      saveCode: localSave.saveCode,
      updatedAt: localSave.updatedAt
    };
  }

  return {
    conversationId: getConversationId(),
    userId: ensureUserId(),
    chatHistory: loadChatHistory(),
    gameState: normalizeGameState(loadGameState() || getGameState()),
    sessionSummary: "",
    turnCount: 0,
    saveCode: DEFAULT_LOCAL_SAVE_CODE,
    updatedAt: ""
  };
}

export function loadLocalSave() {
  const raw = safeStorageGet(STORAGE_KEYS.localSave);
  if (!raw) {
    console.log("LOCAL_SAVE_LOADED", false);
    return null;
  }

  try {
    const save = normalizeSaveData(JSON.parse(raw), { preserveUpdatedAt: true });
    console.log("LOCAL_SAVE_LOADED", true);
    return save;
  } catch (error) {
    console.warn("LOCAL_SAVE_IMPORT_FAILED", error instanceof Error ? error.message : String(error));
    safeStorageRemove(STORAGE_KEYS.localSave);
    console.log("LOCAL_SAVE_LOADED", false);
    return null;
  }
}

export function saveLocalGame(saveData = {}) {
  const save = normalizeSaveData(saveData);
  safeStorageSet(STORAGE_KEYS.localSave, JSON.stringify(save));
  saveGameState({
    ...save.gameState,
    sessionSummary: save.sessionSummary
  });
  saveChatHistory(save.chatHistory);
  console.log("LOCAL_SAVE_WRITTEN", save.updatedAt);
  return save;
}

export function clearLocalSave({ clearUser = false } = {}) {
  safeStorageRemove(STORAGE_KEYS.localSave);
  clearSession({ clearUser });
  console.log("LOCAL_SAVE_CLEARED");
}

export function exportLocalSave(saveData = {}) {
  const save = normalizeSaveData(saveData);
  const text = JSON.stringify(save, null, 2);
  console.log("LOCAL_SAVE_EXPORT_LENGTH", text.length);
  downloadFile(
    `trpg-local-save-${formatFileTimestamp(new Date(save.updatedAt))}.json`,
    text,
    "application/json;charset=utf-8"
  );
  return text;
}

export function importLocalSave(jsonText) {
  try {
    const save = normalizeSaveData(parseSaveJsonText(jsonText));
    console.log("LOCAL_SAVE_IMPORT_SUCCESS");
    return save;
  } catch (error) {
    console.warn("LOCAL_SAVE_IMPORT_FAILED", error instanceof Error ? error.message : String(error));
    throw error;
  }
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
  const payload = normalizeSaveData({
    saveCode: DEFAULT_LOCAL_SAVE_CODE,
    gameState,
    chatHistory,
    sessionSummary: gameState?.sessionSummary || "",
    updatedAt: timestamp.toISOString()
  });
  const legacyFields = {
    conversation_id: conversationId || "",
    user_id: userId || "",
    exportedAt: timestamp.toISOString()
  };
  downloadFile(
    `trpg-save-${formatFileTimestamp(timestamp)}.json`,
    JSON.stringify({ ...payload, ...legacyFields }, null, 2),
    "application/json;charset=utf-8"
  );
}

export async function importJsonSave(file) {
  const text = await file.text();
  const payload = importLocalSave(text);

  if (!Array.isArray(payload.chatHistory) || !payload.gameState || typeof payload.gameState !== "object") {
    throw new Error("Invalid save file. Expected chatHistory array and gameState object.");
  }

  return payload;
}

export async function importJsonStateOnly(file) {
  const text = await file.text();
  const payload = parseSaveJsonText(text);

  if (!isPlainObject(payload) || !isPlainObject(payload.gameState)) {
    throw new Error("Invalid save file. Expected gameState object.");
  }

  return {
    conversation_id: payload.conversation_id || "",
    user_id: payload.user_id || "",
    gameState: stripSensitiveSaveFields(payload.gameState)
  };
}

export function countPlayerTurns(chatHistory = []) {
  return normalizeChatHistory(chatHistory)
    .filter((entry) => {
      const role = String(entry?.role || "").trim().toLowerCase();
      return role === "player" || role === "user";
    })
    .length;
}

export function normalizeSaveData(rawSave, { preserveUpdatedAt = false } = {}) {
  console.log("SAVE_NORMALIZE_START");
  try {
    const source = stripSensitiveSaveFields(extractSaveSource(rawSave));
    const recovered = [];

    if (!isPlainObject(rawSave)) recovered.push("save_root");
    if (!isPlainObject(source.gameState)) recovered.push("gameState");
    if (!Array.isArray(source.chatHistory)) recovered.push("chatHistory");
    if (!isValidDateString(source.updatedAt)) recovered.push("updatedAt");

    const fallbackState = safeNormalizeGameState(getGameState());
    const gameState = stripSensitiveSaveFields(safeNormalizeGameState(isPlainObject(source.gameState) ? source.gameState : fallbackState));
    const chatHistory = normalizeChatHistory(source.chatHistory);
    const sessionSummary = normalizeSessionSummary(source.sessionSummary ?? gameState.sessionSummary);
    const updatedAt = preserveUpdatedAt && isValidDateString(source.updatedAt)
      ? source.updatedAt
      : new Date().toISOString();

    const save = {
      version: Number.parseInt(source.version, 10) || LOCAL_SAVE_VERSION,
      saveCode: normalizeSaveCode(source.saveCode),
      updatedAt,
      gameState: {
        ...gameState,
        sessionSummary
      },
      chatHistory,
      sessionSummary,
      turnCount: normalizeTurnCount(source.turnCount, chatHistory)
    };

    if (recovered.length) {
      console.warn("SAVE_LOAD_INVALID_SHAPE", recovered);
      console.log("SAVE_LOAD_RECOVERED_WITH_DEFAULTS");
    }
    console.log("SAVE_LOAD_CHAT_HISTORY_LENGTH", save.chatHistory.length);
    console.log("SAVE_LOAD_SESSION_SUMMARY_LENGTH", save.sessionSummary.length);
    console.log("SAVE_NORMALIZE_SUCCESS");
    return save;
  } catch (error) {
    console.warn("SAVE_NORMALIZE_FAILED", error instanceof Error ? error.message : String(error));
    const fallbackState = safeNormalizeGameState(getGameState());
    const fallbackSave = {
      version: LOCAL_SAVE_VERSION,
      saveCode: DEFAULT_LOCAL_SAVE_CODE,
      updatedAt: new Date().toISOString(),
      gameState: {
        ...fallbackState,
        sessionSummary: normalizeSessionSummary(fallbackState.sessionSummary)
      },
      chatHistory: [],
      sessionSummary: normalizeSessionSummary(fallbackState.sessionSummary),
      turnCount: 0
    };
    console.warn("SAVE_LOAD_INVALID_SHAPE", ["normalization_error"]);
    console.log("SAVE_LOAD_RECOVERED_WITH_DEFAULTS");
    console.log("SAVE_LOAD_CHAT_HISTORY_LENGTH", fallbackSave.chatHistory.length);
    console.log("SAVE_LOAD_SESSION_SUMMARY_LENGTH", fallbackSave.sessionSummary.length);
    return fallbackSave;
  }
}

export function normalizeChatHistory(chatHistory = []) {
  return (Array.isArray(chatHistory) ? chatHistory : [])
    .map((entry) => {
      if (!isPlainObject(entry)) return null;
      const text = String(entry.text ?? entry.content ?? entry.message ?? "").trim();
      if (!text) return null;
      const role = normalizeChatRole(entry.role);
      if (!role) return null;
      return {
        ...entry,
        role,
        text,
        timestamp: entry.timestamp ? String(entry.timestamp) : ""
      };
    })
    .filter(Boolean);
}

function stripSensitiveSaveFields(value, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    return value.map((item) => stripSensitiveSaveFields(item, seen));
  }
  if (!isPlainObject(value)) return value;
  if (seen.has(value)) return {};
  seen.add(value);

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isSensitiveSaveKey(key))
      .map(([key, item]) => [key, stripSensitiveSaveFields(item, seen)])
  );
}

function isSensitiveSaveKey(key) {
  const normalized = String(key || "").replace(/[-_\s]/g, "").toLowerCase();
  return SENSITIVE_SAVE_KEYS.has(String(key || "").trim().toLowerCase())
    || SENSITIVE_SAVE_KEYS.has(normalized)
    || (normalized.includes("apikey") && (normalized.includes("gemini") || normalized.includes("google") || normalized.includes("user")));
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hasKey(value, key) {
  return isPlainObject(value) && key in value;
}

function extractSaveSource(rawSave) {
  if (isPlainObject(rawSave?.saveData)) return rawSave.saveData;
  return isPlainObject(rawSave) ? rawSave : {};
}

function safeNormalizeGameState(value) {
  try {
    return normalizeGameState(isPlainObject(value) ? value : {});
  } catch (error) {
    console.warn("SAVE_GAME_STATE_NORMALIZE_FAILED", error instanceof Error ? error.message : String(error));
    return {};
  }
}

function normalizeChatRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "player" || value === "user") return "player";
  if (value === "gm" || value === "assistant" || value === "ai") return "gm";
  return null;
}

function normalizeSessionSummary(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return text === "Unknown" ? "" : text;
}

function normalizeSaveCode(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,40}$/.test(text) ? text : DEFAULT_LOCAL_SAVE_CODE;
}

function normalizeTurnCount(value, chatHistory) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number >= 0 ? number : countPlayerTurns(chatHistory);
}

function isValidDateString(value) {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
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
  return normalizeChatHistory(chatHistory).map((entry) => {
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

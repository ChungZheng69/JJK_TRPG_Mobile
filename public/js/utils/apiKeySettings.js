const USER_GEMINI_API_KEY_STORAGE_KEY = "jjk_trpg_user_gemini_api_key";

let sessionUserGeminiApiKey = "";

export function getUserGeminiApiKey() {
  return sessionUserGeminiApiKey || getSavedUserGeminiApiKey();
}

export function getSavedUserGeminiApiKey() {
  return safeStorageGet(USER_GEMINI_API_KEY_STORAGE_KEY);
}

export function hasSavedUserGeminiApiKey() {
  return Boolean(getSavedUserGeminiApiKey());
}

export function setUserGeminiApiKey(apiKey, { saveOnDevice = false } = {}) {
  const normalized = String(apiKey || "").trim();
  sessionUserGeminiApiKey = normalized;

  if (saveOnDevice && normalized) {
    safeStorageSet(USER_GEMINI_API_KEY_STORAGE_KEY, normalized);
  } else if (!saveOnDevice) {
    safeStorageRemove(USER_GEMINI_API_KEY_STORAGE_KEY);
  }

  console.log("USER_API_KEY_PRESENT", Boolean(normalized || getSavedUserGeminiApiKey()));
  console.log("USER_API_KEY_SAVED_ON_DEVICE", Boolean(saveOnDevice && normalized));
}

export function clearUserGeminiApiKey() {
  sessionUserGeminiApiKey = "";
  safeStorageRemove(USER_GEMINI_API_KEY_STORAGE_KEY);
  console.log("USER_API_KEY_CLEARED");
}

function safeStorageGet(key) {
  if (typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(key) || "";
  } catch (_error) {
    return "";
  }
}

function safeStorageSet(key, value) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch (_error) {
    // Ignore storage failures; the key remains available in memory for this session.
  }
}

function safeStorageRemove(key) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch (_error) {
    // Nothing to clear when storage is unavailable.
  }
}

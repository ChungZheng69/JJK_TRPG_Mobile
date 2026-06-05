import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";

export const cloudSaveRouter = Router();

const projectRoot = process.cwd();
const dataDir = path.join(projectRoot, "data");
const cloudSavesPath = path.join(dataDir, "cloud_saves.json");
const SAVE_CODE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const SENSITIVE_SAVE_KEYS = new Set([
  "userApiKey",
  "user_api_key",
  "apiKey",
  "api_key",
  "OPENAI_API_KEY",
  "openai_api_key",
  "LLM_API_KEY",
  "llm_api_key",
  "OPENROUTER_API_KEY",
  "openrouter_api_key",
  "GEMINI_API_KEY",
  "gemini_api_key",
  "GOOGLE_API_KEY",
  "google_api_key"
]);

console.log("CLOUD_SAVE_FILE_PATH", cloudSavesPath);

cloudSaveRouter.post("/", async (req, res) => {
  console.log("CLOUD_SAVE_POST_ROUTE_HIT");
  const body = req.body || {};
  const saveCode = normalizeSaveCode(body.saveCode);
  console.log("CLOUD_SAVE_WRITE_START", saveCode);
  console.log("CLOUD_SAVE_REQ_BODY_KEYS", Object.keys(body));
  console.log("CLOUD_SAVE_REQ_SAVE_CODE", body.saveCode);
  console.log("CLOUD_SAVE_REQ_HAS_SAVE_DATA", Boolean(body.saveData));

  if (!isValidSaveCode(saveCode)) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_SAVE_CODE",
      suggestion: "Use 1-40 letters, numbers, underscore, or hyphen."
    });
  }

  try {
    const saveData = validateSaveData(body.saveData);
    const updatedAt = new Date().toISOString();
    const store = await readCloudSaves();
    const normalizedSaveData = normalizeSaveDataForResponse({
      ...saveData,
      saveCode,
      updatedAt
    });
    console.log("CLOUD_SAVE_WRITE_SAVE_DATA_KEYS", Object.keys(normalizedSaveData));
    console.log("CLOUD_SAVE_WRITE_CHAT_HISTORY_LENGTH", normalizedSaveData.chatHistory.length);
    console.log("CLOUD_SAVE_WRITE_SESSION_SUMMARY_LENGTH", normalizedSaveData.sessionSummary.length);

    // Prototype only: Render filesystem storage may reset after redeploy. Supabase is recommended later.
    store[saveCode] = {
      saveCode,
      updatedAt,
      saveData: stripSensitiveSaveKeys(normalizedSaveData)
    };

    await writeCloudSaves(store);
    const fileStats = await fs.stat(cloudSavesPath);
    console.log("CLOUD_SAVE_FILE_PATH", cloudSavesPath);
    console.log("CLOUD_SAVE_WRITE_SUCCESS", saveCode);
    console.log("CLOUD_SAVE_FILE_SIZE", fileStats.size);
    return res.json({
      ok: true,
      saveCode,
      updatedAt
    });
  } catch (error) {
    console.error("CLOUD_SAVE_WRITE_FAILED", {
      saveCode,
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(error?.status || 500).json({
      ok: false,
      error: error?.code || "CLOUD_SAVE_WRITE_FAILED",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

cloudSaveRouter.get("/:saveCode", async (req, res) => {
  console.log("CLOUD_SAVE_GET_ROUTE_HIT", req.params.saveCode);
  const saveCode = normalizeSaveCode(req.params.saveCode);
  console.log("CLOUD_SAVE_LOAD_START", saveCode);

  if (!isValidSaveCode(saveCode)) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_SAVE_CODE",
      suggestion: "Use 1-40 letters, numbers, underscore, or hyphen."
    });
  }

  try {
    const store = await readCloudSaves();
    const storedRecord = store[saveCode];
    if (!storedRecord) {
      console.log("CLOUD_SAVE_LOAD_NOT_FOUND", { saveCode });
      return res.status(404).json({
        ok: false,
        error: "SAVE_NOT_FOUND"
      });
    }
    console.log("CLOUD_SAVE_RAW_RECORD_KEYS", Object.keys(storedRecord || {}));

    const extractedSaveData = extractSaveDataFromStoredRecord(storedRecord);
    console.log("CLOUD_SAVE_EXTRACTED_SAVE_DATA", Boolean(extractedSaveData));
    if (!extractedSaveData) {
      console.log("CLOUD_SAVE_LOAD_INVALID_SHAPE", saveCode);
      return res.status(500).json({
        ok: false,
        error: "INVALID_CLOUD_SAVE_SHAPE",
        suggestion: "Cloud save exists but does not contain valid saveData."
      });
    }

    const saveData = normalizeSaveDataForResponse({
      ...extractedSaveData,
      saveCode,
      updatedAt: extractedSaveData.updatedAt || storedRecord.updatedAt
    });
    console.log("CLOUD_SAVE_LOAD_CHAT_HISTORY_LENGTH", saveData.chatHistory.length);
    console.log("CLOUD_SAVE_LOAD_SESSION_SUMMARY_LENGTH", saveData.sessionSummary.length);
    console.log("CLOUD_SAVE_LOAD_SUCCESS", saveCode);
    return res.json({
      ok: true,
      saveCode,
      saveData
    });
  } catch (error) {
    console.error("CLOUD_SAVE_LOAD_FAILED", {
      saveCode,
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(500).json({
      ok: false,
      error: "CLOUD_SAVE_LOAD_FAILED",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

cloudSaveRouter.delete("/:saveCode", async (req, res) => {
  console.log("CLOUD_SAVE_DELETE_ROUTE_HIT", req.params.saveCode);
  const saveCode = normalizeSaveCode(req.params.saveCode);

  if (!isValidSaveCode(saveCode)) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_SAVE_CODE",
      suggestion: "Use 1-40 letters, numbers, underscore, or hyphen."
    });
  }

  try {
    const store = await readCloudSaves();
    delete store[saveCode];
    await writeCloudSaves(store);
    console.log("CLOUD_SAVE_DELETE_SUCCESS", { saveCode });
    return res.json({
      ok: true,
      saveCode
    });
  } catch (error) {
    console.error("CLOUD_SAVE_DELETE_FAILED", {
      saveCode,
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(500).json({
      ok: false,
      error: "CLOUD_SAVE_DELETE_FAILED",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

async function readCloudSaves() {
  await ensureDataFile();
  try {
    const raw = await fs.readFile(cloudSavesPath, "utf8");
    const cleanedRaw = raw.replace(/^\uFEFF/, "");
    const parsed = cleanedRaw ? JSON.parse(cleanedRaw) : {};
    return isPlainObject(parsed) ? parsed : {};
  } catch (error) {
    if (error?.code === "ENOENT") {
      await writeCloudSaves({});
      return {};
    }
    throw error;
  }
}

async function writeCloudSaves(store) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(cloudSavesPath, JSON.stringify(store || {}, null, 2), "utf8");
}

async function ensureDataFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(cloudSavesPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await writeCloudSaves({});
  }
}

function validateSaveData(saveData) {
  if (!isPlainObject(saveData)) {
    const error = new Error("saveData must be an object.");
    error.status = 400;
    error.code = "INVALID_SAVE_DATA";
    throw error;
  }
  if (!isPlainObject(saveData.gameState)) {
    const error = new Error("saveData.gameState must be an object.");
    error.status = 400;
    error.code = "INVALID_SAVE_DATA";
    throw error;
  }

  return {
    version: Number.parseInt(saveData.version, 10) || 1,
    saveCode: stringOrEmpty(saveData.saveCode),
    updatedAt: stringOrEmpty(saveData.updatedAt),
    gameState: saveData.gameState,
    chatHistory: Array.isArray(saveData.chatHistory) ? saveData.chatHistory : [],
    sessionSummary: stringOrEmpty(saveData.sessionSummary ?? saveData.gameState.sessionSummary),
    turnCount: normalizeTurnCount(saveData.turnCount, saveData.chatHistory)
  };
}

function extractSaveDataFromStoredRecord(storedRecord) {
  if (!isPlainObject(storedRecord)) return null;

  if (isPlainObject(storedRecord.saveData)) {
    return storedRecord.saveData;
  }

  if (isPlainObject(storedRecord.data)) {
    return storedRecord.data;
  }

  if (isPlainObject(storedRecord.save)) {
    return storedRecord.save;
  }

  if (
    storedRecord.gameState ||
    storedRecord.chatHistory ||
    storedRecord.sessionSummary
  ) {
    return storedRecord;
  }

  return null;
}

function normalizeSaveDataForResponse(saveData) {
  const gameState = isPlainObject(saveData?.gameState) ? saveData.gameState : {};
  const chatHistory = Array.isArray(saveData?.chatHistory) ? saveData.chatHistory : [];
  const sessionSummary = stringOrEmpty(saveData?.sessionSummary ?? gameState.sessionSummary);
  const updatedAt = isValidDateString(saveData?.updatedAt) ? saveData.updatedAt : new Date().toISOString();
  return {
    version: Number.parseInt(saveData?.version, 10) || 1,
    saveCode: normalizeSaveCode(saveData?.saveCode) || "local-main",
    updatedAt,
    gameState: {
      ...gameState,
      sessionSummary
    },
    chatHistory,
    sessionSummary,
    turnCount: normalizeTurnCount(saveData?.turnCount, chatHistory)
  };
}

function normalizeTurnCount(value, chatHistory = []) {
  const number = Number.parseInt(value, 10);
  if (Number.isFinite(number) && number >= 0) return number;
  return (Array.isArray(chatHistory) ? chatHistory : [])
    .filter((entry) => {
      const role = String(entry?.role || "").trim().toLowerCase();
      return role === "player" || role === "user";
    })
    .length;
}

function normalizeSaveCode(value) {
  return String(value || "").trim();
}

function isValidSaveCode(saveCode) {
  return SAVE_CODE_PATTERN.test(saveCode);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOrEmpty(value) {
  return value === undefined || value === null ? "" : String(value);
}

function isValidDateString(value) {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function stripSensitiveSaveKeys(value) {
  if (Array.isArray(value)) return value.map(stripSensitiveSaveKeys);
  if (!isPlainObject(value)) return value;

  const cleaned = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveSaveKey(key)) continue;
    cleaned[key] = stripSensitiveSaveKeys(child);
  }
  return cleaned;
}

function isSensitiveSaveKey(key) {
  const raw = String(key || "").trim();
  const normalized = raw.replace(/[-_\s]/g, "").toLowerCase();
  return SENSITIVE_SAVE_KEYS.has(raw)
    || SENSITIVE_SAVE_KEYS.has(raw.toLowerCase())
    || normalized === "apikey"
    || normalized === "userapikey"
    || normalized === "geminiapikey"
    || normalized === "googleapikey"
    || (normalized.includes("apikey") && (normalized.includes("user") || normalized.includes("gemini") || normalized.includes("google")));
}

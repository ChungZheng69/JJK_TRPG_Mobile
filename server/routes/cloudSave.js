import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const cloudSaveRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const savesDir = path.join(projectRoot, "saves");
const SAVE_CODE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const SENSITIVE_SAVE_KEYS = new Set(["DIFY_API_KEY", "dify_api_key"]);

cloudSaveRouter.post("/", async (req, res) => {
  const body = req.body || {};
  const saveCode = normalizeSaveCode(body.saveCode);

  if (!isValidSaveCode(saveCode)) {
    return res.status(400).json({
      error: "Invalid save code",
      suggestion: "Use 1-40 letters, numbers, underscore, or hyphen."
    });
  }

  try {
    await ensureSavesDir();

    // Render filesystem may not persist after redeploy; Supabase recommended later.
    const payload = {
      saveCode,
      conversation_id: stringOrEmpty(body.conversation_id),
      user_id: stringOrEmpty(body.user_id),
      gameState: isPlainObject(body.gameState) ? stripSensitiveSaveKeys(body.gameState) : {},
      chatHistory: Array.isArray(body.chatHistory) ? stripSensitiveSaveKeys(body.chatHistory) : [],
      updatedAt: new Date().toISOString()
    };

    await fs.writeFile(getSaveFilePath(saveCode), JSON.stringify(payload, null, 2), "utf8");
    return res.json({
      ok: true,
      saveCode,
      updatedAt: payload.updatedAt
    });
  } catch (error) {
    console.error("Cloud save failed", {
      saveCode,
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(500).json({
      error: "Cloud save failed",
      suggestion: "Please retry. If this is hosted, check whether the filesystem is writable."
    });
  }
});

cloudSaveRouter.get("/:saveCode", async (req, res) => {
  const saveCode = normalizeSaveCode(req.params.saveCode);

  if (!isValidSaveCode(saveCode)) {
    return res.status(400).json({
      error: "Invalid save code",
      suggestion: "Use 1-40 letters, numbers, underscore, or hyphen."
    });
  }

  try {
    const raw = await fs.readFile(getSaveFilePath(saveCode), "utf8");
    return res.json(JSON.parse(raw));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return res.status(404).json({
        error: "Cloud save not found",
        saveCode,
        suggestion: "Check the save code or upload a save first."
      });
    }

    console.error("Cloud save load failed", {
      saveCode,
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(500).json({
      error: "Cloud save load failed",
      suggestion: "Please retry. If the problem persists, check server logs."
    });
  }
});

async function ensureSavesDir() {
  await fs.mkdir(savesDir, { recursive: true });
}

function getSaveFilePath(saveCode) {
  return path.join(savesDir, `${saveCode}.json`);
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

function stripSensitiveSaveKeys(value) {
  if (Array.isArray(value)) return value.map(stripSensitiveSaveKeys);
  if (!isPlainObject(value)) return value;

  const cleaned = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_SAVE_KEYS.has(key)) continue;
    cleaned[key] = stripSensitiveSaveKeys(child);
  }
  return cleaned;
}

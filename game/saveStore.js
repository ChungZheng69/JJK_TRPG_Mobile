import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const savesDir = path.join(projectRoot, "saves");
const SAVE_CODE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

export function isValidSaveCode(saveCode) {
  return SAVE_CODE_PATTERN.test(String(saveCode || "").trim());
}

export async function loadSave(saveCode) {
  const code = normalizeSaveCode(saveCode);
  if (!isValidSaveCode(code)) return null;
  try {
    const raw = await fs.readFile(getSaveFilePath(code), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function saveTurn({ saveCode, gameState, chatHistory = [] }) {
  const code = normalizeSaveCode(saveCode);
  if (!isValidSaveCode(code)) return null;
  await fs.mkdir(savesDir, { recursive: true });
  const payload = {
    saveCode: code,
    gameState,
    chatHistory,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(getSaveFilePath(code), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function getSaveFilePath(saveCode) {
  return path.join(savesDir, `${saveCode}.json`);
}

function normalizeSaveCode(value) {
  return String(value || "").trim();
}

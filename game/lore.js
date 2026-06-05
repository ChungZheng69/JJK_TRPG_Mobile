import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const loreDir = path.join(projectRoot, "lore");
const LORE_FILES = {
  canon: "canon_timeline.md",
  counterplay: "counterplay.md",
  families: "big_three_families.md",
  rainDebt: "rain_debt_technique.md",
  characterProfile: "character_profile.md"
};
const MIN_CONTEXT_CHARS = 1500;
const MAX_CONTEXT_CHARS = 2500;
const TARGET_CONTEXT_CHARS = 2200;

let loreCache = null;

export async function retrieveLoreContext({ userMessage = "", gameState = {}, chatHistory = [] } = {}) {
  const lore = await loadLoreFiles();
  const selectedFiles = selectLoreFiles({ userMessage, gameState, chatHistory });
  const context = buildLoreContext(selectedFiles, lore);

  console.log("RETRIEVED_LORE_FILES", selectedFiles);
  console.log("RETRIEVED_LORE_CONTEXT_LENGTH", context.length);
  return context;
}

async function loadLoreFiles() {
  if (loreCache) return loreCache;
  const entries = await Promise.all(
    Object.values(LORE_FILES).map(async (fileName) => {
      try {
        const text = await fs.readFile(path.join(loreDir, fileName), "utf8");
        return [fileName, normalizeMarkdown(text)];
      } catch (error) {
        console.warn("LORE_FILE_LOAD_FAILED", {
          fileName,
          message: error?.message || String(error)
        });
        return [fileName, ""];
      }
    })
  );
  loreCache = Object.fromEntries(entries);
  return loreCache;
}

function selectLoreFiles({ userMessage, gameState, chatHistory }) {
  const messageText = String(userMessage || "");
  const objectiveText = String(gameState?.objective || gameState?.current_objective || gameState?.current_Objective || "");
  const messageAndObjective = `${messageText}\n${objectiveText}`;
  const characterText = String(gameState?.character_name || gameState?.characterName || "");
  const fullCharacterText = [
    characterText,
    gameState?.playerName,
    gameState?.player_name,
    gameState?.character?.name
  ].map((value) => String(value || "")).join("\n");
  const chatText = compactChatText(chatHistory);
  const characterSearchText = `${messageAndObjective}\n${chatText}`;
  const flags = gameState?.flags && typeof gameState.flags === "object" ? gameState.flags : {};
  const selected = [];

  if (/\u7985\u9662|\u5fa1\u4e09\u5bb6|\u5bb6\u65cf|\u9ad8\u5c42/.test(messageAndObjective)) {
    selected.push(LORE_FILES.families);
  }

  if (/\u4e94\u6761|\u4e03\u6d77|\u864e\u6756|\u4f0f\u9ed1|\u9ad8\u4e13|\u539f\u4f5c\u89d2\u8272/.test(messageText)) {
    selected.push(LORE_FILES.canon);
  }

  if (
    hasAnyFlag(flags, ["technique_revealed", "weakness_revealed", "enemy_observed_style", "counterplay_risk_up"])
    || /\u672f\u5f0f|\u5f31\u70b9|\u9488\u5bf9|\u53cd\u5236|\u89c2\u5bdf\u6218\u672f/.test(messageAndObjective)
  ) {
    selected.push(LORE_FILES.counterplay);
  }

  if (/\u96e8\u503a|\u5492\u96e8|\u96e8\u503a\u65a9|\u8ba8\u96e8\u65a9|\u6536\u96e8|\u96e8\u52bf/.test(messageAndObjective)) {
    selected.push(LORE_FILES.rainDebt);
  }

  if (shouldIncludeCharacterProfile({ characterSearchText, fullCharacterText, gameState })) {
    selected.push(LORE_FILES.characterProfile);
  }

  return [...new Set(selected)];
}

function shouldIncludeCharacterProfile({ characterSearchText, fullCharacterText, gameState }) {
  const currentCharacterName = String(gameState?.character?.name || gameState?.characterName || gameState?.character_name || "").trim();
  if (!/\u96e8\u5bab\u6714/.test(currentCharacterName)) return false;
  if (/\u96e8\u5bab\u6714/.test(fullCharacterText)) return true;
  return /\u96e8\u5bab\u6714|\u96e8\u5bab|\u96e8\u5bab\u6faa|\u59d0\u59d0|\u81ea\u7531\u672f\u5e08|\u7985\u9662\u4efb\u52a1|\u4efb\u52a1\u8bb0\u5f55|\u771f\u76f8|\u590d\u4ec7|\u52a0\u5165\u9ad8\u4e13/.test(characterSearchText);
}

function buildLoreContext(selectedFiles, lore) {
  if (!selectedFiles.length) return "";
  const chunks = [];
  let remaining = TARGET_CONTEXT_CHARS;

  selectedFiles.forEach((fileName, index) => {
    const text = lore[fileName] || "";
    if (!text) return;
    const remainingFiles = selectedFiles.length - index - 1;
    const reservedForLaterFiles = remainingFiles * 350;
    const budget = Math.max(350, remaining - reservedForLaterFiles);
    const excerpt = trimToLength(text, budget);
    chunks.push(`## ${fileName}\n${excerpt}`);
    remaining = TARGET_CONTEXT_CHARS - chunks.join("\n\n").length;
  });

  const context = chunks.join("\n\n");
  if (context.length <= MAX_CONTEXT_CHARS) return context;
  return trimToLength(context, MAX_CONTEXT_CHARS);
}

function trimToLength(text, limit) {
  const value = String(text || "").trim();
  if (value.length <= limit) return value;
  const sliced = value.slice(0, limit);
  const lastBreak = Math.max(sliced.lastIndexOf("\n\n"), sliced.lastIndexOf("\n"), sliced.lastIndexOf("。"));
  if (lastBreak >= MIN_CONTEXT_CHARS / 4) return `${sliced.slice(0, lastBreak).trim()}\n...`;
  return `${sliced.trim()}\n...`;
}

function normalizeMarkdown(text) {
  return String(text || "").replace(/\r\n/g, "\n").trim();
}

function compactChatText(chatHistory) {
  return (Array.isArray(chatHistory) ? chatHistory : [])
    .slice(-4)
    .map((entry) => entry?.text || "")
    .join("\n");
}

function hasAnyFlag(flags, names) {
  return names.some((name) => Boolean(flags[name]));
}

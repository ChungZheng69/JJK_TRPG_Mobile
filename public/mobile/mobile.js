import { sendChatMessage } from "../shared/api.js";
import { parseDifyAnswer } from "../shared/parser.js";
import { getGameState, mergeParsedState, setGameState } from "../shared/gameState.js";
import {
  clearChatHistory,
  clearConversationId,
  ensureUserId,
  getConversationId,
  getDebugMode,
  importJsonStateOnly,
  restoreSessionFromLocalStorage,
  saveChatHistory,
  saveGameState,
  setConversationId,
  setDebugMode,
  setUserId
} from "../shared/storage.js";
import { escapeHtml } from "../shared/sanitize.js";
import { QUICK_ACTIONS, insertQuickAction, renderAiMessageSections } from "../shared/renderUtils.js";

const els = {
  hp: document.querySelector("#mobileHp"),
  mp: document.querySelector("#mobileMp"),
  objective: document.querySelector("#mobileObjective"),
  messages: document.querySelector("#mobileMessages"),
  form: document.querySelector("#mobileChatForm"),
  input: document.querySelector("#mobileInput"),
  send: document.querySelector("#mobileSendButton"),
  quickActions: document.querySelector("#mobileQuickActions"),
  error: document.querySelector("#mobileError"),
  debugToggle: document.querySelector("#mobileDebugToggle"),
  panelHp: document.querySelector("#panelHp"),
  panelMp: document.querySelector("#panelMp"),
  panelFingers: document.querySelector("#panelFingers"),
  panelGojo: document.querySelector("#panelGojo"),
  panelNanami: document.querySelector("#panelNanami"),
  panelInventory: document.querySelector("#panelInventory"),
  panelAttributes: document.querySelector("#panelAttributes"),
  panelFlags: document.querySelector("#mobileFlags"),
  diceLast: document.querySelector("#mobileDiceLast"),
  diceAttribute: document.querySelector("#mobileDiceAttribute"),
  diceAttributeValue: document.querySelector("#mobileDiceAttributeValue"),
  diceDifficulty: document.querySelector("#mobileDiceDifficulty"),
  diceTarget: document.querySelector("#mobileDiceTarget"),
  diceRoll: document.querySelector("#mobileDiceRoll"),
  diceSuccess: document.querySelector("#mobileDiceSuccess"),
  diceCritical: document.querySelector("#mobileDiceCritical"),
  sessionSummary: document.querySelector("#mobileSessionSummary"),
  changeLog: document.querySelector("#mobileChangeLog"),
  parserWarnings: document.querySelector("#mobileParserWarnings"),
  parserSourceMap: document.querySelector("#mobileParserSourceMap"),
  importStateOnlyButton: document.querySelector("#mobileImportStateOnlyButton"),
  importStateOnlyInput: document.querySelector("#mobileImportStateOnlyInput"),
  clearChatHistoryButton: document.querySelector("#mobileClearChatHistoryButton")
};

let debugMode = getDebugMode();
let chatHistory = [];

function valueOrUnknown(value) {
  return value === undefined || value === null || value === "" ? "Unknown" : String(value);
}

function setDebugModeClass() {
  document.body.classList.toggle("mobile-debug-on", debugMode);
  document.body.classList.toggle("mobile-debug-off", !debugMode);
  if (els.debugToggle) els.debugToggle.textContent = debugMode ? "Debug ON" : "Debug OFF";
}

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = !message;
}

function renderPanels() {
  const state = getGameState();
  els.hp.textContent = valueOrUnknown(state.hp);
  els.mp.textContent = valueOrUnknown(state.mp);
  els.objective.textContent = valueOrUnknown(state.objective);
  els.panelHp.textContent = valueOrUnknown(state.hp);
  els.panelMp.textContent = valueOrUnknown(state.mp);
  els.panelFingers.textContent = valueOrUnknown(state.sukunaFingers);
  els.panelGojo.textContent = valueOrUnknown(state.gojoAffinity);
  els.panelNanami.textContent = valueOrUnknown(state.nanamiAffinity);
  renderTags(els.panelInventory, formatInventory(state.inventory));
  renderTags(els.panelAttributes, formatObject(state.attributes));
  renderTags(els.panelFlags, formatFlags(state.flags));
  renderDice(state.dice);
  els.sessionSummary.textContent = valueOrUnknown(state.sessionSummary);
  renderLog(els.changeLog, state.changeLog, "Unknown");
  renderLog(els.parserWarnings, state.warnings, "None");
  renderSourceMap(els.parserSourceMap, state.sourceMap);
}

function renderDice(dice) {
  els.diceLast.textContent = dice ? (dice.dice || "1d100") : "Unknown";
  els.diceAttribute.textContent = valueOrUnknown(dice?.attribute);
  els.diceAttributeValue.textContent = valueOrUnknown(dice?.base_attribute ?? dice?.attribute_score ?? dice?.attribute_value);
  els.diceDifficulty.textContent = valueOrUnknown(dice?.difficulty ?? dice?.difficulty_modifier);
  els.diceTarget.textContent = valueOrUnknown(dice?.final_target ?? dice?.target);
  els.diceRoll.textContent = valueOrUnknown(dice?.roll ?? dice?.dice_roll);
  const success = dice?.success;
  els.diceSuccess.textContent = success === undefined || success === null ? "Unknown" : (success ? "成功" : "失败");
  els.diceCritical.textContent = dice?.critical_success ? "大成功" : dice?.critical_failure ? "大失败" : success !== undefined ? "否" : "Unknown";
}

function renderTags(container, values) {
  container.innerHTML = "";
  const items = values.length ? values : ["Unknown"];
  for (const item of items) {
    const tag = document.createElement("span");
    tag.textContent = item;
    container.append(tag);
  }
}

function renderLog(container, entries, emptyText) {
  container.textContent = "";
  if (!entries || !entries.length) {
    container.textContent = emptyText;
    return;
  }
  container.textContent = entries.map((entry) => typeof entry === "string"
    ? entry
    : `${entry.field || "field"}: ${entry.old ?? ""} -> ${entry.new ?? ""}`
  ).join("\n");
}

function renderSourceMap(container, sourceMap) {
  const entries = Object.entries(sourceMap || {});
  container.textContent = entries.length
    ? entries.map(([field, source]) => `${field}: ${source}`).join("\n")
    : "Unknown";
}

function formatObject(value) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).map(([key, item]) => `${key}: ${item}`);
}

function formatInventory(inventory) {
  if (!inventory) return [];
  if (Array.isArray(inventory.items)) {
    return inventory.items.map((item) => `${item.name || "item"} x${item.quantity || 1}`);
  }
  return formatObject(inventory);
}

function formatFlags(flags) {
  if (!flags || typeof flags !== "object") return [];
  return Object.entries(flags).filter(([, value]) => Boolean(value)).map(([key]) => key);
}

function addMobileMessage(role, text, rawJsonBlocks = []) {
  const article = document.createElement("article");
  article.className = `mobile-message ${role === "player" ? "player" : "gm"}`;
  const meta = role === "player" ? "PLAYER COMMAND" : "AI GM";
  const body = role === "player"
    ? `<div class="player-command-text">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`
    : `${renderAiMessageSections(text)}${renderDebugBlocks(rawJsonBlocks)}`;
  article.innerHTML = `<div class="message-meta">${meta}</div><div class="message-content">${body}</div>`;
  els.messages.append(article);
  window.requestAnimationFrame(() => article.scrollIntoView({ block: "end" }));
}

function renderDebugBlocks(rawJsonBlocks) {
  if (!rawJsonBlocks?.length) return "";
  return `<details class="debug-json-group"><summary>Debug JSON</summary>${rawJsonBlocks.map((block, index) => {
    const parsed = parseDebugBlock(block);
    const body = parsed.ok ? JSON.stringify(parsed.value, null, 2) : String(block || "");
    return `<details><summary>Debug JSON ${index + 1}</summary><pre>${escapeHtml(body)}</pre></details>`;
  }).join("")}</details>`;
}

function parseDebugBlock(block) {
  try {
    return { ok: true, value: typeof block === "string" ? JSON.parse(block) : block };
  } catch (_error) {
    return { ok: false, value: block };
  }
}

function storeMessage(role, text, rawJsonBlocks = []) {
  addMobileMessage(role, text, rawJsonBlocks);
  chatHistory.push({ role, text, rawJsonBlocks, timestamp: new Date().toISOString() });
  saveChatHistory(chatHistory);
}

function restore() {
  const saved = restoreSessionFromLocalStorage();
  chatHistory = Array.isArray(saved.chatHistory) ? saved.chatHistory : [];
  if (saved.gameState) setGameState(saved.gameState);
  els.messages.innerHTML = "";
  if (chatHistory.length) {
    for (const entry of chatHistory) addMobileMessage(entry.role, entry.text, entry.rawJsonBlocks || []);
  }
  renderPanels();
}

async function sendMessage(text) {
  const query = text.trim();
  if (!query) return;
  showError("");
  storeMessage("player", query);
  els.input.value = "";
  els.send.disabled = true;
  try {
    const payload = await sendChatMessage({
      message: query,
      conversationId: getConversationId(),
      user: ensureUserId()
    });
    setConversationId(payload.conversation_id);
    const answer = payload.answer || payload.data?.answer || payload.message || "";
    console.log("RAW_DIFY_RESPONSE", payload);
    console.log("RAW_ANSWER_TEXT", answer);
    const parsed = parseDifyAnswer(answer, payload);
    console.log("JSON_BLOCKS_FOUND", parsed.rawJsonBlocks);
    console.log("CHOSEN_FRONTEND_STATE_BLOCK", parsed.chosenFrontendStateBlock);
    console.log("CHOSEN_FRONTEND_STATE_BLOCK.game_state", parsed.chosenFrontendStateBlock?.game_state);
    console.log("CHOSEN_FRONTEND_STATE_BLOCK_INDEX", parsed.chosenFrontendStateBlockIndex);
    console.log("game_state.mp", parsed.state?.mp);
    console.log("game_state.inventory", parsed.state?.inventory);
    console.log("game_state.flags", parsed.state?.flags);
    storeMessage("gm", parsed.displayText || answer, parsed.rawJsonBlocks);
    console.log("GAME_STATE_BEFORE_MERGE", getGameState());
    const gameState = mergeParsedState(parsed.state);
    saveGameState(gameState);
    console.log("MERGED_GAME_STATE", gameState);
    console.log("GAME_STATE_AFTER_MERGE", gameState);
    renderPanels();
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    els.send.disabled = false;
  }
}

async function handleImportStateOnly(file) {
  if (!file) return;
  try {
    const save = await importJsonStateOnly(file);
    if ("conversation_id" in save) {
      if (save.conversation_id) setConversationId(save.conversation_id);
      else clearConversationId();
    }
    if (save.user_id) setUserId(save.user_id);

    chatHistory = [];
    setGameState(save.gameState);
    saveChatHistory(chatHistory);
    saveGameState(getGameState());
    els.messages.innerHTML = "";
    storeMessage("gm", "已导入存档状态，旧聊天记录已清除。");
    renderPanels();
    showError("");
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    els.importStateOnlyInput.value = "";
  }
}

function clearLocalChatHistoryOnly() {
  chatHistory = [];
  clearChatHistory();
  els.messages.innerHTML = "";
  addMobileMessage("gm", "旧聊天记录已清除，当前状态保留。");
  renderPanels();
  showError("");
}

function renderQuickActions() {
  els.quickActions.innerHTML = QUICK_ACTIONS.map((action, index) => `
    <button type="button" data-action-index="${index}">
      <span class="quick-action-category">${escapeHtml(action.category)}</span>
      <span class="quick-action-label">${escapeHtml(action.label)}</span>
    </button>
  `).join("");
  els.quickActions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action-index]");
    if (!button) return;
    const action = QUICK_ACTIONS[Number(button.dataset.actionIndex)];
    if (action) insertQuickAction(els.input, action.text);
  });
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(els.input.value);
});

els.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    els.form.requestSubmit();
  }
});

els.debugToggle.addEventListener("click", () => {
  debugMode = !debugMode;
  setDebugMode(debugMode);
  setDebugModeClass();
});

els.importStateOnlyButton?.addEventListener("click", () => els.importStateOnlyInput?.click());
els.importStateOnlyInput?.addEventListener("change", (event) => {
  handleImportStateOnly(event.target.files?.[0]);
});
els.clearChatHistoryButton?.addEventListener("click", clearLocalChatHistoryOnly);

ensureUserId();
setDebugModeClass();
renderQuickActions();
restore();

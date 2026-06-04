import { buildDifyPayloadFromGameState, formatApiError, sendChatMessage } from "../shared/api.js";
import { isValidSaveCode, loadCloudSave, normalizeSaveCode, uploadCloudSave } from "../shared/cloudSaveApi.js";
import { parseDifyAnswer } from "../shared/parser.js";
import {
  getGameState,
  mergeParsedState,
  resetGameFromCharacterConfig as resetStateFromCharacterConfig,
  setGameState
} from "../shared/gameState.js";
import {
  clearChatHistory,
  clearConversationId,
  clearSession,
  ensureUserId,
  getConversationId,
  getDebugMode,
  getUserId,
  importJsonStateOnly,
  restoreSessionFromLocalStorage,
  saveChatHistory,
  saveGameState,
  setConversationId,
  setDebugMode,
  setUserId
} from "../shared/storage.js";
import { escapeHtml } from "../shared/sanitize.js";
import { QUICK_ACTIONS, insertQuickAction, renderAiMessageSections, renderDiceConsequenceCard } from "../shared/renderUtils.js";
import { formatLocalStatus, isLocalStatusCommand } from "../js/utils/localStatus.js";
import {
  applyCharacterConfigToDocument,
  CHARACTER_CONFIG,
  DEFAULT_ATTRIBUTE_MAX
} from "../js/config/character_config.js";

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
  resetFromConfigButton: document.querySelector("#mobileResetFromConfigButton"),
  cloudSaveCodeInput: document.querySelector("#mobileCloudSaveCode"),
  uploadCloudSaveButton: document.querySelector("#mobileUploadCloudSaveButton"),
  loadCloudSaveButton: document.querySelector("#mobileLoadCloudSaveButton"),
  cloudSaveStatus: document.querySelector("#mobileCloudSaveStatus"),
  importStateOnlyButton: document.querySelector("#mobileImportStateOnlyButton"),
  importStateOnlyInput: document.querySelector("#mobileImportStateOnlyInput"),
  clearChatHistoryButton: document.querySelector("#mobileClearChatHistoryButton"),
  stateEditorHp: document.querySelector("#mobileStateEditorHp"),
  stateEditorMp: document.querySelector("#mobileStateEditorMp"),
  stateEditorObjective: document.querySelector("#mobileStateEditorObjective"),
  stateEditorAttributes: document.querySelector("#mobileStateEditorAttributes"),
  stateEditorInventory: document.querySelector("#mobileStateEditorInventory"),
  stateEditorFlags: document.querySelector("#mobileStateEditorFlags"),
  stateEditorGojo: document.querySelector("#mobileStateEditorGojo"),
  stateEditorNanami: document.querySelector("#mobileStateEditorNanami"),
  stateEditorFingers: document.querySelector("#mobileStateEditorFingers"),
  applyEditedStateButton: document.querySelector("#mobileApplyEditedStateButton"),
  stateEditorStatus: document.querySelector("#mobileStateEditorStatus")
};

let debugMode = getDebugMode();
let chatHistory = [];
const ATTRIBUTE_ORDER = ["physique", "technique", "cursed_energy", "mind"];

function valueOrUnknown(value) {
  return value === undefined || value === null || value === "" ? "Unknown" : String(value);
}

function isKnown(value) {
  return value !== undefined && value !== null && value !== "" && value !== "Unknown";
}

function formatResource(value, max) {
  const current = valueOrUnknown(value);
  return isKnown(max) ? `${current} / ${max}` : current;
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

function setCloudSaveStatus(message) {
  if (els.cloudSaveStatus) els.cloudSaveStatus.textContent = message;
}

function renderPanels() {
  const state = getGameState();
  const gojoAffinity = readGojoAffinity(state);
  const nanamiAffinity = readNanamiAffinity(state);
  console.log("AFFINITY_RENDER_VALUES", {
    gojo_affinity: gojoAffinity,
    nam_affinity: nanamiAffinity,
    sourceState: {
      gojo_affinity: state.gojo_affinity,
      Gojo_Affinity: state.Gojo_Affinity,
      gojoAffinity: state.gojoAffinity,
      nam_affinity: state.nam_affinity,
      nanami_affinity: state.nanami_affinity,
      Nanami_Affinity: state.Nanami_Affinity,
      nanamiAffinity: state.nanamiAffinity
    }
  });
  els.hp.textContent = formatResource(state.hp, state.max_hp ?? state.maxHp);
  els.mp.textContent = formatResource(state.mp, state.max_mp ?? state.maxMp);
  els.objective.textContent = valueOrUnknown(state.objective);
  els.panelHp.textContent = formatResource(state.hp, state.max_hp ?? state.maxHp);
  els.panelMp.textContent = formatResource(state.mp, state.max_mp ?? state.maxMp);
  els.panelFingers.textContent = valueOrUnknown(state.sukuna_fingers ?? state.sukunaFingers);
  els.panelGojo.textContent = valueOrUnknown(gojoAffinity);
  els.panelNanami.textContent = valueOrUnknown(nanamiAffinity);
  renderTags(els.panelInventory, formatInventory(state.inventory));
  renderTags(els.panelAttributes, formatAttributes(state));
  renderTags(els.panelFlags, formatFlags(state.flags));
  renderDice(state.dice);
  els.sessionSummary.textContent = valueOrUnknown(state.sessionSummary);
  renderLog(els.changeLog, state.changeLog, "Unknown");
  renderLog(els.parserWarnings, state.warnings, "None");
  renderSourceMap(els.parserSourceMap, state.sourceMap);
  syncStateEditorFromGameState();
}

function readGojoAffinity(state) {
  return state.gojo_affinity ?? state.Gojo_Affinity ?? state.gojoAffinity;
}

function readNanamiAffinity(state) {
  return state.nam_affinity ?? state.nanami_affinity ?? state.Nanami_Affinity ?? state.nanamiAffinity;
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

function formatAttributes(gameState) {
  const attrMax = gameState.attribute_max ?? gameState.attributeMax ?? DEFAULT_ATTRIBUTE_MAX;
  const attributes = gameState.attributes || {};
  if (!attributes || typeof attributes !== "object") return [];
  const configAttrs = CHARACTER_CONFIG.starting_attributes || {};
  return ATTRIBUTE_ORDER.map((key) => {
    const value = attributes[key] ?? configAttrs[key] ?? 0;
    return isKnown(attrMax) ? `${key}: ${value} / ${attrMax}` : `${key}: ${value}`;
  });
}

function formatInventory(inventory) {
  if (!inventory) return ["无"];
  if (Array.isArray(inventory)) return inventory.length ? inventory.map(String) : ["无"];
  if (Array.isArray(inventory.items)) {
    return inventory.items.length
      ? inventory.items.map((item) => `${item.name || "item"} x${item.quantity || 1}`)
      : ["无"];
  }
  return formatObject(inventory);
}

function formatFlags(flags) {
  if (!flags || typeof flags !== "object") return [];
  return Object.entries(flags).filter(([, value]) => Boolean(value)).map(([key]) => key);
}

function addMobileMessage(role, text, rawJsonBlocks = [], dice = null) {
  const article = document.createElement("article");
  article.className = `mobile-message ${role === "player" ? "player" : "gm"}`;
  const meta = role === "player" ? "PLAYER COMMAND" : "AI GM";
  const body = role === "player"
    ? `<div class="player-command-text">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`
    : `${renderAiMessageSections(text)}${renderDiceConsequenceCard(dice)}${renderDebugBlocks(rawJsonBlocks)}`;
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

function storeMessage(role, text, rawJsonBlocks = [], dice = null) {
  addMobileMessage(role, text, rawJsonBlocks, dice);
  chatHistory.push({ role, text, rawJsonBlocks, dice, timestamp: new Date().toISOString() });
  saveChatHistory(chatHistory);
}

function restore() {
  const saved = restoreSessionFromLocalStorage();
  chatHistory = Array.isArray(saved.chatHistory) ? saved.chatHistory : [];
  if (saved.gameState) setGameState(saved.gameState);
  els.messages.innerHTML = "";
  if (chatHistory.length) {
    for (const entry of chatHistory) addMobileMessage(entry.role, entry.text, entry.rawJsonBlocks || [], entry.dice || null);
  }
  renderPanels();
}

async function sendMessage(text) {
  const query = text.trim();
  if (!query) return;
  showError("");
  storeMessage("player", query);
  els.input.value = "";

  if (isLocalStatusCommand(query)) {
    storeMessage("gm", formatLocalStatus(getGameState()));
    renderPanels();
    return;
  }

  els.send.disabled = true;
  try {
    const requestPayload = buildDifyPayloadFromGameState(globalThis.TRPG_STATE.gameState, query);
    console.log("NORMAL_SEND_GAME_STATE", globalThis.TRPG_STATE.gameState);
    console.log("NORMAL_SEND_DIFY_PAYLOAD", requestPayload);
    const payload = await sendChatMessage(requestPayload);
    setConversationId(payload.conversation_id);
    const answer = payload.answer || payload.data?.answer || payload.message || "";
    console.log("RAW_DIFY_RESPONSE", payload);
    console.log("RAW_ANSWER_TEXT", answer);
    const parsed = parseDifyAnswer(answer, payload);
    console.log("VISIBLE_TEXT_AFTER_PARSE", parsed.displayText);
    console.log("EXTRACTED_JSON_BLOCKS", parsed.rawJsonBlocks);
    console.log("SELECTED_FRONTEND_STATE_JSON", parsed.selectedFrontendStateJson);
    console.log("SELECTED_DICE_OBJECT", parsed.selectedDiceObject);
    console.log("JSON_BLOCKS_FOUND", parsed.rawJsonBlocks);
    console.log("CHOSEN_FRONTEND_STATE_BLOCK", parsed.chosenFrontendStateBlock);
    console.log("CHOSEN_FRONTEND_STATE_BLOCK.game_state", parsed.chosenFrontendStateBlock?.game_state);
    console.log("CHOSEN_FRONTEND_STATE_BLOCK_INDEX", parsed.chosenFrontendStateBlockIndex);
    console.log("game_state.mp", parsed.state?.mp);
    console.log("game_state.inventory", parsed.state?.inventory);
    console.log("game_state.flags", parsed.state?.flags);
    storeMessage("gm", parsed.displayText || answer, parsed.rawJsonBlocks, parsed.selectedDiceObject);
    console.log("GAME_STATE_BEFORE_MERGE", getGameState());
    const updatedState = mergeParsedState(parsed.state);
    saveGameState(updatedState);
    console.log("MERGED_GAME_STATE", updatedState);
    console.log("GAME_STATE_AFTER_MERGE", updatedState);
    renderPanels();
  } catch (error) {
    showError(formatApiError(error));
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

function getCloudSaveCode() {
  const saveCode = normalizeSaveCode(els.cloudSaveCodeInput?.value);
  if (!isValidSaveCode(saveCode)) {
    throw new Error("Save Code must be 1-40 letters, numbers, underscore, or hyphen.");
  }
  return saveCode;
}

async function uploadCurrentCloudSave() {
  try {
    const saveCode = getCloudSaveCode();
    setCloudSaveStatus("Uploading cloud save...");
    showError("");
    const payload = await uploadCloudSave({
      saveCode,
      conversation_id: getConversationId(),
      user_id: getUserId() || ensureUserId(),
      gameState: getGameState(),
      chatHistory
    });
    setCloudSaveStatus(`Uploaded cloud save. Last updated: ${formatUpdatedAt(payload.updatedAt)}.`);
  } catch (error) {
    const message = formatCloudSaveError(error);
    setCloudSaveStatus(message);
    showError(message);
  }
}

async function loadCloudSaveIntoLocal() {
  try {
    const saveCode = getCloudSaveCode();
    const confirmed = window.confirm("Load this cloud save and overwrite local progress?");
    if (!confirmed) return;

    setCloudSaveStatus("Loading cloud save...");
    showError("");
    const save = await loadCloudSave(saveCode);
    applyLoadedSave(save);
    setCloudSaveStatus(`Loaded cloud save. Last updated: ${formatUpdatedAt(save.updatedAt)}.`);
  } catch (error) {
    const message = formatCloudSaveError(error);
    setCloudSaveStatus(message);
    showError(message);
  }
}

function applyLoadedSave(save) {
  if ("conversation_id" in save) {
    if (save.conversation_id) setConversationId(save.conversation_id);
    else clearConversationId();
  }
  if (save.user_id) setUserId(save.user_id);

  chatHistory = Array.isArray(save.chatHistory) ? save.chatHistory : [];
  setGameState(save.gameState || {});
  saveChatHistory(chatHistory);
  saveGameState(getGameState());
  els.messages.innerHTML = "";
  for (const entry of chatHistory) {
    addMobileMessage(entry.role || "gm", entry.text || "", entry.rawJsonBlocks || [], entry.dice || null);
  }
  renderPanels();
}

function formatCloudSaveError(error) {
  const status = error?.status ? `Status ${error.status}: ` : "";
  const payload = error?.payload || {};
  const suggestion = payload.suggestion ? ` ${payload.suggestion}` : "";
  return `${status}${payload.error || error?.message || "Cloud save request failed."}${suggestion}`;
}

function formatUpdatedAt(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function resetGameFromCharacterConfig({ confirmReset = false } = {}) {
  if (confirmReset) {
    const confirmed = window.confirm("Reset local chat, conversation_id, and game state from character_config.js?");
    if (!confirmed) return;
  }

  clearSession();
  chatHistory = [];
  const resetState = resetStateFromCharacterConfig();
  saveChatHistory(chatHistory);
  saveGameState(resetState);
  els.messages.innerHTML = "";
  addMobileMessage("gm", "New session initialized from character_config.js.");
  renderPanels();
  showError("");
  console.log("RESET_FROM_CHARACTER_CONFIG", resetState);
  console.log("NORMALIZED_GAME_STATE", {
    attributes: resetState.attributes,
    inventory: resetState.inventory,
    gameState: resetState
  });
}

function syncStateEditorFromGameState() {
  if (!els.stateEditorHp) return;
  const state = getGameState();
  els.stateEditorHp.value = valueForEditor(state.hp);
  els.stateEditorMp.value = valueForEditor(state.mp);
  els.stateEditorObjective.value = state.objective || "";
  els.stateEditorAttributes.value = stringifyEditorJson(state.attributes || {});
  els.stateEditorInventory.value = stringifyEditorJson(state.inventory || { items: [] });
  els.stateEditorFlags.value = stringifyEditorJson(state.flags || {});
  els.stateEditorGojo.value = valueForEditor(state.gojo_affinity ?? state.gojoAffinity);
  els.stateEditorNanami.value = valueForEditor(state.nam_affinity ?? state.nanamiAffinity);
  els.stateEditorFingers.value = valueForEditor(state.sukuna_fingers ?? state.sukunaFingers);
}

function applyEditedState() {
  try {
    const current = getGameState();
    const nextState = setGameState({
      ...current,
      hp: parseEditorInteger(els.stateEditorHp.value, current.hp),
      mp: parseEditorInteger(els.stateEditorMp.value, current.mp),
      objective: els.stateEditorObjective.value,
      attributes: parseEditorJson(els.stateEditorAttributes.value, "Attributes", current.attributes || {}),
      inventory: parseEditorJson(els.stateEditorInventory.value, "Inventory", current.inventory || { items: [] }),
      flags: parseEditorJson(els.stateEditorFlags.value, "Flags", current.flags || {}),
      gojo_affinity: parseEditorInteger(els.stateEditorGojo.value, current.gojo_affinity ?? current.gojoAffinity),
      nam_affinity: parseEditorInteger(els.stateEditorNanami.value, current.nam_affinity ?? current.nanamiAffinity),
      sukuna_fingers: parseEditorInteger(els.stateEditorFingers.value, current.sukuna_fingers ?? current.sukunaFingers)
    });
    saveGameState(nextState);
    renderPanels();
    if (els.stateEditorStatus) {
      els.stateEditorStatus.textContent = "Edited state applied locally and will sync on the next Dify request.";
    }
    console.log("APPLY_EDITED_STATE", nextState);
  } catch (error) {
    if (els.stateEditorStatus) {
      els.stateEditorStatus.textContent = error instanceof Error ? error.message : String(error);
    }
  }
}

function parseEditorJson(value, label, fallback = {}) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`${label} JSON is invalid: ${error.message}`);
  }
}

function parseEditorInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isNaN(number) ? fallback : number;
}

function stringifyEditorJson(value) {
  return JSON.stringify(value || {}, null, 2);
}

function valueForEditor(value) {
  return value === undefined || value === null || value === "Unknown" ? "" : String(value);
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
els.resetFromConfigButton?.addEventListener("click", () => resetGameFromCharacterConfig({ confirmReset: true }));
els.uploadCloudSaveButton?.addEventListener("click", uploadCurrentCloudSave);
els.loadCloudSaveButton?.addEventListener("click", loadCloudSaveIntoLocal);
els.applyEditedStateButton?.addEventListener("click", applyEditedState);

ensureUserId();
applyCharacterConfigToDocument();
setDebugModeClass();
renderQuickActions();
restore();

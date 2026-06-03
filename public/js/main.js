import { buildDifyPayloadFromGameState, formatApiError, sendChatMessage } from "./api/chatApi.js";
import { isValidSaveCode, loadCloudSave, normalizeSaveCode, uploadCloudSave } from "./api/cloudSaveApi.js";
import { parseDifyAnswer } from "./parsers/responseParser.js";
import {
  getGameState,
  mergeParsedState,
  resetGameFromCharacterConfig as resetStateFromCharacterConfig,
  setGameState
} from "./state/gameState.js";
import { collectDomRefs } from "./utils/dom.js";
import {
  clearChatHistory,
  clearConversationId,
  clearSession,
  ensureUserId,
  exportJsonSave,
  exportTextLog,
  getConversationId,
  getDebugMode,
  getUserId,
  importJsonSave,
  importJsonStateOnly,
  restoreSessionFromLocalStorage,
  saveChatHistory,
  saveGameState,
  setConversationId,
  setDebugMode,
  setUserId
} from "./utils/storage.js";
import { formatLocalStatus, isLocalStatusCommand } from "./utils/localStatus.js";
import { addMessage } from "./render/renderChat.js";
import { renderStatePanel } from "./render/renderStatePanel.js";
import { renderDicePanel } from "./render/renderDicePanel.js";
import { renderDebugPanel } from "./render/renderDebugPanel.js";
import { renderQuickActions } from "./render/renderQuickActions.js";
import { applyCharacterConfigToDocument } from "./config/character_config.js";

const els = collectDomRefs();
let debugMode = getDebugMode();
let chatHistory = [];

function renderConversationBadge() {
  const id = getConversationId();
  els.conversationBadge.textContent = id ? `SESSION ${id.slice(0, 8)}` : "NEW SESSION";
}

function renderDebugModeToggle() {
  if (!els.debugModeToggle) return;
  els.debugModeToggle.textContent = debugMode ? "DEBUG ON" : "DEBUG OFF";
  els.debugModeToggle.setAttribute("aria-pressed", String(debugMode));
  els.debugModeToggle.classList.toggle("active", debugMode);
  document.body.classList.toggle("debug-mode-on", debugMode);
  document.body.classList.toggle("debug-mode-off", !debugMode);
}

function setSessionStatus(message) {
  if (els.sessionSaveStatus) els.sessionSaveStatus.textContent = message;
}

function showError(message) {
  els.errorBox.textContent = message;
  els.errorBox.hidden = !message;
}

function setLoading(isLoading) {
  els.sendButton.disabled = isLoading;
  els.sendButton.textContent = isLoading ? "等待" : "发送";
}

function renderAll() {
  const state = getGameState();
  renderStatePanel(els, state);
  renderDicePanel(els, state.dice);
  renderDebugPanel(els, state);
  syncStateEditorFromGameState();
}

function addAndStoreMessage(role, text, rawJsonBlocks = []) {
  addMessage(els.messages, role, text, rawJsonBlocks, { debugMode });
  chatHistory.push({
    role,
    text,
    rawJsonBlocks,
    timestamp: new Date().toISOString()
  });
  saveChatHistory(chatHistory);
}

function renderStoredChatHistory(history) {
  els.messages.innerHTML = "";
  for (const entry of history) {
    addMessage(
      els.messages,
      entry.role || "gm",
      entry.text || "",
      entry.rawJsonBlocks || [],
      { debugMode }
    );
  }
}

function restoreSessionFromLocalStorageView() {
  const saved = restoreSessionFromLocalStorage();
  chatHistory = Array.isArray(saved.chatHistory) ? saved.chatHistory : [];

  if (saved.gameState) {
    setGameState(saved.gameState);
    saveGameState(getGameState());
  }

  if (chatHistory.length) {
    renderStoredChatHistory(chatHistory);
    setSessionStatus("Loaded saved local session.");
  } else {
    setSessionStatus("Continue / Loaded automatically");
  }

  renderConversationBadge();
  renderAll();
}

async function sendMessage(message) {
  const trimmed = message.trim();
  if (!trimmed) return;

  showError("");
  addAndStoreMessage("player", trimmed);
  els.input.value = "";

  if (isLocalStatusCommand(trimmed)) {
    addAndStoreMessage("gm", formatLocalStatus(getGameState()));
    renderAll();
    setSessionStatus("Rendered local status.");
    return;
  }

  setLoading(true);

  try {
    const requestPayload = buildDifyPayloadFromGameState(globalThis.TRPG_STATE.gameState, trimmed);
    console.log("NORMAL_SEND_GAME_STATE", globalThis.TRPG_STATE.gameState);
    console.log("NORMAL_SEND_DIFY_PAYLOAD", requestPayload);
    const payload = await sendChatMessage(requestPayload);

    setConversationId(payload.conversation_id);
    renderConversationBadge();
    console.log("RAW_DIFY_RESPONSE", payload);
    const answer = payload.answer || payload.data?.answer || payload.message || "";
    console.log("RAW_ANSWER_TEXT", answer);
    console.log("ANSWER_TEXT", answer);
    const parsed = parseDifyAnswer(answer, payload);
    console.log("EXTRACTED_JSON_BLOCKS", parsed.rawJsonBlocks);
    console.log("SELECTED_FRONTEND_STATE_JSON", parsed.selectedFrontendStateJson);
    console.log("SELECTED_DICE_OBJECT", parsed.selectedDiceObject);
    console.log("JSON_BLOCKS_FOUND", parsed.rawJsonBlocks);
    console.log("CHOSEN_FRONTEND_STATE_BLOCK", parsed.chosenFrontendStateBlock);
    console.log("CHOSEN_FRONTEND_STATE_BLOCK.game_state", parsed.chosenFrontendStateBlock?.game_state);
    console.log("CHOSEN_FRONTEND_STATE_BLOCK_INDEX", parsed.chosenFrontendStateBlockIndex);
    console.log("DEBUG_STATE_JSON", parsed.debugStateJson);
    console.log("PARSED_GAME_STATE", parsed.state);
    console.log("game_state.mp", parsed.state?.mp);
    console.log("game_state.inventory", parsed.state?.inventory);
    console.log("game_state.flags", parsed.state?.flags);
    addAndStoreMessage("gm", parsed.displayText || answer, parsed.rawJsonBlocks);
    console.log("GAME_STATE_BEFORE_MERGE", getGameState());
    const updatedState = mergeParsedState(parsed.state);
    saveGameState(updatedState);
    console.log("MERGED_GAME_STATE", updatedState);
    console.log("GAME_STATE_AFTER_MERGE", updatedState);
    setSessionStatus("Saved locally.");
    renderAll();
  } catch (error) {
    showError(formatApiError(error));
  } finally {
    setLoading(false);
  }
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
  addMessage(els.messages, "gm", "New session initialized from character_config.js.", [], { debugMode });
  renderConversationBadge();
  setSessionStatus("Reset from character config.");
  renderAll();
  syncStateEditorFromGameState();
  console.log("RESET_FROM_CHARACTER_CONFIG", resetState);
  console.log("NORMALIZED_GAME_STATE", {
    attributes: resetState.attributes,
    inventory: resetState.inventory,
    gameState: resetState
  });
}

function resetSession() {
  resetGameFromCharacterConfig({ confirmReset: true });
}

function exportCurrentTextLog() {
  exportTextLog(chatHistory, getGameState());
}

function exportCurrentJsonSave() {
  exportJsonSave({
    conversationId: getConversationId(),
    userId: ensureUserId(),
    chatHistory,
    gameState: getGameState()
  });
}

function setCloudSaveStatus(message) {
  if (els.cloudSaveStatus) els.cloudSaveStatus.textContent = message;
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
    setSessionStatus("Loaded cloud save.");
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
  renderStoredChatHistory(chatHistory);
  renderConversationBadge();
  renderAll();
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

function clearLocalChatHistoryOnly() {
  chatHistory = [];
  clearChatHistory();
  els.messages.innerHTML = "";
  addMessage(els.messages, "gm", "旧聊天记录已清除，当前状态保留。", [], { debugMode });
  renderAll();
  setSessionStatus("Chat history cleared; state kept.");
  showError("");
}

async function handleImportSave(file) {
  if (!file) return;
  try {
    const save = await importJsonSave(file);
    if ("conversation_id" in save) {
      if (save.conversation_id) setConversationId(save.conversation_id);
      else clearConversationId();
    }
    if (save.user_id) setUserId(save.user_id);

    chatHistory = save.chatHistory;
    setGameState(save.gameState);
    saveChatHistory(chatHistory);
    saveGameState(getGameState());
    renderStoredChatHistory(chatHistory);
    renderConversationBadge();
    renderAll();
    showError("");
    setSessionStatus("Imported JSON save.");
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    els.importSaveInput.value = "";
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
    addAndStoreMessage("gm", "已导入存档状态，旧聊天记录已清除。");
    renderConversationBadge();
    renderAll();
    showError("");
    setSessionStatus("Imported state only.");
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    els.importStateOnlyInput.value = "";
  }
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
    renderAll();
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

els.resetConversation.addEventListener("click", resetSession);
els.resetSessionButton?.addEventListener("click", resetSession);
els.resetFromConfigButton?.addEventListener("click", () => resetGameFromCharacterConfig({ confirmReset: true }));
els.applyEditedStateButton?.addEventListener("click", applyEditedState);
els.exportLogButton?.addEventListener("click", exportCurrentTextLog);
els.exportJsonButton?.addEventListener("click", exportCurrentJsonSave);
els.uploadCloudSaveButton?.addEventListener("click", uploadCurrentCloudSave);
els.loadCloudSaveButton?.addEventListener("click", loadCloudSaveIntoLocal);
els.importJsonButton?.addEventListener("click", () => els.importSaveInput?.click());
els.importStateOnlyButton?.addEventListener("click", () => els.importStateOnlyInput?.click());
els.clearChatHistoryButton?.addEventListener("click", clearLocalChatHistoryOnly);
els.importSaveInput?.addEventListener("change", (event) => {
  handleImportSave(event.target.files?.[0]);
});
els.importStateOnlyInput?.addEventListener("change", (event) => {
  handleImportStateOnly(event.target.files?.[0]);
});

els.debugModeToggle?.addEventListener("click", () => {
  debugMode = !debugMode;
  setDebugMode(debugMode);
  renderDebugModeToggle();
});

renderQuickActions({ container: els.quickActions, input: els.input });
applyCharacterConfigToDocument();
ensureUserId();
renderConversationBadge();
renderDebugModeToggle();
restoreSessionFromLocalStorageView();

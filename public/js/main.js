import { buildGamePayloadFromState, formatApiError, sendChatMessage } from "./api/chatApi.js";
import { isValidSaveCode, loadCloudSave, normalizeSaveCode, uploadCloudSave } from "./api/cloudSaveApi.js";
import {
  ATTRIBUTE_POINT_BUDGET,
  createInitialGameState,
  createGameStateFromCharacter,
  getGameState,
  resetGameFromCharacterConfig as resetStateFromCharacterConfig,
  setGameState,
  validateCreatorAttributes
} from "./state/gameState.js";
import { collectDomRefs } from "./utils/dom.js";
import {
  clearChatHistory,
  clearConversationId,
  clearLocalSave,
  countPlayerTurns,
  ensureUserId,
  exportLocalSave,
  exportTextLog,
  getConversationId,
  getDebugMode,
  hasKey,
  importJsonSave,
  importJsonStateOnly,
  isPlainObject,
  loadLocalSave,
  normalizeChatHistory,
  normalizeSaveData,
  restoreSessionFromLocalStorage,
  saveChatHistory,
  saveGameState,
  saveLocalGame,
  setConversationId,
  setDebugMode,
  setUserId
} from "./utils/storage.js";
import { formatLocalStatus, isLocalStatusCommand } from "./utils/localStatus.js";
import {
  clearUserGeminiApiKey,
  getUserGeminiApiKey,
  hasSavedUserGeminiApiKey,
  setUserGeminiApiKey
} from "./utils/apiKeySettings.js";
import { addMessage } from "./render/renderChat.js";
import { renderStatePanel } from "./render/renderStatePanel.js";
import { renderDicePanel } from "./render/renderDicePanel.js";
import { renderDebugPanel } from "./render/renderDebugPanel.js";
import { renderQuickActions } from "./render/renderQuickActions.js";
import { applyCharacterConfigToDocument, CHARACTER_CONFIG } from "./config/character_config.js";
import { createCollapsiblePanelController } from "./ui/collapsiblePanels.js";

const els = collectDomRefs();
let debugMode = getDebugMode();
let chatHistory = [];
let characterCreatorMode = "create";
let uiPanels = null;
const creatorEls = {
  dialog: document.querySelector("#characterCreatorDialog"),
  form: document.querySelector("#characterCreatorForm"),
  title: document.querySelector("#characterCreatorTitle"),
  cancel: document.querySelector("#characterCreatorCancelButton"),
  startDefault: document.querySelector("#startDefaultCharacterButton"),
  createCustom: document.querySelector("#createCustomCharacterButton"),
  save: document.querySelector("#saveCharacterButton"),
  validation: document.querySelector("#creatorValidationStatus"),
  total: document.querySelector("#creatorAttributeTotal"),
  name: document.querySelector("#creatorName"),
  age: document.querySelector("#creatorAge"),
  gender: document.querySelector("#creatorGender"),
  role: document.querySelector("#creatorRole"),
  affiliation: document.querySelector("#creatorAffiliation"),
  rank: document.querySelector("#creatorRank"),
  appearance: document.querySelector("#creatorAppearance"),
  personality: document.querySelector("#creatorPersonality"),
  background: document.querySelector("#creatorBackground"),
  motivation: document.querySelector("#creatorMotivation"),
  techniqueName: document.querySelector("#creatorTechniqueName"),
  techniqueDescription: document.querySelector("#creatorTechniqueDescription"),
  techniqueStrengths: document.querySelector("#creatorTechniqueStrengths"),
  techniqueWeaknesses: document.querySelector("#creatorTechniqueWeaknesses"),
  attrPhysique: document.querySelector("#creatorAttrPhysique"),
  attrTechnique: document.querySelector("#creatorAttrTechnique"),
  attrCursedEnergy: document.querySelector("#creatorAttrCursedEnergy"),
  attrMind: document.querySelector("#creatorAttrMind")
};

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
  uiPanels?.apply();
}

function setupUiPanels() {
  uiPanels = createCollapsiblePanelController({
    collapseAllButton: els.collapseAllPanelsButton,
    expandAllButton: els.expandAllPanelsButton,
    focusModeButton: els.focusModeButton,
    getState: getGameState,
    panels: [
      {
        id: "characterSheet",
        element: document.querySelector(".character-card"),
        defaultCollapsed: false
      },
      {
        id: "attributes",
        element: els.stateAttributes?.closest(".panel"),
        defaultCollapsed: false
      },
      {
        id: "inventory",
        element: els.stateInventory?.closest(".panel"),
        defaultCollapsed: (state) => isInventoryEmpty(state.inventory)
      },
      {
        id: "sessionControls",
        element: document.querySelector(".session-controls"),
        defaultCollapsed: window.matchMedia("(max-width: 980px)").matches
      },
      {
        id: "apiKeySettings",
        element: document.querySelector(".api-key-settings"),
        defaultCollapsed: true
      },
      {
        id: "objective",
        element: els.stateObjective?.closest(".panel"),
        defaultCollapsed: false
      },
      {
        id: "questLog",
        element: els.stateQuestLog?.closest(".panel"),
        defaultCollapsed: false
      },
      {
        id: "combatHud",
        element: els.combatPanel,
        defaultCollapsed: true
      },
      {
        id: "diceResult",
        element: document.querySelector(".dice-card"),
        defaultCollapsed: true
      },
      {
        id: "flags",
        element: els.stateFlags?.closest(".panel"),
        defaultCollapsed: true
      },
      {
        id: "sessionMemory",
        element: els.sessionSummary?.closest(".panel"),
        defaultCollapsed: true
      },
      {
        id: "changeLog",
        element: els.changeLog?.closest(".panel"),
        defaultCollapsed: true
      },
      {
        id: "debugPanel",
        element: document.querySelector(".debug-sidebar-panel"),
        defaultCollapsed: true
      }
    ]
  });
}

function isInventoryEmpty(inventory) {
  if (!inventory) return true;
  if (Array.isArray(inventory)) return inventory.length === 0;
  if (Array.isArray(inventory.items)) return inventory.items.length === 0;
  return Object.keys(inventory).length === 0;
}

function addAndStoreMessage(role, text, rawJsonBlocks = [], dice = null) {
  addMessage(els.messages, role, text, rawJsonBlocks, { debugMode, dice });
  chatHistory.push({
    role,
    text,
    rawJsonBlocks,
    dice,
    timestamp: new Date().toISOString()
  });
  saveChatHistory(chatHistory);
}

function renderStoredChatHistory(history) {
  els.messages.innerHTML = "";
  for (const entry of normalizeChatHistory(history)) {
    addMessage(
      els.messages,
      entry.role || "gm",
      entry.text || "",
      entry.rawJsonBlocks || [],
      { debugMode, dice: entry.dice || null }
    );
  }
}

function getCurrentSaveCode() {
  const code = normalizeSaveCode(els.cloudSaveCodeInput?.value);
  return isValidSaveCode(code) ? code : "local-main";
}

function buildLocalSaveData(overrides = {}) {
  const state = getGameState();
  const history = Array.isArray(overrides.chatHistory) ? overrides.chatHistory : chatHistory;
  const sessionSummary = String(overrides.sessionSummary ?? state.sessionSummary ?? "");
  return {
    version: 1,
    saveCode: overrides.saveCode || getCurrentSaveCode(),
    gameState: {
      ...state,
      ...(overrides.gameState || {}),
      sessionSummary
    },
    chatHistory: history,
    sessionSummary,
    turnCount: overrides.turnCount ?? countPlayerTurns(history)
  };
}

function redactRequestPayloadForLog(payload = {}) {
  return {
    ...payload,
    userApiKey: payload.userApiKey ? "[present]" : ""
  };
}

function writeCurrentLocalSave(overrides = {}) {
  return saveLocalGame(buildLocalSaveData(overrides));
}

function buildFullCloudSaveData(saveCode, localSave = loadLocalSave()) {
  const currentState = getGameState();
  const localHistory = normalizeChatHistory(localSave?.chatHistory);
  const currentHistory = normalizeChatHistory(chatHistory);
  const selectedHistory = currentHistory.length >= localHistory.length ? currentHistory : localHistory;
  const sessionSummary = String(
    localSave?.sessionSummary ||
    localSave?.gameState?.sessionSummary ||
    currentState.sessionSummary ||
    ""
  );
  const gameState = {
    ...(isPlainObject(localSave?.gameState) ? localSave.gameState : currentState),
    sessionSummary
  };

  const fullSaveData = normalizeSaveData({
    version: localSave?.version || 1,
    saveCode,
    updatedAt: new Date().toISOString(),
    gameState,
    chatHistory: selectedHistory,
    sessionSummary,
    turnCount: Math.max(Number(localSave?.turnCount || 0), countPlayerTurns(selectedHistory))
  });
  fullSaveData.saveCode = saveCode;
  fullSaveData.updatedAt = new Date().toISOString();
  fullSaveData.gameState.sessionSummary = fullSaveData.sessionSummary || fullSaveData.gameState.sessionSummary || "";
  return fullSaveData;
}

function applyLocalSave(save, { persist = true } = {}) {
  const normalizedSave = normalizeSaveData(save, { preserveUpdatedAt: true });

  chatHistory = normalizedSave.chatHistory;
  setGameState({
    ...normalizedSave.gameState,
    sessionSummary: normalizedSave.sessionSummary || normalizedSave.gameState.sessionSummary || ""
  });
  saveChatHistory(chatHistory);
  saveGameState(getGameState());
  if (persist) {
    saveLocalGame({
      ...normalizedSave,
      gameState: getGameState(),
      chatHistory,
      sessionSummary: getGameState().sessionSummary || normalizedSave.sessionSummary || "",
      turnCount: normalizedSave.turnCount ?? countPlayerTurns(chatHistory)
    });
  }
  renderStoredChatHistory(chatHistory);
  renderConversationBadge();
  renderAll();
}

function restoreSessionFromLocalStorageView() {
  const saved = restoreSessionFromLocalStorage();
  chatHistory = normalizeChatHistory(saved.chatHistory);

  if (saved.gameState) {
    setGameState(saved.gameState);
    saveGameState(getGameState());
  }

  if (chatHistory.length) {
    renderStoredChatHistory(chatHistory);
    setSessionStatus(saved.updatedAt ? `Loaded local save: ${formatUpdatedAt(saved.updatedAt)}.` : "Loaded saved local session.");
  } else {
    setSessionStatus("Continue / Loaded automatically");
  }

  renderConversationBadge();
  renderAll();
}

async function sendMessage(message, selectedSkillId = "") {
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
    const requestPayload = buildGamePayloadFromState(globalThis.TRPG_STATE.gameState, trimmed);
    requestPayload.chatHistory = chatHistory;
    requestPayload.saveCode = getCurrentSaveCode();
    requestPayload.selectedSkillId = String(selectedSkillId || "");
    requestPayload.userApiKey = getUserGeminiApiKey();
    console.log("USER_API_KEY_PRESENT", Boolean(requestPayload.userApiKey));
    console.log("NORMAL_SEND_GAME_STATE", globalThis.TRPG_STATE.gameState);
    console.log("LOCAL_ENGINE_REQUEST_PAYLOAD", redactRequestPayloadForLog(requestPayload));
    const payload = await sendChatMessage(requestPayload);

    console.log("LOCAL_ENGINE_RESPONSE", payload);
    addAndStoreMessage("gm", payload.visibleText || "", [], payload.dice || null);
    if (Array.isArray(payload.updatedChatHistory)) {
      chatHistory = payload.updatedChatHistory;
      saveChatHistory(chatHistory);
    }
    console.log(
      "FRONTEND_RECEIVED_UPDATED_SESSION_SUMMARY_LENGTH",
      String(payload.updatedSessionSummary || "").length
    );
    const previousGameState = getGameState();
    const sessionSummary = payload.updatedSessionSummary || previousGameState.sessionSummary || "";
    const updatedState = setGameState({
      ...(payload.gameState || {}),
      sessionSummary,
      dice: payload.dice || null,
      lastDice: payload.dice || null,
      changeLog: payload.stateChangeLog || []
    });
    saveGameState(updatedState);
    const localSave = writeCurrentLocalSave({
      gameState: updatedState,
      chatHistory,
      sessionSummary,
      saveCode: requestPayload.saveCode || "local-main"
    });
    console.log("GAME_STATE_AFTER_LOCAL_ENGINE", updatedState);
    setSessionStatus(`Saved locally: ${formatUpdatedAt(localSave.updatedAt)}.`);
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

  clearLocalSave();
  chatHistory = [];
  const resetState = resetStateFromCharacterConfig();
  saveChatHistory(chatHistory);
  saveGameState(resetState);
  writeCurrentLocalSave({
    gameState: resetState,
    chatHistory,
    sessionSummary: resetState.sessionSummary || "",
    saveCode: "local-main"
  });
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
  openCharacterCreator("create");
}

function startNewSessionWithState(resetState, message = "New session initialized.") {
  clearLocalSave();
  clearConversationId();
  chatHistory = [];
  const normalizedState = setGameState({
    ...resetState,
    sessionSummary: "",
    dice: null,
    lastDice: null,
    changeLog: [],
    warnings: [],
    sourceMap: {}
  });
  saveChatHistory(chatHistory);
  saveGameState(normalizedState);
  writeCurrentLocalSave({
    gameState: normalizedState,
    chatHistory,
    sessionSummary: "",
    saveCode: "local-main"
  });
  els.messages.innerHTML = "";
  addMessage(els.messages, "gm", message, [], { debugMode });
  renderConversationBadge();
  setSessionStatus("New character session started.");
  renderAll();
}

function exportCurrentTextLog() {
  exportTextLog(chatHistory, getGameState());
}

function exportCurrentJsonSave() {
  exportLocalSave(buildLocalSaveData({
    gameState: getGameState(),
    chatHistory,
    sessionSummary: getGameState().sessionSummary || ""
  }));
}

function saveCurrentLocalSession() {
  const localSave = writeCurrentLocalSave();
  setSessionStatus(`Saved locally: ${formatUpdatedAt(localSave.updatedAt)}.`);
  showError("");
}

function loadCurrentLocalSession() {
  try {
    const save = loadLocalSave();
    if (!save) {
      setSessionStatus("No local save found.");
      return;
    }
    applyLocalSave(save, { persist: false });
    setSessionStatus(`Loaded local save: ${formatUpdatedAt(save.updatedAt)}.`);
    showError("");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSessionStatus("Local save load failed.");
    showError(message);
  }
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
    const localSave = loadLocalSave();
    const saveData = buildFullCloudSaveData(saveCode, localSave);
    console.log("CLOUD_UPLOAD_LOCAL_SAVE_KEYS", Object.keys(localSave || {}));
    console.log("CLOUD_UPLOAD_SAVE_DATA_KEYS", Object.keys(saveData));
    console.log("CLOUD_UPLOAD_GAME_STATE_PRESENT", !!saveData.gameState);
    console.log("CLOUD_UPLOAD_CHAT_HISTORY_LENGTH", Array.isArray(saveData.chatHistory) ? saveData.chatHistory.length : -1);
    console.log("CLOUD_UPLOAD_SESSION_SUMMARY_LENGTH", String(saveData.sessionSummary || "").length);
    console.log("CLOUD_UPLOAD_TURN_COUNT", saveData.turnCount);
    const payload = await uploadCloudSave({
      saveCode,
      saveData
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
    const responsePayload = await loadCloudSave(saveCode);
    console.log("CLOUD_LOAD_RESPONSE_KEYS", Object.keys(responsePayload || {}));
    if (responsePayload?.ok === false) {
      throw new Error(responsePayload.error || "Cloud save load failed.");
    }
    const rawSaveData =
      responsePayload?.saveData ||
      responsePayload?.data ||
      responsePayload?.save ||
      null;
    console.log("CLOUD_LOAD_SAVE_DATA_FOUND", Boolean(rawSaveData));
    if (!isLoadableCloudSaveData(rawSaveData)) {
      throw new Error("Cloud save response did not include saveData.");
    }
    const normalizedSave = normalizeSaveData(rawSaveData, { preserveUpdatedAt: true });
    console.log("CLOUD_LOAD_SESSION_SUMMARY_LENGTH", normalizedSave.sessionSummary.length);
    console.log("CLOUD_LOAD_CHAT_HISTORY_LENGTH", normalizedSave.chatHistory.length);
    applyLoadedSave(normalizedSave);
    console.log("CLOUD_LOAD_SUCCESS");
    setCloudSaveStatus(`Loaded cloud save. Last updated: ${formatUpdatedAt(normalizedSave.updatedAt)}.`);
    setSessionStatus("Loaded cloud save.");
  } catch (error) {
    const message = formatCloudSaveError(error);
    setCloudSaveStatus(message);
    showError(message);
  }
}

function applyLoadedSave(save) {
  if (hasKey(save, "conversation_id")) {
    if (save.conversation_id) setConversationId(save.conversation_id);
    else clearConversationId();
  }
  if (isPlainObject(save) && save.user_id) setUserId(save.user_id);

  const normalizedSave = normalizeSaveData(save, { preserveUpdatedAt: true });
  applyLocalSave({
    ...normalizedSave,
    saveCode: normalizedSave.saveCode || getCurrentSaveCode()
  });
}

function isLoadableCloudSaveData(value) {
  return isPlainObject(value) && (
    isPlainObject(value.gameState) ||
    Array.isArray(value.chatHistory) ||
    typeof value.sessionSummary === "string"
  );
}

function formatCloudSaveError(error) {
  const status = error?.status ? `Status ${error.status}: ` : "";
  const payload = error?.payload || {};
  if (payload.error === "SAVE_NOT_FOUND") return `${status}Cloud save not found. Check the save code and try again.`;
  const suggestion = payload.suggestion ? ` ${payload.suggestion}` : "";
  return `${status}${payload.error || error?.message || "Cloud save request failed."}${suggestion}`;
}

function formatUpdatedAt(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function renderApiKeySettings() {
  if (!els.userGeminiApiKeyInput) return;
  const saved = hasSavedUserGeminiApiKey();
  const present = Boolean(getUserGeminiApiKey());
  els.userGeminiSaveOnDevice.checked = saved;
  els.userGeminiApiKeyInput.value = "";
  els.userGeminiApiKeyInput.placeholder = saved
    ? "Saved key present; enter a new key to replace"
    : "Paste Gemini API key";
  if (els.userGeminiApiKeyStatus) {
    els.userGeminiApiKeyStatus.textContent = present
      ? (saved ? "Gemini API key saved on this device." : "Gemini API key stored for this browser session.")
      : "No user Gemini API key set.";
  }
}

function saveUserGeminiApiKeyFromPanel() {
  const key = els.userGeminiApiKeyInput?.value?.trim() || "";
  if (!key) {
    if (els.userGeminiApiKeyStatus) {
      els.userGeminiApiKeyStatus.textContent = "Enter a Gemini API key first. Saved keys are hidden.";
    }
    return;
  }
  setUserGeminiApiKey(key, {
    saveOnDevice: Boolean(els.userGeminiSaveOnDevice?.checked)
  });
  renderApiKeySettings();
  showError("");
}

function clearUserGeminiApiKeyFromPanel() {
  clearUserGeminiApiKey();
  renderApiKeySettings();
  showError("");
}

function clearLocalChatHistoryOnly() {
  chatHistory = [];
  clearChatHistory();
  writeCurrentLocalSave({
    chatHistory,
    sessionSummary: getGameState().sessionSummary || ""
  });
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
    if (hasKey(save, "conversation_id")) {
      if (save.conversation_id) setConversationId(save.conversation_id);
      else clearConversationId();
    }
    if (isPlainObject(save) && save.user_id) setUserId(save.user_id);

    applyLocalSave(save);
    renderConversationBadge();
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
    if (hasKey(save, "conversation_id")) {
      if (save.conversation_id) setConversationId(save.conversation_id);
      else clearConversationId();
    }
    if (isPlainObject(save) && save.user_id) setUserId(save.user_id);

    chatHistory = [];
    setGameState(save.gameState);
    saveChatHistory(chatHistory);
    saveGameState(getGameState());
    writeCurrentLocalSave({
      gameState: getGameState(),
      chatHistory,
      sessionSummary: getGameState().sessionSummary || "",
      saveCode: "local-main"
    });
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
    writeCurrentLocalSave({
      gameState: nextState,
      chatHistory,
      sessionSummary: nextState.sessionSummary || ""
    });
    renderAll();
    if (els.stateEditorStatus) {
      els.stateEditorStatus.textContent = "Edited state applied locally and will sync on the next engine request.";
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

function openCharacterCreator(mode = "create") {
  characterCreatorMode = mode;
  console.log(mode === "edit" ? "CHARACTER_EDIT_OPEN" : "CHARACTER_CREATE_START");
  if (!creatorEls.dialog) return;
  creatorEls.title.textContent = mode === "edit" ? "Edit Current Character" : "Create Character";
  const state = mode === "edit" ? getGameState() : createInitialGameState();
  populateCharacterCreator(state);
  updateCreatorValidation();
  creatorEls.dialog.showModal();
}

function closeCharacterCreator() {
  creatorEls.dialog?.close();
}

function populateCharacterCreator(state) {
  const character = state.character || CHARACTER_CONFIG.character || {};
  const technique = character.technique || {};
  const attrs = state.attributes || CHARACTER_CONFIG.starting_attributes || {};
  creatorEls.name.value = character.name || state.characterName || "";
  creatorEls.age.value = valueForEditor(character.age ?? state.age);
  creatorEls.gender.value = character.gender || "";
  creatorEls.role.value = character.role || state.rank || "";
  creatorEls.affiliation.value = character.affiliation || "";
  creatorEls.rank.value = character.rank || state.rank || "";
  creatorEls.appearance.value = character.appearance || "";
  creatorEls.personality.value = character.personality || "";
  creatorEls.background.value = character.background || state.background || "";
  creatorEls.motivation.value = character.coreMotivation || "";
  creatorEls.techniqueName.value = technique.name || state.techniqueName || "";
  creatorEls.techniqueDescription.value = technique.description || state.techniqueDescription || "";
  creatorEls.techniqueStrengths.value = formatEditorLines(technique.strengths);
  creatorEls.techniqueWeaknesses.value = formatEditorLines(technique.weaknesses);
  creatorEls.attrPhysique.value = attrs.physique ?? 52;
  creatorEls.attrTechnique.value = attrs.technique ?? 70;
  creatorEls.attrCursedEnergy.value = attrs.cursed_energy ?? 58;
  creatorEls.attrMind.value = attrs.mind ?? 55;
}

function populateCustomCharacterDraft() {
  creatorEls.name.value = "";
  creatorEls.age.value = "";
  creatorEls.gender.value = "";
  creatorEls.role.value = "";
  creatorEls.affiliation.value = "";
  creatorEls.rank.value = "";
  creatorEls.appearance.value = "";
  creatorEls.personality.value = "";
  creatorEls.background.value = "";
  creatorEls.motivation.value = "";
  creatorEls.techniqueName.value = "";
  creatorEls.techniqueDescription.value = "";
  creatorEls.techniqueStrengths.value = "";
  creatorEls.techniqueWeaknesses.value = "";
  creatorEls.attrPhysique.value = 50;
  creatorEls.attrTechnique.value = 65;
  creatorEls.attrCursedEnergy.value = 60;
  creatorEls.attrMind.value = 60;
  updateCreatorValidation();
}

function readCharacterCreatorDraft() {
  return {
    character: {
      name: creatorEls.name.value.trim(),
      age: parseEditorInteger(creatorEls.age.value, ""),
      gender: creatorEls.gender.value.trim(),
      role: creatorEls.role.value.trim(),
      affiliation: creatorEls.affiliation.value.trim(),
      rank: creatorEls.rank.value.trim(),
      appearance: creatorEls.appearance.value.trim(),
      personality: creatorEls.personality.value.trim(),
      background: creatorEls.background.value.trim(),
      coreMotivation: creatorEls.motivation.value.trim(),
      technique: {
        name: creatorEls.techniqueName.value.trim(),
        description: creatorEls.techniqueDescription.value.trim(),
        strengths: parseEditorLines(creatorEls.techniqueStrengths.value),
        weaknesses: parseEditorLines(creatorEls.techniqueWeaknesses.value),
        stages: []
      }
    },
    attributes: {
      physique: parseEditorInteger(creatorEls.attrPhysique.value, 0),
      technique: parseEditorInteger(creatorEls.attrTechnique.value, 0),
      cursed_energy: parseEditorInteger(creatorEls.attrCursedEnergy.value, 0),
      mind: parseEditorInteger(creatorEls.attrMind.value, 0)
    }
  };
}

function updateCreatorValidation() {
  const draft = readCharacterCreatorDraft();
  const validation = validateCreatorAttributes(draft.attributes);
  const missing = [];
  if (!draft.character.name) missing.push("name");
  if (!draft.character.technique.name) missing.push("technique name");
  const valid = validation.valid && missing.length === 0;
  creatorEls.total.textContent = `${validation.total} / ${ATTRIBUTE_POINT_BUDGET}`;
  creatorEls.total.classList.toggle("invalid", !validation.valid);
  creatorEls.save.disabled = !valid;
  const parts = [];
  if (missing.length) parts.push(`Missing: ${missing.join(", ")}.`);
  if (validation.overBudget) parts.push("Attribute total is over budget.");
  if (validation.invalidKeys.length) parts.push(`Each attribute must be 30-80: ${validation.invalidKeys.join(", ")}.`);
  creatorEls.validation.textContent = parts.join(" ") || "Character is valid.";
  return valid;
}

function saveCharacterFromCreator() {
  if (!updateCreatorValidation()) return;
  const draft = readCharacterCreatorDraft();
  if (characterCreatorMode === "edit") {
    const current = getGameState();
    const validation = validateCreatorAttributes(draft.attributes);
    const updated = setGameState({
      ...current,
      character: draft.character,
      character_name: draft.character.name,
      characterName: draft.character.name,
      technique_name: draft.character.technique.name,
      techniqueName: draft.character.technique.name,
      technique_description: draft.character.technique.description,
      techniqueDescription: draft.character.technique.description,
      attributes: {
        ...validation.attributes,
        _exp: current.attributes?._exp || {}
      }
    });
    saveGameState(updated);
    writeCurrentLocalSave({
      gameState: updated,
      chatHistory,
      sessionSummary: updated.sessionSummary || ""
    });
    renderAll();
    closeCharacterCreator();
    setSessionStatus("Character updated.");
    console.log("CHARACTER_EDIT_SAVE", updated.character);
    return;
  }

  const nextState = createGameStateFromCharacter({
    ...draft,
    questMode: draft.character.name === "雨宫朔" ? "default" : "custom"
  });
  startNewSessionWithState(nextState, `Character session started: ${draft.character.name}`);
  closeCharacterCreator();
  console.log("CHARACTER_CREATE_SUCCESS", nextState.character);
}

function startDefaultCharacter() {
  const resetState = resetStateFromCharacterConfig();
  startNewSessionWithState(resetState, "Default character session started: 雨宫朔");
  closeCharacterCreator();
  console.log("CHARACTER_CREATE_SUCCESS", resetState.character);
}

function formatEditorLines(value) {
  return Array.isArray(value) ? value.join("\n") : String(value || "");
}

function parseEditorLines(value) {
  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
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
els.editCharacterButton?.addEventListener("click", () => openCharacterCreator("edit"));
els.applyEditedStateButton?.addEventListener("click", applyEditedState);
els.saveLocalButton?.addEventListener("click", saveCurrentLocalSession);
els.loadLocalButton?.addEventListener("click", loadCurrentLocalSession);
els.exportLogButton?.addEventListener("click", exportCurrentTextLog);
els.exportJsonButton?.addEventListener("click", exportCurrentJsonSave);
els.uploadCloudSaveButton?.addEventListener("click", uploadCurrentCloudSave);
els.loadCloudSaveButton?.addEventListener("click", loadCloudSaveIntoLocal);
els.saveUserGeminiApiKeyButton?.addEventListener("click", saveUserGeminiApiKeyFromPanel);
els.clearUserGeminiApiKeyButton?.addEventListener("click", clearUserGeminiApiKeyFromPanel);
els.importJsonButton?.addEventListener("click", () => els.importSaveInput?.click());
els.importStateOnlyButton?.addEventListener("click", () => els.importStateOnlyInput?.click());
els.clearChatHistoryButton?.addEventListener("click", clearLocalChatHistoryOnly);
els.combatPanel?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-skill-id]");
  if (!button || button.disabled) return;
  const skillId = button.dataset.skillId || "";
  const skillName = button.dataset.skillName || skillId;
  const skillType = button.dataset.skillType || "";
  const text = skillType === "defense"
    ? `我使用【${skillName}】抵挡敌人的攻击。`
    : skillType === "setup"
      ? `我使用【${skillName}】覆盖战场。`
      : `我使用【${skillName}】攻击当前敌人。`;
  sendMessage(text, skillId);
});
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

creatorEls.cancel?.addEventListener("click", closeCharacterCreator);
creatorEls.startDefault?.addEventListener("click", startDefaultCharacter);
creatorEls.createCustom?.addEventListener("click", populateCustomCharacterDraft);
creatorEls.save?.addEventListener("click", saveCharacterFromCreator);
creatorEls.form?.addEventListener("input", updateCreatorValidation);

renderQuickActions({ container: els.quickActions, input: els.input });
applyCharacterConfigToDocument();
ensureUserId();
renderConversationBadge();
renderDebugModeToggle();
restoreSessionFromLocalStorageView();
setupUiPanels();
renderApiKeySettings();
renderAll();

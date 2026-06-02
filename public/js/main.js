import { formatApiError, sendChatMessage } from "./api/chatApi.js";
import { parseDifyAnswer } from "./parsers/responseParser.js";
import { getGameState, mergeParsedState, resetGameState, setGameState } from "./state/gameState.js";
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
  importJsonSave,
  importJsonStateOnly,
  restoreSessionFromLocalStorage,
  saveChatHistory,
  saveGameState,
  setConversationId,
  setDebugMode,
  setUserId
} from "./utils/storage.js";
import { addMessage } from "./render/renderChat.js";
import { renderStatePanel } from "./render/renderStatePanel.js";
import { renderDicePanel } from "./render/renderDicePanel.js";
import { renderDebugPanel } from "./render/renderDebugPanel.js";
import { renderQuickActions } from "./render/renderQuickActions.js";

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
  setLoading(true);

  try {
    const payload = await sendChatMessage({
      message: trimmed,
      conversationId: getConversationId(),
      user: ensureUserId()
    });

    setConversationId(payload.conversation_id);
    renderConversationBadge();
    console.log("RAW_DIFY_RESPONSE", payload);
    const answer = payload.answer || payload.data?.answer || payload.message || "";
    console.log("RAW_ANSWER_TEXT", answer);
    console.log("ANSWER_TEXT", answer);
    const parsed = parseDifyAnswer(answer, payload);
    console.log("JSON_BLOCKS_FOUND", parsed.rawJsonBlocks);
    console.log("CHOSEN_FRONTEND_STATE_BLOCK", parsed.chosenFrontendStateBlock);
    console.log("CHOSEN_FRONTEND_STATE_BLOCK.game_state", parsed.chosenFrontendStateBlock?.game_state);
    console.log("CHOSEN_FRONTEND_STATE_BLOCK_INDEX", parsed.chosenFrontendStateBlockIndex);
    console.log("DEBUG_STATE_JSON", parsed.debugStateJson);
    console.log("EXTRACTED_JSON_BLOCKS", parsed.rawJsonBlocks);
    console.log("PARSED_GAME_STATE", parsed.state);
    console.log("game_state.mp", parsed.state?.mp);
    console.log("game_state.inventory", parsed.state?.inventory);
    console.log("game_state.flags", parsed.state?.flags);
    addAndStoreMessage("gm", parsed.displayText || answer, parsed.rawJsonBlocks);
    console.log("GAME_STATE_BEFORE_MERGE", getGameState());
    const gameState = mergeParsedState(parsed.state);
    saveGameState(gameState);
    console.log("MERGED_GAME_STATE", gameState);
    console.log("GAME_STATE_AFTER_MERGE", gameState);
    setSessionStatus("Saved locally.");
    renderAll();
  } catch (error) {
    showError(formatApiError(error));
  } finally {
    setLoading(false);
  }
}

function resetSession() {
  const confirmed = window.confirm("确定要开始新会话吗？这会清除本地聊天记录、conversation_id 和本地 gameState。");
  if (!confirmed) return;
  const clearUser = window.confirm("是否同时清除本地 user_id？选择取消会保留同一个玩家 ID。");

  clearSession({ clearUser });
  if (clearUser) ensureUserId();
  chatHistory = [];
  resetGameState();
  saveChatHistory(chatHistory);
  els.messages.innerHTML = "";
  addAndStoreMessage("gm", "新会话已开始。");
  renderConversationBadge();
  setSessionStatus("New session started.");
  renderAll();
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
els.exportLogButton?.addEventListener("click", exportCurrentTextLog);
els.exportJsonButton?.addEventListener("click", exportCurrentJsonSave);
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
ensureUserId();
renderConversationBadge();
renderDebugModeToggle();
restoreSessionFromLocalStorageView();

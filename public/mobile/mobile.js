import { buildGamePayloadFromState, formatApiError, sendChatMessage } from "../shared/api.js";
import { isValidSaveCode, loadCloudSave, normalizeSaveCode, uploadCloudSave } from "../shared/cloudSaveApi.js";
import {
  getGameState,
  resetGameFromCharacterConfig as resetStateFromCharacterConfig,
  setGameState
} from "../shared/gameState.js";
import {
  clearChatHistory,
  clearConversationId,
  clearLocalSave,
  countPlayerTurns,
  ensureUserId,
  exportLocalSave,
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
} from "../shared/storage.js";
import { escapeHtml } from "../shared/sanitize.js";
import { QUICK_ACTIONS, insertQuickAction, renderAiMessageSections, renderDiceConsequenceCard } from "../shared/renderUtils.js";
import { formatLocalStatus, isLocalStatusCommand } from "../js/utils/localStatus.js";
import {
  clearUserGeminiApiKey,
  getUserGeminiApiKey,
  hasSavedUserGeminiApiKey,
  setUserGeminiApiKey
} from "../js/utils/apiKeySettings.js";
import {
  applyCharacterConfigToDocument,
  CHARACTER_CONFIG,
  DEFAULT_ATTRIBUTE_MAX
} from "../js/config/character_config.js";
import { createCollapsiblePanelController } from "../js/ui/collapsiblePanels.js";

const els = {
  hp: document.querySelector("#mobileHp"),
  mp: document.querySelector("#mobileMp"),
  objective: document.querySelector("#mobileObjective"),
  collapseAllPanelsButton: document.querySelector("#mobileCollapseAllPanelsButton"),
  expandAllPanelsButton: document.querySelector("#mobileExpandAllPanelsButton"),
  focusModeButton: document.querySelector("#mobileFocusModeButton"),
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
  panelQuestLog: document.querySelector("#mobileQuestLog"),
  combatPanel: document.querySelector("#mobileCombatPanel"),
  combatEnemy: document.querySelector("#mobileCombatEnemy"),
  combatSkills: document.querySelector("#mobileCombatSkills"),
  combatLogPanel: document.querySelector("#mobileCombatLog"),
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
  userGeminiApiKeyInput: document.querySelector("#mobileUserGeminiApiKey"),
  userGeminiSaveOnDevice: document.querySelector("#mobileUserGeminiSaveOnDevice"),
  saveUserGeminiApiKeyButton: document.querySelector("#mobileSaveUserGeminiApiKeyButton"),
  clearUserGeminiApiKeyButton: document.querySelector("#mobileClearUserGeminiApiKeyButton"),
  userGeminiApiKeyStatus: document.querySelector("#mobileUserGeminiApiKeyStatus"),
  saveLocalButton: document.querySelector("#mobileSaveLocalButton"),
  loadLocalButton: document.querySelector("#mobileLoadLocalButton"),
  exportJsonButton: document.querySelector("#mobileExportJsonButton"),
  importJsonButton: document.querySelector("#mobileImportJsonButton"),
  resetFromConfigButton: document.querySelector("#mobileResetFromConfigButton"),
  cloudSaveCodeInput: document.querySelector("#mobileCloudSaveCode"),
  uploadCloudSaveButton: document.querySelector("#mobileUploadCloudSaveButton"),
  loadCloudSaveButton: document.querySelector("#mobileLoadCloudSaveButton"),
  cloudSaveStatus: document.querySelector("#mobileCloudSaveStatus"),
  importSaveInput: document.querySelector("#mobileImportSaveInput"),
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
let uiPanels = null;
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
  document.querySelectorAll("[data-character-name]").forEach((element) => {
    element.textContent = valueOrUnknown(state.character?.name || state.characterName || state.character_name);
  });
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
  renderQuestLog(els.panelQuestLog, state.questLog);
  renderCombatHud(state);
  renderTags(els.panelFlags, formatFlags(state.flags));
  renderDice(state.dice);
  els.sessionSummary.textContent = valueOrUnknown(state.sessionSummary);
  renderLog(els.changeLog, state.changeLog, "Unknown");
  renderLog(els.parserWarnings, state.warnings, "None");
  renderSourceMap(els.parserSourceMap, state.sourceMap);
  syncStateEditorFromGameState();
  uiPanels?.apply();
}

function setupMobileUiPanels() {
  const details = Array.from(document.querySelectorAll(".mobile-panels > details"));
  uiPanels = createCollapsiblePanelController({
    collapseAllButton: els.collapseAllPanelsButton,
    expandAllButton: els.expandAllPanelsButton,
    focusModeButton: els.focusModeButton,
    getState: getGameState,
    panels: [
      { id: "mobileStatus", element: details[0], defaultCollapsed: true },
      { id: "mobileInventory", element: details[1], defaultCollapsed: true },
      { id: "mobileAttributes", element: details[2], defaultCollapsed: true },
      { id: "mobileQuestLog", element: details[3], defaultCollapsed: false },
      { id: "mobileCombatHud", element: els.combatPanel || details[4], defaultCollapsed: true },
      { id: "mobileDiceResult", element: details[5], defaultCollapsed: true },
      { id: "mobileMemory", element: details[6], defaultCollapsed: true },
      { id: "mobileDebug", element: details[7], defaultCollapsed: true },
      { id: "mobileApiKeySettings", element: document.querySelector("#mobileApiKeySettingsPanel") || details[8], defaultCollapsed: true },
      { id: "mobileSaves", element: details[9], defaultCollapsed: true },
      { id: "mobileStateEditor", element: details[10], defaultCollapsed: true }
    ]
  });
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
  els.diceAttributeValue.textContent = valueOrUnknown(
    dice?.attributeScore ?? dice?.base_attribute ?? dice?.attribute_score ?? dice?.attribute_value
  );
  els.diceDifficulty.textContent = valueOrUnknown(dice?.difficulty ?? dice?.difficulty_modifier);
  els.diceTarget.textContent = valueOrUnknown(dice?.finalTarget ?? dice?.final_target ?? dice?.target);
  els.diceRoll.textContent = valueOrUnknown(dice?.roll ?? dice?.dice_roll);
  const success = dice?.success;
  els.diceSuccess.textContent = success === undefined || success === null ? "Unknown" : (success ? "成功" : "失败");
  const criticalSuccess = dice?.criticalSuccess || dice?.critical_success;
  const criticalFailure = dice?.criticalFailure || dice?.critical_failure;
  els.diceCritical.textContent = criticalSuccess ? "大成功" : criticalFailure ? "大失败" : success !== undefined ? "否" : "Unknown";
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

function renderQuestLog(container, questLog) {
  if (!container) return;
  const source = questLog && typeof questLog === "object" && !Array.isArray(questLog) ? questLog : {};
  const main = source.main && typeof source.main === "object" ? source.main : null;
  const active = Array.isArray(source.active) ? source.active : [];
  const completed = Array.isArray(source.completed) ? source.completed : [];
  const failed = Array.isArray(source.failed) ? source.failed : [];
  const parts = [];
  if (main) parts.push(formatQuestBlock("Main Quest", main));
  if (active.length) {
    parts.push(`<div class="mobile-quest-group-title">Active Quests</div>${active.map((quest) => formatQuestBlock("", quest)).join("")}`);
  }
  if (completed.length) {
    parts.push(`<p class="mobile-quest-archive">Completed: ${escapeHtml(completed.map((quest) => quest.title || quest.id).join(", "))}</p>`);
  }
  if (failed.length) {
    parts.push(`<p class="mobile-quest-archive">Failed: ${escapeHtml(failed.map((quest) => quest.title || quest.id).join(", "))}</p>`);
  }
  container.innerHTML = parts.length ? parts.join("") : "Unknown";
}

function formatQuestBlock(label, quest) {
  const title = quest.title || quest.id || "Quest";
  const progress = isKnown(quest.progress) ? ` · ${quest.progress}%` : "";
  const clues = Array.isArray(quest.clues) && quest.clues.length
    ? `<ul>${quest.clues.map((clue) => `<li>${escapeHtml(clue)}</li>`).join("")}</ul>`
    : "";
  return `
    <article class="mobile-quest-item">
      <strong>${escapeHtml(label ? `${label}: ${title}` : title)}<span>${escapeHtml(progress)}</span></strong>
      <p>${escapeHtml(quest.description || "")}</p>
      ${clues}
    </article>
  `;
}

function renderCombatHud(state) {
  if (!els.combatPanel) return;
  const combat = state?.combat;
  const source = combat && typeof combat === "object" && !Array.isArray(combat) ? combat : {};
  const active = Boolean(source.active);
  console.log("FRONTEND_COMBAT_ACTIVE", active);
  console.log("FRONTEND_BATTLE_HUD_ACTIVE", active);
  console.log("FRONTEND_COMBAT_ENEMY_COUNT", Array.isArray(source.enemies) ? source.enemies.length : 0);
  els.combatPanel.hidden = !active;
  if (!active) {
    console.log("FRONTEND_BATTLE_HUD_HIDDEN_COMBAT_ENDED", true);
    els.combatEnemy.innerHTML = `
      <article class="mobile-quest-item">
        <strong>战斗结束<span></span></strong>
        <p>本回合伤害：${escapeHtml(source.lastDamageDealt || 0)}｜承受伤害：${escapeHtml(source.lastDamageTaken || 0)}</p>
      </article>
    `;
    renderMobileSkillButtons([], state);
    els.combatLogPanel.textContent = (Array.isArray(source.combatLog) ? source.combatLog.slice(-3) : []).join("\n") || "No combat log.";
    return;
  }
  const enemy = findCurrentEnemy(source);
  if (!enemy) {
    els.combatEnemy.textContent = "Unknown enemy";
    renderMobileSkillButtons(state.skills, state);
    els.combatLogPanel.textContent = "Unknown";
    return;
  }
  const statusList = Array.isArray(enemy.status) ? enemy.status : [];
  const status = statusList.length ? statusList.join("，") : "无";
  console.log("BATTLE_HUD_ENEMY_STATUS_RAW", enemy.status);
  console.log("BATTLE_HUD_ENEMY_STATUS_RENDERED", status);
  els.combatEnemy.innerHTML = `
    <article class="mobile-quest-item">
      <strong>${escapeHtml(enemy.name || "敌人")} Lv.${escapeHtml(enemy.level || "?")}<span>${escapeHtml(enemy.rank || "")}</span></strong>
      <p>HP: ${escapeHtml(enemy.hp ?? 0)} / ${escapeHtml(enemy.maxHp ?? 0)}</p>
      <p>状态：${escapeHtml(status)}</p>
      <p>意图：${escapeHtml(enemy.intent || "不明")}</p>
      <p>本回合伤害：${escapeHtml(source.lastDamageDealt || 0)}｜承受伤害：${escapeHtml(source.lastDamageTaken || 0)}</p>
    </article>
  `;
  renderMobileSkillButtons(state.skills, state);
  els.combatLogPanel.textContent = (Array.isArray(source.combatLog) ? source.combatLog.slice(-3) : []).join("\n") || "No combat log.";
}

function renderMobileSkillButtons(skills, state) {
  if (!els.combatSkills) return;
  els.combatSkills.innerHTML = "";
  const list = Array.isArray(skills) ? skills : [];
  if (!list.length) return;
  for (const skill of list) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mobile-secondary";
    button.dataset.skillId = skill.id;
    button.dataset.skillName = skill.name;
    button.dataset.skillType = skill.type || "";
    const mpCost = Number(skill.mpCost || 0);
    const cooldown = Number(skill.currentCooldown || 0);
    button.disabled = Number(state.mp || 0) < mpCost || cooldown > 0;
    button.textContent = `${skill.name || skill.id} · MP ${mpCost}${cooldown > 0 ? ` · CD ${cooldown}` : ""}`;
    els.combatSkills.append(button);
  }
}

function findCurrentEnemy(combat) {
  const enemies = Array.isArray(combat.enemies) ? combat.enemies : [];
  return enemies.find((enemy) => enemy.id === combat.currentEnemyId && Number(enemy.hp || 0) > 0 && !enemy.defeated)
    || enemies.find((enemy) => Number(enemy.hp || 0) > 0 && !enemy.defeated)
    || null;
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
  els.messages.innerHTML = "";
  for (const entry of normalizeChatHistory(chatHistory)) {
    addMobileMessage(entry.role || "gm", entry.text || "", entry.rawJsonBlocks || [], entry.dice || null);
  }
  renderPanels();
}

function restore() {
  const saved = restoreSessionFromLocalStorage();
  chatHistory = normalizeChatHistory(saved.chatHistory);
  if (saved.gameState) setGameState(saved.gameState);
  els.messages.innerHTML = "";
  if (chatHistory.length) {
    for (const entry of normalizeChatHistory(chatHistory)) addMobileMessage(entry.role, entry.text, entry.rawJsonBlocks || [], entry.dice || null);
  }
  renderPanels();
}

async function sendMessage(text, selectedSkillId = "") {
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
    const requestPayload = buildGamePayloadFromState(globalThis.TRPG_STATE.gameState, query);
    requestPayload.chatHistory = chatHistory;
    requestPayload.saveCode = getCurrentSaveCode();
    requestPayload.selectedSkillId = String(selectedSkillId || "");
    requestPayload.userApiKey = getUserGeminiApiKey();
    console.log("USER_API_KEY_PRESENT", Boolean(requestPayload.userApiKey));
    console.log("NORMAL_SEND_GAME_STATE", globalThis.TRPG_STATE.gameState);
    console.log("LOCAL_ENGINE_REQUEST_PAYLOAD", redactRequestPayloadForLog(requestPayload));
    const payload = await sendChatMessage(requestPayload);
    console.log("LOCAL_ENGINE_RESPONSE", payload);
    storeMessage("gm", payload.visibleText || "", [], payload.dice || null);
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
    writeCurrentLocalSave({
      gameState: updatedState,
      chatHistory,
      sessionSummary,
      saveCode: requestPayload.saveCode || "local-main"
    });
    console.log("GAME_STATE_AFTER_LOCAL_ENGINE", updatedState);
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
    if (hasKey(save, "conversation_id")) {
      if (save.conversation_id) setConversationId(save.conversation_id);
      else clearConversationId();
    }
    if (isPlainObject(save) && save.user_id) setUserId(save.user_id);

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
    setCloudSaveStatus("Imported JSON save.");
    showError("");
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    els.importSaveInput.value = "";
  }
}

function saveCurrentLocalSession() {
  const save = writeCurrentLocalSave();
  setCloudSaveStatus(`Saved locally. Last updated: ${formatUpdatedAt(save.updatedAt)}.`);
  showError("");
}

function loadCurrentLocalSession() {
  try {
    const save = loadLocalSave();
    if (!save) {
      setCloudSaveStatus("No local save found.");
      return;
    }
    applyLocalSave(save, { persist: false });
    setCloudSaveStatus(`Loaded local save. Last updated: ${formatUpdatedAt(save.updatedAt)}.`);
    showError("");
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
}

function exportCurrentJsonSave() {
  exportLocalSave(buildLocalSaveData({
    gameState: getGameState(),
    chatHistory,
    sessionSummary: getGameState().sessionSummary || ""
  }));
  setCloudSaveStatus("Exported local save JSON.");
}

function clearLocalChatHistoryOnly() {
  chatHistory = [];
  clearChatHistory();
  writeCurrentLocalSave({
    chatHistory,
    sessionSummary: getGameState().sessionSummary || ""
  });
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
    renderPanels();
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

els.saveLocalButton?.addEventListener("click", saveCurrentLocalSession);
els.loadLocalButton?.addEventListener("click", loadCurrentLocalSession);
els.exportJsonButton?.addEventListener("click", exportCurrentJsonSave);
els.importJsonButton?.addEventListener("click", () => els.importSaveInput?.click());
els.importSaveInput?.addEventListener("change", (event) => {
  handleImportSave(event.target.files?.[0]);
});
els.importStateOnlyButton?.addEventListener("click", () => els.importStateOnlyInput?.click());
els.importStateOnlyInput?.addEventListener("change", (event) => {
  handleImportStateOnly(event.target.files?.[0]);
});
els.clearChatHistoryButton?.addEventListener("click", clearLocalChatHistoryOnly);
els.resetFromConfigButton?.addEventListener("click", () => resetGameFromCharacterConfig({ confirmReset: true }));
els.uploadCloudSaveButton?.addEventListener("click", uploadCurrentCloudSave);
els.loadCloudSaveButton?.addEventListener("click", loadCloudSaveIntoLocal);
els.saveUserGeminiApiKeyButton?.addEventListener("click", saveUserGeminiApiKeyFromPanel);
els.clearUserGeminiApiKeyButton?.addEventListener("click", clearUserGeminiApiKeyFromPanel);
els.applyEditedStateButton?.addEventListener("click", applyEditedState);
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

ensureUserId();
applyCharacterConfigToDocument();
setDebugModeClass();
renderQuickActions();
restore();
setupMobileUiPanels();
renderApiKeySettings();
renderPanels();

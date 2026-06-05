import { emptyDiceResult, rollD100Check } from "./dice.js";
import { retrieveLoreContext } from "./lore.js";
import {
  buildRecentHistoryContext,
  buildUpdatedChatHistory,
  normalizeChatHistory,
  shouldUpdateSessionSummary,
  trimChatHistoryAfterSummary
} from "./memory.js";
import { callMechanicsLLM, callOutcomeLLM, callSummaryLLM } from "./llm.js";
import { buildSkillAdjustedMechanics, detectSkillIntent, resolveCombatTurn } from "./combat.js";
import { applyMechanicsToState, attachTurnData, incrementTimelineTurn, normalizeGameState } from "./state.js";

const VALID_ATTRIBUTES = new Set(["physique", "technique", "cursed_energy", "mind"]);
const DIFFICULTY_LABELS = {
  easy: 5,
  normal: 10,
  medium: 15,
  hard: 20,
  extreme: 25
};
const RAIN_FIELD_SKILL_ID = "rain_field";
const RAIN_FIELD_SKILL_NAME = "\u5492\u96e8\u5c55\u5f00";
const RAIN_DEBT_STATUS_PATTERN = /^\u96e8\u503aLv\d+$/;
const BUILTIN_RAIN_FIELD_SKILL = {
  id: RAIN_FIELD_SKILL_ID,
  name: RAIN_FIELD_SKILL_NAME,
  effects: {
    applyStatusToEnemy: "\u96e8\u503aLv1",
    setFlag: "FLAG_rain_field_active"
  }
};

export async function runGameTurn({ message, gameState, chatHistory = [], sessionSummary = "", selectedSkillId = "", userApiKey = "", rng = Math.random }) {
  console.log("SERVER_GAME_TURN_START", {
    message,
    hasGameState: Boolean(gameState)
  });

  const startingState = normalizeGameState(gameState || {});
  const apiKeyOverride = String(userApiKey || "").trim();
  const currentSessionSummary = normalizeSessionSummary(sessionSummary || startingState.sessionSummary);
  console.log("SESSION_SUMMARY_RECEIVED_LENGTH", currentSessionSummary.length);
  const normalizedChatHistory = normalizeChatHistory(chatHistory);
  const recentHistoryContext = buildRecentHistoryContext(normalizedChatHistory);
  console.log("CHAT_HISTORY_RECEIVED_LENGTH", normalizedChatHistory.length);
  console.log("RECENT_HISTORY_CONTEXT_LENGTH", recentHistoryContext.length);

  const retrievedLoreContext = await retrieveLoreContext({ userMessage: message, gameState: startingState, chatHistory: normalizedChatHistory });
  const skillIntent = detectSkillIntent(startingState, message, selectedSkillId);
  const mechanics = await loadMechanics({
    message,
    gameState: startingState,
    recentHistoryContext,
    retrievedLoreContext,
    sessionSummary: currentSessionSummary,
    selectedSkill: skillIntent?.skill || null,
    apiKeyOverride
  });
  const skillAdjustedMechanics = buildSkillAdjustedMechanics(mechanics, skillIntent);
  console.log("MECHANICS_MP_COST_SUGGESTED", mechanics.mp_cost ?? 0);
  if (skillIntent?.skill) {
    console.log("SKILL_MP_COST_CONFIGURED", Number(skillIntent.skill.mpCost || 0));
    console.log("FINAL_MP_COST_APPLIED", Number(skillIntent.skill.mpCost || 0));
  } else {
    console.log("FINAL_MP_COST_APPLIED", Number(skillAdjustedMechanics.mp_cost || 0));
  }
  console.log("MECHANICS_ACTION_TYPE", skillAdjustedMechanics.action_type);
  console.log("MECHANICS_COMBAT_OBJECT", skillAdjustedMechanics.combat);

  const dice = rollIfNeeded(startingState, skillAdjustedMechanics, rng);
  console.log("DICE_RESULT", dice);

  const { gameState: mechanicsState, stateChangeLog } = applyMechanicsToState(startingState, skillAdjustedMechanics);
  const turnState = incrementTimelineTurn(attachTurnData(mechanicsState, { dice, stateChangeLog }));
  console.log("COMBAT_BEFORE_RESOLVE", turnState.combat);
  const combatMechanics = prepareCombatMechanicsForTurn({
    mechanics: skillAdjustedMechanics,
    message,
    gameState: turnState
  });
  const {
    gameState: combatState,
    combatResult,
    stateChangeLog: combatStateChangeLog
  } = resolveCombatTurn(turnState, combatMechanics, dice, { message, selectedSkillId });
  const combinedStateChangeLog = [...stateChangeLog, ...combatStateChangeLog];
  const updatedGameState = attachTurnData(combatState, { dice, stateChangeLog: combinedStateChangeLog });
  applyRainFieldStatusFallback({
    gameStateAfter: updatedGameState,
    combatResult,
    selectedSkillId,
    userMessage: message
  });
  console.log("UPDATED_GAME_STATE", updatedGameState);
  const visibleText = await buildFinalVisibleText({
    message,
    gameStateBefore: startingState,
    gameStateAfter: updatedGameState,
    mechanics: combatMechanics,
    dice,
    combatResult,
    recentHistoryContext,
    retrievedLoreContext,
    sessionSummary: currentSessionSummary,
    apiKeyOverride
  });
  const updatedChatHistory = buildUpdatedChatHistory({
    chatHistory: normalizedChatHistory,
    userMessage: message,
    visibleText
  });
  const summaryDecision = shouldUpdateSessionSummary({
    chatHistory: updatedChatHistory,
    turnCount: countPlayerTurns(updatedChatHistory)
  });
  console.log("SHOULD_UPDATE_SESSION_SUMMARY", summaryDecision);
  const { updatedSessionSummary, finalChatHistory } = await maybeUpdateSessionSummary({
    shouldUpdate: summaryDecision,
    oldSummary: currentSessionSummary,
    chatHistory: updatedChatHistory,
    gameState: updatedGameState,
    apiKeyOverride
  });
  const finalGameState = normalizeGameState({
    ...updatedGameState,
    sessionSummary: updatedSessionSummary
  });
  console.log("UPDATED_CHAT_HISTORY_LENGTH", finalChatHistory.length);
  console.log("UPDATED_SESSION_SUMMARY_LENGTH", updatedSessionSummary.length);
  console.log("FINAL_VISIBLE_TEXT", visibleText);

  return {
    visibleText,
    gameState: finalGameState,
    dice,
    stateChangeLog: combinedStateChangeLog,
    combatResult,
    updatedChatHistory: finalChatHistory,
    updatedSessionSummary
  };
}

async function loadMechanics({ message, gameState, recentHistoryContext, retrievedLoreContext, sessionSummary, selectedSkill = null, apiKeyOverride = "" }) {
  try {
    const { parsed } = await callMechanicsLLM({
      userMessage: message,
      gameState,
      recentHistoryContext,
      retrievedLoreContext,
      sessionSummary,
      selectedSkill,
      apiKeyOverride
    });
    const validated = validateMechanics(parsed);
    console.log("MECHANICS_JSON_VALIDATED", validated);
    return validated;
  } catch (error) {
    if (isGeminiApiKeyError(error)) throw error;
    console.warn("MECHANICS_LLM_FALLBACK_TO_MOCK", {
      message: error?.message || String(error),
      status: error?.status || null
    });
    const fallback = validateMechanics(detectMockMechanics(message), { fromFallback: true });
    console.log("MOCK_MECHANICS", fallback);
    console.log("MECHANICS_JSON_VALIDATED", fallback);
    return fallback;
  }
}

export function detectMockMechanics(message) {
  const text = String(message || "");
  if (/\u5492\u7075|\u654c\u4eba/.test(text) && /\u722c\u51fa|\u6251\u6765|\u88ad\u6765|\u51fa\u73b0/.test(text)) {
    return {
      need_dice: false,
      attribute: null,
      difficulty: 0,
      action_type: "encounter",
      mp_cost: 0,
      hp_change: 0,
      success_hint_zh: "",
      failure_hint_zh: "",
      suggested_state_update: emptySuggestedStateUpdate(),
      combat: {
        starts_combat: true,
        target_enemy_id: null,
        attack_type: "none",
        damage_intent: "none",
        enemy_suggestion: {
          id: "enemy_001",
          name: "低级咒灵",
          level: 3,
          rank: "四级",
          maxHp: 45,
          armor: 0,
          intent: "扑击",
          description: "从阴影中爬出的低级咒灵。"
        }
      }
    };
  }
  if (/\u653b\u51fb|\u65a9|\u672f\u5f0f|\u53d1\u52a8|\u7953\u9664/.test(text)) {
    return {
      need_dice: true,
      attribute: "technique",
      difficulty: 15,
      action_type: "technique_use",
      mp_cost: 5,
      hp_change: 0,
      success_hint_zh: "\u672f\u5f0f\u987a\u5229\u6210\u578b\uff0c\u73a9\u5bb6\u53d6\u5f97\u538b\u5236\u4f18\u52bf\u3002",
      failure_hint_zh: "\u672f\u5f0f\u6ca1\u6709\u5b8c\u5168\u6210\u578b\uff0c\u5492\u529b\u6d88\u8017\u53d1\u751f\uff0c\u4f46\u6548\u679c\u4e0d\u5b8c\u6574\u3002",
      suggested_state_update: emptySuggestedStateUpdate(),
      combat: {
        starts_combat: false,
        target_enemy_id: null,
        attack_type: "technique",
        damage_intent: "normal",
        enemy_suggestion: null
      }
    };
  }
  if (/\u95ea\u907f|\u8eb2\u5f00|\u540e\u9000/.test(text)) {
    return {
      need_dice: true,
      attribute: "physique",
      difficulty: 12,
      action_type: "dodge",
      mp_cost: 0,
      hp_change: 0,
      success_hint_zh: "\u52a8\u4f5c\u53ca\u65f6\u8ddf\u4e0a\uff0c\u4f60\u907f\u5f00\u4e86\u4e3b\u8981\u5a01\u80c1\u3002",
      failure_hint_zh: "\u52a8\u4f5c\u6ca1\u6709\u5b8c\u5168\u8ddf\u4e0a\uff0c\u4f4d\u7f6e\u6216\u8282\u594f\u53d8\u5f97\u4e0d\u5229\u3002",
      suggested_state_update: emptySuggestedStateUpdate(),
      combat: {
        starts_combat: false,
        target_enemy_id: null,
        attack_type: "dodge",
        damage_intent: "none",
        enemy_suggestion: null
      }
    };
  }
  if (/\u611f\u77e5|\u89c2\u5bdf|\u8c03\u67e5|\u89e3\u6790/.test(text)) {
    return {
      need_dice: true,
      attribute: "cursed_energy",
      difficulty: 10,
      action_type: "observe",
      mp_cost: 2,
      hp_change: 0,
      success_hint_zh: "\u5492\u529b\u611f\u77e5\u6355\u6349\u5230\u5173\u952e\u53d8\u5316\uff0c\u7ebf\u7d22\u53d8\u5f97\u6e05\u6670\u3002",
      failure_hint_zh: "\u5492\u529b\u6d41\u52a8\u7d0a\u4e71\uff0c\u611f\u77e5\u6216\u538b\u5236\u6ca1\u6709\u8fbe\u5230\u9884\u671f\u3002",
      suggested_state_update: emptySuggestedStateUpdate()
    };
  }
  return {
    need_dice: false,
    attribute: null,
    difficulty: 0,
    action_type: "scene",
    mp_cost: 0,
    hp_change: 0,
    success_hint_zh: "",
    failure_hint_zh: "",
    suggested_state_update: emptySuggestedStateUpdate()
  };
}

function prepareCombatMechanicsForTurn({ mechanics, message, gameState }) {
  const source = validateMechanics(mechanics);
  const combat = {
    ...emptyCombatMechanics(),
    ...(source.combat || {})
  };
  const combatActive = Boolean(gameState?.combat?.active);
  const enemyCount = Array.isArray(gameState?.combat?.enemies) ? gameState.combat.enemies.length : 0;
  const hostileMessage = hasHostileCombatLanguage(message);
  const combatAction = isCombatActionType(source.action_type);
  const attackType = inferAttackType(source, message);
  const damageIntent = inferDamageIntent(source, message);

  if (combatActive && combatAction && combat.attack_type === "none") {
    combat.attack_type = attackType;
    combat.damage_intent = damageIntent;
    combat.target_enemy_id = combat.target_enemy_id || gameState.combat?.currentEnemyId || null;
  }

  if (!combatActive && !combat.starts_combat && combatAction && hostileMessage) {
    combat.starts_combat = true;
    combat.enemy_suggestion = combat.enemy_suggestion || createFallbackEnemySuggestion();
    combat._triggered_by = "fallback";
    if (combat.attack_type === "none" && isPlayerAttackMessage(message, source.action_type)) {
      combat.attack_type = attackType;
      combat.damage_intent = damageIntent;
    }
    console.log("COMBAT_START_TRIGGERED_BY_FALLBACK", {
      action_type: source.action_type,
      hostileMessage,
      enemyCount
    });
  }

  if (!combatActive && !combat.starts_combat && hostileMessage && isEnemyEncounterMessage(message)) {
    combat.starts_combat = true;
    combat.enemy_suggestion = combat.enemy_suggestion || createFallbackEnemySuggestion();
    combat._triggered_by = "fallback";
    console.log("COMBAT_START_TRIGGERED_BY_FALLBACK", {
      action_type: source.action_type,
      hostileMessage,
      enemyCount
    });
  }

  return {
    ...source,
    combat
  };
}

function applyRainFieldStatusFallback({ gameStateAfter, combatResult, selectedSkillId, userMessage }) {
  const combat = gameStateAfter?.combat;
  const skill = findSkillByIdOrMessage(gameStateAfter, selectedSkillId, userMessage);

  console.log("SELECTED_SKILL_ID", selectedSkillId || "");
  console.log("USER_MESSAGE_FOR_SKILL", userMessage || "");
  console.log("DETECTED_SKILL", skill?.id, skill?.name);
  console.log("DETECTED_SKILL_EFFECTS", skill?.effects);
  console.log("CURRENT_ENEMY_ID", combat?.currentEnemyId);

  if (!combat || !Array.isArray(combat.enemies) || combat.enemies.length === 0) {
    console.log("ENEMY_STATUS_BEFORE_SKILL", undefined);
    return;
  }

  const targetEnemy = findCombatTargetEnemy(combat);
  console.log("ENEMY_STATUS_BEFORE_SKILL", targetEnemy?.status);

  if (!targetEnemy || !isRainFieldAction({ selectedSkillId, userMessage, skill })) return;
  if (combatResult?.skillUsed && combatResult.skillUsed.valid === false) return;

  const statusList = ensureEnemyStatusArray(targetEnemy);
  const resultAlreadyApplied = rainDebtWasAlreadyApplied(combatResult, targetEnemy.id);
  if (resultAlreadyApplied && statusList.some((status) => RAIN_DEBT_STATUS_PATTERN.test(String(status)))) {
    const existingStatus = statusList.find((status) => RAIN_DEBT_STATUS_PATTERN.test(String(status)));
    console.log("RAIN_DEBT_APPLIED", targetEnemy.id, existingStatus);
    console.log("ENEMY_STATUS_AFTER_SKILL", targetEnemy.status);
    return;
  }

  const appliedStatus = applyRainDebtStatus(targetEnemy);
  combatResult.statusApplied = Array.isArray(combatResult.statusApplied)
    ? combatResult.statusApplied
    : [];

  if (appliedStatus) {
    combatResult.statusApplied.push({
      enemyId: targetEnemy.id,
      status: appliedStatus
    });
  }

  gameStateAfter.flags = gameStateAfter.flags || {};
  gameStateAfter.flags.FLAG_rain_field_active = true;
  gameStateAfter.combat.lastDamageDealt = 0;
  gameStateAfter.combat.combatLog = appendCombatLog(
    gameStateAfter.combat.combatLog,
    `${targetEnemy.name} \u83b7\u5f97 ${appliedStatus}\u3002`
  );
  gameStateAfter.combat.enemies = gameStateAfter.combat.enemies.map((enemy) =>
    enemy.id === targetEnemy.id ? targetEnemy : enemy
  );

  console.log("RAIN_DEBT_APPLIED", targetEnemy.id, appliedStatus);
  console.log("ENEMY_STATUS_AFTER_SKILL", targetEnemy.status);
}

function findSkillByIdOrMessage(gameState, selectedSkillId, userMessage) {
  const skills = Array.isArray(gameState?.skills) ? gameState.skills : [];
  const requestedId = String(selectedSkillId || "").trim();
  const text = String(userMessage || "");
  if (requestedId) {
    return skills.find((skill) => skill.id === requestedId)
      || (requestedId === RAIN_FIELD_SKILL_ID ? BUILTIN_RAIN_FIELD_SKILL : null);
  }
  return skills.find((skill) => skill.name && text.includes(skill.name))
    || (text.includes(RAIN_FIELD_SKILL_NAME) || text.includes(RAIN_FIELD_SKILL_ID) ? BUILTIN_RAIN_FIELD_SKILL : null);
}

function isRainFieldAction({ selectedSkillId, userMessage, skill }) {
  return skill?.id === RAIN_FIELD_SKILL_ID
    || skill?.name === RAIN_FIELD_SKILL_NAME
    || String(selectedSkillId || "").trim() === RAIN_FIELD_SKILL_ID
    || String(userMessage || "").includes(RAIN_FIELD_SKILL_NAME)
    || String(userMessage || "").includes(RAIN_FIELD_SKILL_ID);
}

function findCombatTargetEnemy(combat) {
  return combat.enemies.find((enemy) => enemy.id === combat.currentEnemyId)
    || combat.enemies.find((enemy) => Number(enemy.hp || 0) > 0)
    || combat.enemies[0];
}

function ensureEnemyStatusArray(enemy) {
  if (!enemy) return [];
  if (!Array.isArray(enemy.status)) enemy.status = [];
  return enemy.status;
}

function applyRainDebtStatus(enemy) {
  if (!enemy) return null;
  const statusList = ensureEnemyStatusArray(enemy);
  const current = statusList.find((status) => RAIN_DEBT_STATUS_PATTERN.test(String(status)));
  if (!current) {
    statusList.push("\u96e8\u503aLv1");
    return "\u96e8\u503aLv1";
  }

  const level = Number(current.match(/\d+/)?.[0] || 1);
  const nextLevel = Math.min(3, level + 1);
  const nextStatus = `\u96e8\u503aLv${nextLevel}`;
  enemy.status = statusList.filter((status) => !RAIN_DEBT_STATUS_PATTERN.test(String(status)));
  enemy.status.push(nextStatus);
  return nextStatus;
}

function rainDebtWasAlreadyApplied(combatResult, enemyId) {
  return Array.isArray(combatResult?.statusApplied)
    && combatResult.statusApplied.some((entry) => {
      if (typeof entry === "string") return RAIN_DEBT_STATUS_PATTERN.test(entry);
      return entry?.enemyId === enemyId && RAIN_DEBT_STATUS_PATTERN.test(String(entry?.status || ""));
    });
}

function appendCombatLog(log, entry) {
  return [
    ...(Array.isArray(log) ? log : []),
    entry
  ].filter(Boolean).slice(-10);
}

function hasHostileCombatLanguage(message) {
  return /咒灵|敌人|怪物|袭击|扑来|攻击|战斗|开战|低级咒灵|咒骸|式神|诅咒师|刺客/.test(String(message || ""));
}

function isEnemyEncounterMessage(message) {
  const text = String(message || "");
  return /(咒灵|敌人|怪物|低级咒灵|咒骸|式神|诅咒师|刺客)/.test(text)
    && /(出现|爬出|扑来|袭来|攻击|冲来|逼近|开战|战斗)/.test(text);
}

function isCombatActionType(actionType) {
  return new Set([
    "combat",
    "attack",
    "technique_use",
    "technique",
    "physical_attack",
    "cursed_energy",
    "dodge",
    "defense",
    "take_hit"
  ]).has(String(actionType || "").trim().toLowerCase());
}

function isPlayerAttackMessage(message, actionType) {
  const text = String(message || "");
  return /攻击|斩|术式|发动|祓除|打击|刺|砍|轰|压制/.test(text)
    || ["attack", "technique_use", "technique", "physical_attack", "cursed_energy", "combat"].includes(String(actionType || ""));
}

function inferAttackType(mechanics, message) {
  const existing = mechanics?.combat?.attack_type;
  if (existing && existing !== "none") return existing;
  const text = String(message || "");
  if (/闪避|躲开|后退|回避/.test(text) || mechanics.action_type === "dodge") return "dodge";
  if (/防御|格挡|招架|抵挡/.test(text) || mechanics.action_type === "defense") return "defense";
  if (/体术|拳|踢|撞|近身/.test(text)) return "physical";
  if (/咒力|咒能|压制/.test(text)) return "cursed_energy";
  if (/精神|意志|恐惧|心智/.test(text)) return "mind";
  if (/术式|斩|发动|祓除|攻击/.test(text) || mechanics.action_type === "technique_use") return "technique";
  return "technique";
}

function inferDamageIntent(mechanics, message) {
  const existing = mechanics?.combat?.damage_intent;
  if (existing && existing !== "none") return existing;
  const text = String(message || "");
  if (/终结|全力|致命|核心|要害/.test(text)) return "heavy";
  if (/试探|轻|牵制/.test(text)) return "light";
  if (/闪避|躲开|后退|防御|格挡|招架/.test(text)) return "none";
  return "normal";
}

function createFallbackEnemySuggestion() {
  return {
    id: "enemy_001",
    name: "低级咒灵",
    level: 3,
    rank: "四级",
    maxHp: 45,
    armor: 0,
    intent: "扑击",
    description: "被咒力残秽吸引而出现的低级咒灵。"
  };
}

export function validateMechanics(input, { fromFallback = false } = {}) {
  const source = isPlainObject(input?.mechanics) ? input.mechanics : input;
  if (!isPlainObject(source)) throw new Error("Mechanics JSON must be an object.");

  const needDice = Boolean(source.need_dice ?? source.needDice ?? source.required ?? false);
  const attribute = normalizeAttribute(source.attribute);
  if (needDice && !attribute) {
    if (fromFallback) throw new Error("Fallback mechanics produced invalid attribute.");
    throw new Error("Dice mechanics require a valid attribute.");
  }

  const difficulty = needDice ? normalizeDifficulty(source.difficulty) : 0;
  const mechanics = {
    need_dice: needDice,
    attribute: needDice ? attribute : null,
    difficulty,
    action_type: normalizeActionType(source.action_type ?? source.action),
    mp_cost: clampInteger(source.mp_cost, 0, 100, 0),
    hp_change: clampInteger(source.hp_change, -100, 100, 0),
    success_hint_zh: stringOrEmpty(source.success_hint_zh ?? source.success_hint),
    failure_hint_zh: stringOrEmpty(source.failure_hint_zh ?? source.failure_hint),
    suggested_state_update: sanitizeSuggestedStateUpdate(source.suggested_state_update),
    combat: sanitizeCombatMechanics(source.combat)
  };

  if (needDice && !mechanics.success_hint_zh) {
    mechanics.success_hint_zh = "\u884c\u52a8\u6210\u529f\uff0c\u4f60\u53d6\u5f97\u4e86\u77ed\u6682\u4f18\u52bf\u3002";
  }
  if (needDice && !mechanics.failure_hint_zh) {
    mechanics.failure_hint_zh = "\u884c\u52a8\u6ca1\u6709\u8fbe\u5230\u9884\u671f\uff0c\u5c40\u52bf\u53d8\u5f97\u66f4\u7d27\u5f20\u3002";
  }

  return mechanics;
}

function rollIfNeeded(gameState, mechanics, rng) {
  if (!mechanics.need_dice) return emptyDiceResult();
  const attribute = mechanics.attribute;
  const attributeScore = gameState.attributes?.[attribute] || 0;
  return {
    ...rollD100Check({ attribute, attributeScore, difficulty: mechanics.difficulty, rng }),
    action_type: mechanics.action_type,
    failure_consequence: mechanics.failure_hint_zh || ""
  };
}

function buildVisibleText(mechanics, dice) {
  if (!mechanics.need_dice) return "\u4f60\u91c7\u53d6\u884c\u52a8\uff0c\u5c40\u52bf\u7ee7\u7eed\u63a8\u8fdb\u3002";
  return dice.success ? mechanics.success_hint_zh : mechanics.failure_hint_zh;
}

async function buildFinalVisibleText({
  message,
  gameStateBefore,
  gameStateAfter,
  mechanics,
  dice,
  combatResult,
  recentHistoryContext,
  retrievedLoreContext,
  sessionSummary,
  apiKeyOverride = ""
}) {
  const fallback = buildVisibleText(mechanics, dice);
  try {
    const outcome = await callOutcomeLLM({
      userMessage: message,
      gameStateBefore,
      gameStateAfter,
      mechanics,
      dice,
      combatResult,
      recentHistoryContext,
      retrievedLoreContext,
      sessionSummary,
      apiKeyOverride
    });
    return outcome || fallback;
  } catch (error) {
    if (isGeminiApiKeyError(error)) throw error;
    console.warn("OUTCOME_LLM_FALLBACK_TO_HINT", {
      message: error?.message || String(error),
      status: error?.status || null
    });
    return fallback;
  }
}

async function maybeUpdateSessionSummary({ shouldUpdate, oldSummary, chatHistory, gameState, apiKeyOverride = "" }) {
  if (!shouldUpdate) {
    return {
      updatedSessionSummary: oldSummary,
      finalChatHistory: chatHistory
    };
  }

  const summary = await updateSessionSummary({ oldSummary, chatHistory, gameState, apiKeyOverride });
  const updatedSessionSummary = normalizeSessionSummary(summary) || oldSummary;
  const summaryChanged = Boolean(updatedSessionSummary) && updatedSessionSummary !== oldSummary;
  return {
    updatedSessionSummary,
    finalChatHistory: summaryChanged ? trimChatHistoryAfterSummary(chatHistory) : chatHistory
  };
}

async function updateSessionSummary({ oldSummary, chatHistory, gameState, apiKeyOverride = "" }) {
  try {
    const recentHistoryContext = buildRecentHistoryContext(chatHistory);
    const summary = await callSummaryLLM({
      oldSummary,
      recentHistoryContext,
      gameState,
      apiKeyOverride
    });
    const trimmed = String(summary || "").trim();
    return trimmed || oldSummary || "";
  } catch (_error) {
    return oldSummary || "";
  }
}

function isGeminiApiKeyError(error) {
  return error?.code === "GEMINI_API_KEY_REQUIRED"
    || error?.code === "GEMINI_API_KEY_INVALID_OR_FAILED";
}

function countPlayerTurns(chatHistory = []) {
  return (Array.isArray(chatHistory) ? chatHistory : [])
    .filter((entry) => {
      const role = String(entry?.role || "").trim().toLowerCase();
      return role === "player" || role === "user";
    })
    .length;
}

function normalizeSessionSummary(value) {
  const text = String(value || "").trim();
  if (text === "Unknown") return "";
  return trimSessionSummary(text);
}

function trimSessionSummary(text, limit = 700) {
  if (text.length <= limit) return text;
  const sliced = text.slice(0, limit);
  const lastBreak = Math.max(sliced.lastIndexOf("\n\n"), sliced.lastIndexOf("\n"), sliced.lastIndexOf("。"));
  if (lastBreak > 300) return `${sliced.slice(0, lastBreak).trim()}。`;
  return `${sliced.trim()}。`;
}

function normalizeAttribute(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  const aliases = {
    body: "physique",
    physical: "physique",
    physique: "physique",
    technique: "technique",
    skill: "technique",
    cursed_energy: "cursed_energy",
    cursed: "cursed_energy",
    curse: "cursed_energy",
    mind: "mind",
    mental: "mind"
  };
  const attribute = aliases[normalized] || normalized;
  return VALID_ATTRIBUTES.has(attribute) ? attribute : null;
}

function normalizeDifficulty(value) {
  const label = String(value || "").trim().toLowerCase();
  if (label in DIFFICULTY_LABELS) return DIFFICULTY_LABELS[label];
  if (!isFiniteNumberLike(value)) throw new Error("Mechanics difficulty must be a number or known label.");
  return clampInteger(value, 0, 80, 0);
}

function normalizeActionType(value) {
  return String(value || "scene").trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_") || "scene";
}

function sanitizeSuggestedStateUpdate(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    objective_text_zh: nullableString(source.objective_text_zh ?? source.objective ?? source.current_objective),
    flags_add: sanitizeStringList(source.flags_add),
    flags_remove: sanitizeStringList(source.flags_remove),
    inventory_add: sanitizeInventoryList(source.inventory_add),
    inventory_remove: sanitizeInventoryList(source.inventory_remove),
    affinity_changes: sanitizeNumericMap(source.affinity_changes),
    attribute_exp_changes: sanitizeNumericMap(source.attribute_exp_changes),
    quest_updates: sanitizeQuestUpdates(source.quest_updates)
  };
}

function emptySuggestedStateUpdate() {
  return {
    objective_text_zh: null,
    flags_add: [],
    flags_remove: [],
    inventory_add: [],
    inventory_remove: [],
    affinity_changes: {},
    attribute_exp_changes: {},
    quest_updates: emptyQuestUpdates()
  };
}

function emptyCombatMechanics() {
  return {
    starts_combat: false,
    target_enemy_id: null,
    attack_type: "none",
    damage_intent: "none",
    enemy_suggestion: null
  };
}

function emptyQuestUpdates() {
  return {
    add_active: [],
    complete: [],
    fail: [],
    add_clue: [],
    update_progress: []
  };
}

function sanitizeStringList(value) {
  return normalizeList(value)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function sanitizeInventoryList(value) {
  return normalizeList(value)
    .map((item) => {
      if (typeof item === "string") return { name: item.trim(), quantity: 1 };
      if (!isPlainObject(item) || !item.name) return null;
      return {
        ...item,
        name: String(item.name).trim(),
        quantity: Math.max(1, clampInteger(item.quantity ?? item.count, 1, 99, 1))
      };
    })
    .filter((item) => item?.name)
    .slice(0, 20);
}

function sanitizeNumericMap(value) {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => key && isFiniteNumberLike(item))
      .map(([key, item]) => [String(key).trim(), clampInteger(item, -100, 100, 0)])
  );
}

function sanitizeQuestUpdates(value) {
  if (!isPlainObject(value)) return emptyQuestUpdates();
  return {
    add_active: normalizeList(value.add_active)
      .map((quest) => {
        if (!isPlainObject(quest)) return null;
        const id = stringOrEmpty(quest.id).trim();
        const title = stringOrEmpty(quest.title).trim();
        const description = stringOrEmpty(quest.description).trim();
        if (!id || !title || !description) return null;
        return {
          id,
          title,
          description,
          status: "active",
          progress: clampInteger(quest.progress, 0, 100, 0),
          clues: sanitizeStringList(quest.clues)
        };
      })
      .filter(Boolean)
      .slice(0, 10),
    complete: sanitizeQuestIdList(value.complete),
    fail: sanitizeQuestIdList(value.fail),
    add_clue: normalizeList(value.add_clue)
      .map((item) => {
        if (!isPlainObject(item)) return null;
        const questId = stringOrEmpty(item.quest_id ?? item.questId ?? item.id).trim();
        const clue = stringOrEmpty(item.clue ?? item.text ?? item.description).trim();
        return questId && clue ? { quest_id: questId, clue } : null;
      })
      .filter(Boolean)
      .slice(0, 20),
    update_progress: normalizeList(value.update_progress)
      .map((item) => {
        if (!isPlainObject(item)) return null;
        const questId = stringOrEmpty(item.quest_id ?? item.questId ?? item.id).trim();
        if (!questId || !isFiniteNumberLike(item.progress)) return null;
        return {
          quest_id: questId,
          progress: clampInteger(item.progress, 0, 100, 0)
        };
      })
      .filter(Boolean)
      .slice(0, 20)
  };
}

function sanitizeQuestIdList(value) {
  return normalizeList(value)
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!isPlainObject(item)) return "";
      return stringOrEmpty(item.id ?? item.quest_id ?? item.questId).trim();
    })
    .filter(Boolean)
    .slice(0, 20);
}

function sanitizeCombatMechanics(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    starts_combat: Boolean(source.starts_combat ?? source.startsCombat),
    target_enemy_id: nullableString(source.target_enemy_id ?? source.targetEnemyId),
    attack_type: normalizeEnum(
      source.attack_type ?? source.attackType,
      ["physical", "technique", "cursed_energy", "mind", "defense", "dodge", "support", "none"],
      "none"
    ),
    damage_intent: normalizeEnum(
      source.damage_intent ?? source.damageIntent,
      ["none", "light", "normal", "heavy", "finisher"],
      "none"
    ),
    enemy_suggestion: sanitizeEnemySuggestion(source.enemy_suggestion ?? source.enemySuggestion)
  };
}

function sanitizeEnemySuggestion(value) {
  if (!isPlainObject(value)) return null;
  return {
    id: nullableString(value.id),
    name: stringOrEmpty(value.name || "低级咒灵"),
    level: clampInteger(value.level, 1, 5, 1),
    rank: stringOrEmpty(value.rank),
    maxHp: isFiniteNumberLike(value.maxHp ?? value.max_hp)
      ? clampInteger(value.maxHp ?? value.max_hp, 1, 500, 45)
      : undefined,
    armor: clampInteger(value.armor, 0, 50, 0),
    intent: stringOrEmpty(value.intent),
    description: stringOrEmpty(value.description)
  };
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function nullableString(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function stringOrEmpty(value) {
  return value === undefined || value === null ? "" : String(value);
}

function normalizeList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function clampInteger(value, min, max, fallback = 0) {
  return Math.max(min, Math.min(max, toInteger(value, fallback)));
}

function toInteger(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isNaN(number) ? fallback : number;
}

function isFiniteNumberLike(value) {
  if (value === undefined || value === null || value === "") return false;
  return Number.isFinite(Number(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

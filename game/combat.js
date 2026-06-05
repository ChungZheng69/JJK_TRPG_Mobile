import { DEFAULT_RAIN_DEBT_SKILLS, MAX_HP, normalizeGameState } from "./state.js";

const ENEMY_HP_BY_LEVEL = {
  1: 25,
  2: 35,
  3: 45,
  4: 60,
  5: 80
};

const ATTACK_TYPES = new Set(["physical", "technique", "cursed_energy", "mind"]);
const DEFENSE_TYPES = new Set(["defense", "dodge"]);
const ATTACK_SKILL_TYPES = new Set(["attack", "finisher"]);
const RAIN_FIELD_SKILL_ID = "rain_field";
const RAIN_FIELD_SKILL_NAME = "\u5492\u96e8\u5c55\u5f00";
const RAIN_DEBT_STATUS_PATTERN = /^\u96e8\u503aLv\d+$/;
const RAIN_DEBT_PREFIX = "\u96e8\u503a";

export function createEnemy({ id, name, level, rank, maxHp, hp, armor, status, statuses, statusEffects, intent, description, defeated } = {}) {
  const normalizedLevel = clampInteger(level, 1, 5, 1);
  const normalizedMaxHp = Math.max(1, toInteger(maxHp, ENEMY_HP_BY_LEVEL[normalizedLevel] || 45));
  const normalizedHp = clampInteger(hp ?? normalizedMaxHp, 0, normalizedMaxHp, normalizedMaxHp);
  const enemy = {
    id: stringOrEmpty(id) || `enemy_${Date.now().toString(36)}`,
    name: stringOrEmpty(name) || "低级咒灵",
    level: normalizedLevel,
    rank: stringOrEmpty(rank) || defaultRankForLevel(normalizedLevel),
    hp: normalizedHp,
    maxHp: normalizedMaxHp,
    armor: Math.max(0, toInteger(armor, 0)),
    status: normalizeStringList(status ?? statuses ?? statusEffects),
    defeated: Boolean(defeated) || normalizedHp <= 0,
    intent: stringOrEmpty(intent),
    description: stringOrEmpty(description)
  };
  console.log("COMBAT_ENEMY_CREATED", enemy);
  return enemy;
}

export function startCombat(gameState, enemies = []) {
  const state = normalizeGameState(gameState);
  const normalizedEnemies = (enemies.length ? enemies : [createEnemy()])
    .map((enemy) => createEnemy(enemy));
  state.combat = {
    ...state.combat,
    active: true,
    round: Math.max(1, toInteger(state.combat?.round, 0) + 1),
    enemies: normalizedEnemies,
    currentEnemyId: normalizedEnemies[0]?.id || null,
    playerStance: "neutral",
    lastDamageDealt: 0,
    lastDamageTaken: 0,
    combatLog: appendCombatLog(state.combat?.combatLog, "战斗开始。")
  };
  console.log("COMBAT_START", {
    enemies: normalizedEnemies.map((enemy) => enemy.id)
  });
  return normalizeGameState(state);
}

export function detectSkillIntent(gameState, message = "", selectedSkillId = "") {
  const state = normalizeGameState(gameState);
  const skills = Array.isArray(state.skills) ? state.skills : [];
  const requestedId = stringOrEmpty(selectedSkillId).trim();
  const text = stringOrEmpty(message);
  const skill = requestedId
    ? skills.find((item) => item.id === requestedId)
      || DEFAULT_RAIN_DEBT_SKILLS.find((item) => item.id === requestedId)
    : skills.find((item) => item.name && text.includes(item.name))
      || DEFAULT_RAIN_DEBT_SKILLS.find((item) => item.name && text.includes(item.name))
      || ((text.includes(RAIN_FIELD_SKILL_NAME) || text.includes(RAIN_FIELD_SKILL_ID))
        ? DEFAULT_RAIN_DEBT_SKILLS.find((item) => item.id === RAIN_FIELD_SKILL_ID)
        : null);
  if (!skill) return null;
  const normalizedSkill = skill.id === RAIN_FIELD_SKILL_ID
    ? {
      ...skill,
      name: RAIN_FIELD_SKILL_NAME,
      effects: {
        ...(skill.effects || {}),
        applyStatusToEnemy: "\u96e8\u503aLv1",
        setFlag: skill.effects?.setFlag || "FLAG_rain_field_active"
      }
    }
    : skill;
  const intent = { id: normalizedSkill.id, name: normalizedSkill.name, skill: normalizedSkill };
  console.log("SKILL_DETECTED", requestedId || null, normalizedSkill.id, normalizedSkill.name);
  return intent;
}

export function resolveCombatTurn(gameState, mechanics = {}, dice = {}, options = {}) {
  let state = normalizeGameState(gameState);
  const combatMechanics = mechanics.combat || {};
  const skillIntent = detectSkillIntent(state, options.message, options.selectedSkillId);
  console.log("COMBAT_RESOLVE_START", {
    action_type: mechanics.action_type,
    combat: combatMechanics,
    active: Boolean(state.combat?.active),
    enemyCount: Array.isArray(state.combat?.enemies) ? state.combat.enemies.length : 0
  });
  const result = {
    active: Boolean(state.combat?.active),
    round: state.combat?.round || 0,
    targetEnemyId: combatMechanics.target_enemy_id || null,
    damageDealt: 0,
    damageTaken: 0,
    enemyDefeated: false,
    combatEnded: false,
    skillUsed: skillIntent ? buildSkillResult(skillIntent.skill, false, "") : null,
    statusApplied: [],
    cooldownsUpdated: []
  };
  const stateChangeLog = [];

  if (combatMechanics.starts_combat && !state.combat.active) {
    if (combatMechanics._triggered_by !== "fallback") {
      console.log("COMBAT_START_TRIGGERED_BY_MECHANICS");
    }
    const enemy = createEnemy({
      id: combatMechanics.enemy_suggestion?.id || "enemy_001",
      ...(combatMechanics.enemy_suggestion || {})
    });
    state = startCombat(state, [enemy]);
    console.log("COMBAT_AFTER_START", state.combat);
    result.active = true;
    result.round = state.combat.round;
    result.targetEnemyId = enemy.id;
    stateChangeLog.push({
      field: "combat.active",
      old: false,
      new: true,
      reason: "Combat started."
    });
  } else if (state.combat.active) {
    state.combat.round = Math.max(1, toInteger(state.combat.round, 1) + 1);
  }

  if (!state.combat.active) {
    if (skillIntent) {
      result.skillUsed = buildSkillResult(skillIntent.skill, false, "该技能需要先进入战斗。");
      console.log("SKILL_VALIDATION_FAILED", result.skillUsed);
    }
    console.log("COMBAT_ACTIVE_AFTER_RESOLVE", false);
    console.log("COMBAT_ENEMY_COUNT_AFTER_RESOLVE", Array.isArray(state.combat?.enemies) ? state.combat.enemies.length : 0);
    return {
      gameState: normalizeGameState(state),
      combatResult: result,
      stateChangeLog
    };
  }

  const targetEnemy = findTargetEnemy(state.combat, combatMechanics.target_enemy_id);
  result.targetEnemyId = targetEnemy?.id || state.combat.currentEnemyId || null;

  let skillHandledAction = false;
  let usedSkillId = null;
  if (skillIntent) {
    const validation = validateSkillUse(state, skillIntent.skill, targetEnemy);
    if (!validation.valid) {
      result.skillUsed = buildSkillResult(skillIntent.skill, false, validation.reason);
      console.log("SKILL_VALIDATION_FAILED", result.skillUsed);
      console.log("SKILL_REQUIREMENT_FAILED", validation.reason);
    } else {
      result.skillUsed = buildSkillResult(skillIntent.skill, true, "");
      console.log("SKILL_VALIDATION_SUCCESS", result.skillUsed);
      console.log("SKILL_EFFECTS_FOUND", skillIntent.skill.effects || {});
      console.log("SKILL_IS_RAIN_FIELD", isRainFieldSkill(skillIntent.skill));
      usedSkillId = skillIntent.skill.id;
      skillHandledAction = true;
      applySkillMpCost(state, skillIntent.skill, stateChangeLog);
      applySkillUse({ state, skill: skillIntent.skill, targetEnemy, dice, result, stateChangeLog });
    }
  }

  const attackType = normalizeAttackType(combatMechanics.attack_type);
  const damageIntent = normalizeDamageIntent(combatMechanics.damage_intent);
  const isAttack = !skillIntent && !skillHandledAction && ATTACK_TYPES.has(attackType) && damageIntent !== "none";
  const isDefense = !skillIntent && !skillHandledAction && (DEFENSE_TYPES.has(attackType) || DEFENSE_TYPES.has(String(mechanics.action_type || "")));

  if (isAttack && targetEnemy) {
    const damage = calculatePlayerDamage({
      gameState: state,
      mechanics,
      dice,
      targetEnemy
    });
    applyEnemyDamage({ state, targetEnemy, damage, result, stateChangeLog });
  }

  if ((isAttack || isDefense || skillCanTriggerCounter(skillIntent?.skill)) && shouldEnemyDamagePlayer(dice)) {
    const attacker = targetEnemy || findTargetEnemy(state.combat);
    if (attacker && !attacker.defeated && Number(attacker.hp || 0) > 0) {
      let damageTaken = calculateEnemyDamageTakenByPlayer(attacker, dice);
      if (state.combat.playerStance === "guard") {
        damageTaken = Math.max(0, Math.round(damageTaken * 0.5));
      }
      const oldHp = state.hp;
      state.hp = clampInteger(oldHp - damageTaken, 0, MAX_HP, oldHp);
      state.combat.lastDamageTaken = damageTaken;
      result.damageTaken = damageTaken;
      console.log("COMBAT_DAMAGE_TAKEN", {
        enemyId: attacker.id,
        damageTaken
      });
      state.combat.combatLog = appendCombatLog(state.combat.combatLog, `${attacker.name} 反击造成 ${damageTaken} 点伤害。`);
      stateChangeLog.push({
        field: "HP",
        old: oldHp,
        new: state.hp,
        reason: "Applied enemy combat damage."
      });
    }
  } else if (isAttack || isDefense || skillHandledAction) {
    state.combat.lastDamageTaken = 0;
  }

  if (state.combat.playerStance === "guard" && state.combat.lastDamageTaken > 0) {
    state.combat.playerStance = "neutral";
  }

  result.cooldownsUpdated.push(...tickSkillCooldowns(state, usedSkillId));

  const wasActive = Boolean(state.combat.active);
  const endedState = endCombatIfAllEnemiesDefeated(state);
  result.combatEnded = wasActive && !endedState.combat.active;
  state = endedState;
  result.active = state.combat.active;
  result.round = state.combat.round;
  result.damageTaken = state.combat.lastDamageTaken || result.damageTaken;
  console.log("COMBAT_ACTIVE_AFTER_RESOLVE", result.active);
  console.log("COMBAT_ENEMY_COUNT_AFTER_RESOLVE", Array.isArray(state.combat?.enemies) ? state.combat.enemies.length : 0);

  return {
    gameState: normalizeGameState(state),
    combatResult: result,
    stateChangeLog
  };
}

export function endCombatIfAllEnemiesDefeated(gameState) {
  const state = gameState && typeof gameState === "object" && !Array.isArray(gameState)
    ? gameState
    : normalizeGameState(gameState);
  if (!state.combat || !Array.isArray(state.combat.enemies)) return normalizeGameState(state);
  console.log("COMBAT_END_CHECK", {
    active: Boolean(state.combat.active),
    enemies: state.combat.enemies.map((enemy) => ({
      id: enemy.id,
      hp: enemy.hp,
      defeated: enemy.defeated
    }))
  });
  if (!state.combat.active || !state.combat.enemies.length) return normalizeGameState(state);
  const allDefeated = state.combat.enemies.every((enemy) => Number(enemy.hp || 0) <= 0 || enemy.defeated === true);
  if (!allDefeated) return normalizeGameState(state);
  state.combat.active = false;
  state.combat.currentEnemyId = null;
  state.combat.combatLog = appendCombatLog(state.combat.combatLog, "战斗结束。");
  state.flags = {
    ...(state.flags || {}),
    FLAG_combat_victory: true
  };
  console.log("COMBAT_ENDED_TRUE");
  console.log("COMBAT_END");
  return normalizeGameState(state);
}

export function calculatePlayerDamage({ gameState, mechanics, dice, targetEnemy }) {
  const attr = mechanics.attribute || "technique";
  const attrScore = Number(gameState.attributes?.[attr] || 50);
  const attackType = mechanics.combat?.attack_type || "technique";
  const damageIntent = mechanics.combat?.damage_intent || "normal";

  const typeMultiplier = {
    physical: 0.25,
    technique: 0.35,
    cursed_energy: 0.4,
    mind: 0.25,
    support: 0,
    defense: 0,
    dodge: 0,
    none: 0
  }[attackType] ?? 0.3;

  const intentMultiplier = {
    light: 0.75,
    normal: 1.0,
    heavy: 1.3,
    finisher: 1.6,
    none: 0
  }[damageIntent] ?? 1.0;

  let damage = Math.round(attrScore * typeMultiplier * intentMultiplier * diceMultiplierForDamage(dice));
  damage = Math.max(0, damage - Number(targetEnemy.armor || 0));
  return damage;
}

export function buildSkillAdjustedMechanics(mechanics, skillIntent) {
  if (!skillIntent?.skill) return mechanics;
  const skill = skillIntent.skill;
  const combat = {
    ...(mechanics.combat || {}),
    attack_type: attackTypeForSkill(skill),
    damage_intent: damageIntentForSkill(skill),
    target_enemy_id: mechanics.combat?.target_enemy_id || null
  };
  return {
    ...mechanics,
    need_dice: true,
    attribute: skill.attribute || mechanics.attribute || "technique",
    difficulty: mechanics.difficulty || defaultSkillDifficulty(skill),
    action_type: actionTypeForSkill(skill),
    mp_cost: 0,
    combat
  };
}

function applySkillUse({ state, skill, targetEnemy, dice, result, stateChangeLog }) {
  const handledStatusSkill = applySkillStatusEffect({ state, skill, targetEnemy, result });
  if (handledStatusSkill) {
    setSkillCooldown(state, skill, result);
    return;
  }

  if (skill.type === "setup") {
    const status = skill.effects?.applyStatusToEnemy;
    if (targetEnemy && status) {
      console.log("SKILL_STATUS_APPLY_START", {
        enemyId: targetEnemy.id,
        skillId: skill.id,
        statusBefore: targetEnemy.status
      });
      const applied = applyRainDebtStatus(targetEnemy);
      result.statusApplied.push(applied);
      state.combat.combatLog = appendCombatLog(state.combat.combatLog, `${targetEnemy.name} 获得 ${applied}。`);
      console.log("SKILL_STATUS_APPLIED", targetEnemy.id, applied);
      console.log("ENEMY_STATUS_AFTER_APPLY", targetEnemy.status);
      console.log("COMBAT_RESULT_STATUS_APPLIED", result.statusApplied);
    }
    if (skill.effects?.setFlag) {
      state.flags = { ...(state.flags || {}), [skill.effects.setFlag]: true };
    }
    state.combat.lastDamageDealt = 0;
    setSkillCooldown(state, skill, result);
    return;
  }

  if (skill.type === "defense") {
    state.combat.playerStance = "guard";
    state.combat.lastDamageDealt = 0;
    state.combat.combatLog = appendCombatLog(state.combat.combatLog, `${skill.name} 架起防御。`);
    setSkillCooldown(state, skill, result);
    return;
  }

  if (ATTACK_SKILL_TYPES.has(skill.type) && targetEnemy) {
    const damage = calculateSkillDamage({ gameState: state, skill, dice, targetEnemy });
    console.log("SKILL_DAMAGE_CALCULATED", {
      skillId: skill.id,
      targetEnemyId: targetEnemy.id,
      damage
    });
    applyEnemyDamage({ state, targetEnemy, damage, result, stateChangeLog });
    if (skill.id === "debt_execution") {
      targetEnemy.status = targetEnemy.status.filter((item) => !String(item).includes("雨债"));
    }
    setSkillCooldown(state, skill, result);
  }
}

function applySkillStatusEffect({ state, skill, targetEnemy, result }) {
  const effectStatus = skill.effects?.applyStatusToEnemy;
  if (!targetEnemy || (!isRainFieldSkill(skill) && !effectStatus)) return false;
  console.log("SKILL_STATUS_APPLY_START", {
    enemyId: targetEnemy.id,
    skillId: skill.id,
    statusBefore: targetEnemy.status
  });

  let appliedStatus = null;
  if (isRainFieldSkill(skill) || effectStatus === "\u96e8\u503aLv1") {
    appliedStatus = applyRainDebtStatus(targetEnemy);
  } else if (effectStatus) {
    const statusList = ensureEnemyStatusArray(targetEnemy);
    if (!statusList.includes(effectStatus)) statusList.push(effectStatus);
    appliedStatus = effectStatus;
  }

  result.statusApplied = Array.isArray(result.statusApplied) ? result.statusApplied : [];
  if (appliedStatus) {
    result.statusApplied.push({
      enemyId: targetEnemy.id,
      status: appliedStatus
    });
    state.combat.combatLog = appendCombatLog(state.combat.combatLog, `${targetEnemy.name} 获得 ${appliedStatus}。`);
    console.log("SKILL_STATUS_APPLIED", targetEnemy.id, appliedStatus);
  }

  if (skill.effects?.setFlag || isRainFieldSkill(skill)) {
    state.flags = {
      ...(state.flags || {}),
      [skill.effects?.setFlag || "FLAG_rain_field_active"]: true
    };
  }
  state.combat.lastDamageDealt = 0;
  console.log("ENEMY_STATUS_AFTER_APPLY", targetEnemy.status);
  console.log("COMBAT_RESULT_STATUS_APPLIED", result.statusApplied);
  return Boolean(appliedStatus);
}

function applyEnemyDamage({ state, targetEnemy, damage, result, stateChangeLog }) {
  console.log("COMBAT_ENEMY_HP_BEFORE", {
    targetEnemyId: targetEnemy.id,
    hp: targetEnemy.hp,
    maxHp: targetEnemy.maxHp
  });
  const oldHp = Number(targetEnemy.hp || 0);
  const maxHp = Math.max(1, Number(targetEnemy.maxHp || 1));
  targetEnemy.hp = Math.max(0, Math.min(maxHp, oldHp - Math.max(0, damage)));
  state.combat.lastDamageDealt = Math.max(0, damage);
  result.damageDealt = Math.max(0, damage);
  console.log("COMBAT_DAMAGE_CALCULATED", {
    targetEnemyId: targetEnemy.id,
    damage
  });
  console.log("COMBAT_DAMAGE_APPLIED", {
    targetEnemyId: targetEnemy.id,
    oldHp,
    newHp: targetEnemy.hp
  });
  console.log("COMBAT_ENEMY_HP_AFTER", {
    targetEnemyId: targetEnemy.id,
    hp: targetEnemy.hp,
    maxHp
  });
  state.combat.combatLog = appendCombatLog(
    state.combat.combatLog,
    `你造成 ${Math.max(0, damage)} 点伤害。${targetEnemy.name} 剩余 HP ${targetEnemy.hp}/${targetEnemy.maxHp}。`
  );
  stateChangeLog.push({
    field: `combat.enemies.${targetEnemy.id}.hp`,
    old: oldHp,
    new: targetEnemy.hp,
    reason: "Applied player combat damage."
  });
  if (oldHp > 0 && targetEnemy.hp <= 0) {
    targetEnemy.defeated = true;
    targetEnemy.status = [...new Set([...(targetEnemy.status || []), "defeated"])];
    result.enemyDefeated = true;
    console.log("COMBAT_ENEMY_DEFEATED", targetEnemy.id);
    state.combat.combatLog = appendCombatLog(state.combat.combatLog, `${targetEnemy.name} 被击败。`);
  }
}

function validateSkillUse(state, skill, targetEnemy) {
  if (!skill) return { valid: false, reason: "未找到技能。" };
  if (Number(state.mp || 0) < Number(skill.mpCost || 0)) return { valid: false, reason: "MP不足，术式无法完整发动。" };
  if (Number(skill.currentCooldown || 0) > 0) return { valid: false, reason: "技能正在冷却。" };
  if ((skill.type === "attack" || skill.type === "finisher" || skill.effects?.applyStatusToEnemy) && !state.combat.active) {
    return { valid: false, reason: "该技能需要先进入战斗。" };
  }
  if ((skill.type === "attack" || skill.type === "finisher" || skill.effects?.applyStatusToEnemy) && !targetEnemy) {
    return { valid: false, reason: "没有可用目标。" };
  }
  for (const requirement of Array.isArray(skill.requirements) ? skill.requirements : []) {
    if (requirement?.targetStatusIncludes) {
      const needle = stringOrEmpty(requirement.targetStatusIncludes);
      const hasStatus = targetEnemy?.status?.some((status) => String(status).includes(needle));
      if (!hasStatus) return { valid: false, reason: `${skill.name}需要敌人先累积雨债。` };
    }
  }
  return { valid: true, reason: "" };
}

function applySkillMpCost(state, skill, stateChangeLog) {
  const oldMp = Number(state.mp || 0);
  const finalMpCost = Number(skill.mpCost || 0);
  console.log("SKILL_MP_COST_CONFIGURED", finalMpCost);
  console.log("FINAL_MP_COST_APPLIED", finalMpCost);
  console.log("MP_BEFORE_SKILL", oldMp);
  state.mp = Math.max(0, oldMp - finalMpCost);
  console.log("MP_AFTER_SKILL", state.mp);
  console.log("SKILL_MP_COST_APPLIED", {
    skillId: skill.id,
    oldMp,
    newMp: state.mp,
    mpCost: finalMpCost
  });
  stateChangeLog.push({
    field: "MP",
    old: oldMp,
    new: state.mp,
    reason: `Applied skill MP cost: ${skill.name}.`
  });
}

function setSkillCooldown(state, skill, result) {
  const target = state.skills.find((item) => item.id === skill.id);
  if (!target) return;
  const old = Number(target.currentCooldown || 0);
  target.currentCooldown = Math.max(0, Number(skill.cooldown || 0));
  if (target.currentCooldown !== old) {
    const entry = { id: skill.id, old, new: target.currentCooldown };
    result.cooldownsUpdated.push(entry);
    console.log("SKILL_COOLDOWN_SET", entry);
  }
}

function tickSkillCooldowns(state, usedSkillId) {
  const updates = [];
  for (const skill of Array.isArray(state.skills) ? state.skills : []) {
    if (skill.id === usedSkillId) continue;
    const old = Number(skill.currentCooldown || 0);
    if (old <= 0) continue;
    skill.currentCooldown = Math.max(0, old - 1);
    const entry = { id: skill.id, old, new: skill.currentCooldown };
    updates.push(entry);
    console.log("SKILL_COOLDOWN_TICK", entry);
  }
  return updates;
}

function calculateSkillDamage({ gameState, skill, dice, targetEnemy }) {
  const attrScore = Number(gameState.attributes?.[skill.attribute] || 50);
  let finisherMultiplier = 1;
  if (skill.type === "finisher") {
    const rainDebtLevel = readRainDebtLevel(targetEnemy);
    if (rainDebtLevel >= 3) finisherMultiplier = 1.5;
    else if (rainDebtLevel === 2) finisherMultiplier = 1.25;
    else if (rainDebtLevel === 1) finisherMultiplier = 1.1;
  }
  const rawDamage = Math.round(
    attrScore
    * Number(skill.basePower || 1)
    * diceMultiplierForDamage(dice)
    * 0.35
    * finisherMultiplier
  );
  return Math.max(0, rawDamage - Number(targetEnemy.armor || 0));
}

function diceMultiplierForDamage(dice) {
  if (dice?.required) {
    if (dice.criticalSuccess || dice.critical_success) return 2.0;
    if (dice.success === true) return 1.0;
    if (dice.criticalFailure || dice.critical_failure) return 0;
    if (dice.success === false) return 0.35;
  }
  return 1.0;
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

function ensureEnemyStatusArray(enemy) {
  if (!enemy) return [];
  if (!Array.isArray(enemy.status)) enemy.status = [];
  return enemy.status;
}

function readRainDebtLevel(enemy) {
  const status = (Array.isArray(enemy?.status) ? enemy.status : [])
    .map(String)
    .find((item) => RAIN_DEBT_STATUS_PATTERN.test(item) || item.includes(RAIN_DEBT_PREFIX));
  if (!status) return 0;
  const match = status.match(/Lv\s*(\d+)/i);
  return match ? clampInteger(match[1], 1, 3, 1) : 1;
}

function isRainFieldSkill(skill) {
  return skill?.id === RAIN_FIELD_SKILL_ID || skill?.name === RAIN_FIELD_SKILL_NAME;
}

function buildSkillResult(skill, valid, failureReason) {
  return {
    id: skill.id,
    name: skill.name,
    mpCost: skill.mpCost,
    valid,
    failureReason: failureReason || ""
  };
}

function skillCanTriggerCounter(skill) {
  if (!skill) return false;
  return ["attack", "finisher", "defense"].includes(skill.type);
}

function actionTypeForSkill(skill) {
  if (skill.type === "defense") return "defense";
  if (skill.type === "setup") return "technique_use";
  return "technique_use";
}

function attackTypeForSkill(skill) {
  if (skill.type === "defense") return "defense";
  if (skill.damageType && skill.damageType !== "none") return skill.damageType;
  return skill.type === "setup" ? "support" : "technique";
}

function damageIntentForSkill(skill) {
  if (skill.type === "finisher") return "finisher";
  if (skill.type === "attack") return "normal";
  return "none";
}

function defaultSkillDifficulty(skill) {
  if (skill.type === "finisher") return 20;
  if (skill.type === "attack") return 15;
  if (skill.type === "defense") return 12;
  return 10;
}

function calculateEnemyDamageTakenByPlayer(enemy, dice) {
  const base = Number(enemy.level || 1) * 3 + 4;
  if (dice.criticalFailure || dice.critical_failure) return base * 2;
  return base;
}

function shouldEnemyDamagePlayer(dice) {
  if (!dice?.required) return false;
  if (dice.criticalFailure || dice.critical_failure) return true;
  return dice.success === false;
}

function findTargetEnemy(combat, targetEnemyId = null) {
  const enemies = Array.isArray(combat?.enemies) ? combat.enemies : [];
  const requested = stringOrEmpty(targetEnemyId || combat?.currentEnemyId);
  return enemies.find((enemy) => enemy.id === requested && Number(enemy.hp || 0) > 0 && !enemy.defeated)
    || enemies.find((enemy) => Number(enemy.hp || 0) > 0 && !enemy.defeated)
    || null;
}

function appendCombatLog(log, entry) {
  return [...(Array.isArray(log) ? log : []), String(entry || "").trim()]
    .filter(Boolean)
    .slice(-10);
}

function normalizeAttackType(value) {
  const normalized = stringOrEmpty(value || "none").trim().toLowerCase();
  return ["physical", "technique", "cursed_energy", "mind", "defense", "dodge", "support", "none"].includes(normalized)
    ? normalized
    : "none";
}

function normalizeDamageIntent(value) {
  const normalized = stringOrEmpty(value || "none").trim().toLowerCase();
  return ["none", "light", "normal", "heavy", "finisher"].includes(normalized)
    ? normalized
    : "normal";
}

function defaultRankForLevel(level) {
  return {
    1: "四级",
    2: "三级",
    3: "二级",
    4: "一级",
    5: "特级候补"
  }[level] || "四级";
}

function clampInteger(value, min, max, fallback = 0) {
  return Math.max(min, Math.min(max, toInteger(value, fallback)));
}

function toInteger(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isNaN(number) ? fallback : number;
}

function stringOrEmpty(value) {
  return value === undefined || value === null ? "" : String(value);
}

function normalizeStringList(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value])
    .map((item) => stringOrEmpty(item).trim())
    .filter(Boolean);
}

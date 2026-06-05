export const MAX_HP = 100;
export const MAX_MP = 100;
export const ATTRIBUTE_MAX = 80;
export const AFFINITY_MAX = 100;
export const ATTRIBUTE_KEYS = ["physique", "technique", "cursed_energy", "mind"];
export const DEFAULT_CHARACTER = {
  name: "",
  age: "",
  gender: "",
  role: "",
  affiliation: "",
  rank: "",
  appearance: "",
  personality: "",
  background: "",
  coreMotivation: "",
  technique: {
    name: "",
    description: "",
    strengths: [],
    weaknesses: [],
    stages: []
  }
};
export const DEFAULT_QUEST_LOG = {
  main: {
    id: "main_001",
    title: "主线任务",
    description: "",
    status: "active",
    progress: 0
  },
  active: [],
  completed: [],
  failed: []
};
export const DEFAULT_TIMELINE = {
  turn: 1,
  day: "第1天",
  timeOfDay: "傍晚",
  location: "未确定地点",
  scene: "开场"
};
export const DEFAULT_COMBAT = {
  active: false,
  round: 0,
  enemies: [],
  currentEnemyId: null,
  playerStance: "neutral",
  lastDamageDealt: 0,
  lastDamageTaken: 0,
  combatLog: []
};
export const DEFAULT_RAIN_DEBT_SKILLS = [
  {
    id: "rain_field",
    name: "咒雨展开",
    type: "setup",
    mpCost: 6,
    attribute: "cursed_energy",
    damageType: "none",
    basePower: 0,
    cooldown: 0,
    currentCooldown: 0,
    description: "展开咒雨领域雏形，为敌人累积雨债。",
    requirements: [],
    effects: {
      applyStatusToEnemy: "雨债Lv1",
      setFlag: "FLAG_rain_field_active"
    }
  },
  {
    id: "rain_blade",
    name: "雨刃",
    type: "attack",
    mpCost: 8,
    attribute: "technique",
    damageType: "technique",
    basePower: 1.0,
    cooldown: 0,
    currentCooldown: 0,
    description: "将雨势压缩成锋利斩击，对单体敌人造成术式伤害。",
    requirements: []
  },
  {
    id: "debt_execution",
    name: "讨雨斩",
    type: "finisher",
    mpCost: 18,
    attribute: "technique",
    damageType: "technique",
    basePower: 1.8,
    cooldown: 2,
    currentCooldown: 0,
    description: "引爆敌人累积的雨债，造成高额伤害。",
    requirements: [{ targetStatusIncludes: "雨债" }]
  },
  {
    id: "rain_guard",
    name: "雨幕防御",
    type: "defense",
    mpCost: 7,
    attribute: "cursed_energy",
    damageType: "none",
    basePower: 0,
    cooldown: 1,
    currentCooldown: 0,
    description: "以咒雨干扰敌人攻势，降低本回合承受伤害。",
    requirements: []
  }
];
export const DEFAULT_GENERIC_SKILLS = [
  {
    id: "basic_technique_attack",
    name: "基础术式攻击",
    type: "attack",
    mpCost: 5,
    attribute: "technique",
    damageType: "technique",
    basePower: 0.9,
    cooldown: 0,
    currentCooldown: 0,
    description: "以自身术式或咒力进行一次基础攻击。",
    requirements: []
  }
];

export function normalizeGameState(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const maxHp = MAX_HP;
  const maxMp = MAX_MP;
  const attributeMax = ATTRIBUTE_MAX;
  const gojoAffinity = clampNumber(firstValue(source.gojo_affinity, source.Gojo_Affinity, source.gojoAffinity), 0, AFFINITY_MAX, 0);
  const nanamiAffinity = clampNumber(
    firstValue(source.nam_affinity, source.nanami_affinity, source.Nanami_Affinity, source.nanamiAffinity),
    0,
    AFFINITY_MAX,
    0
  );
  const questLog = normalizeQuestLog(source.questLog, source.objective);
  const objective = deriveObjectiveFromQuestLog(questLog) || stringValue(source.objective);
  const character = normalizeCharacter(source.character, source);
  const timeline = normalizeTimeline(source.timeline);
  const combat = normalizeCombat(source.combat);
  const skills = normalizeSkills(source.skills, character);
  if (!isPlainObject(source.character) && hasLegacyCharacterFields(source)) {
    console.log("CHARACTER_MIGRATED_FROM_OLD_SAVE");
  } else if (!isPlainObject(source.character)) {
    console.log("CHARACTER_STATE_REPAIRED", {
      name: character.name,
      technique: character.technique.name
    });
  }

  return {
    ...source,
    character,
    character_name: character.name || stringValue(source.character_name),
    characterName: character.name || stringValue(source.characterName),
    technique_name: character.technique.name || stringValue(source.technique_name),
    techniqueName: character.technique.name || stringValue(source.techniqueName),
    technique_description: character.technique.description || stringValue(source.technique_description),
    techniqueDescription: character.technique.description || stringValue(source.techniqueDescription),
    hp: clampNumber(source.hp, 0, maxHp, maxHp),
    max_hp: maxHp,
    maxHp,
    mp: clampNumber(source.mp, 0, maxMp, maxMp),
    max_mp: maxMp,
    maxMp,
    attributes: normalizeAttributes(source.attributes),
    attribute_max: attributeMax,
    attributeMax,
    inventory: normalizeInventory(source.inventory),
    flags: normalizeFlags(source.flags),
    objective,
    questLog,
    timeline,
    combat,
    skills,
    gojo_affinity: gojoAffinity,
    gojoAffinity,
    Gojo_Affinity: gojoAffinity,
    nam_affinity: nanamiAffinity,
    nanami_affinity: nanamiAffinity,
    nanamiAffinity,
    Nanami_Affinity: nanamiAffinity,
    sukuna_fingers: clampNumber(firstValue(source.sukuna_fingers, source.sukunaFingers), 0, 20, 0),
    sukunaFingers: clampNumber(firstValue(source.sukuna_fingers, source.sukunaFingers), 0, 20, 0),
    dice: source.dice || null,
    lastDice: source.lastDice || source.dice || null,
    changeLog: Array.isArray(source.changeLog) ? source.changeLog : [],
    warnings: Array.isArray(source.warnings) ? source.warnings : [],
    sourceMap: isPlainObject(source.sourceMap) ? source.sourceMap : {}
  };
}

export function applyMechanicsToState(state, mechanics = {}) {
  const next = normalizeGameState(state);
  const log = [];

  if (isFiniteNumberLike(mechanics.mp_cost)) {
    setResource(next, "mp", next.mp - Math.max(0, toInteger(mechanics.mp_cost, 0)), log, "Applied mechanics.mp_cost.");
  }

  if (isFiniteNumberLike(mechanics.hp_change)) {
    setResource(next, "hp", next.hp + toInteger(mechanics.hp_change, 0), log, "Applied mechanics.hp_change.");
  }

  const suggested = isPlainObject(mechanics.suggested_state_update) ? mechanics.suggested_state_update : {};
  applySuggestedStateUpdate(next, suggested, log);
  return { gameState: normalizeGameState(next), stateChangeLog: log };
}

export function attachTurnData(state, { dice = null, stateChangeLog = [] } = {}) {
  const next = normalizeGameState(state);
  next.dice = dice;
  next.lastDice = dice || next.lastDice || null;
  next.changeLog = stateChangeLog;
  return normalizeGameState(next);
}

export function incrementTimelineTurn(state) {
  const next = normalizeGameState(state);
  next.timeline = {
    ...next.timeline,
    turn: toInteger(next.timeline.turn, DEFAULT_TIMELINE.turn) + 1
  };
  return normalizeGameState(next);
}

function applySuggestedStateUpdate(state, update, log) {
  for (const item of normalizeList(update.inventory_add)) {
    addInventoryItem(state, item, log);
  }
  for (const item of normalizeList(update.inventory_remove)) {
    removeInventoryItem(state, item, log);
  }
  for (const flag of normalizeList(update.flags_add)) {
    setFlag(state, String(flag), true, log, "Added flag.");
  }
  for (const flag of normalizeList(update.flags_remove)) {
    setFlag(state, String(flag), false, log, "Removed flag.");
  }
  for (const flag of normalizeList(update.temporary_flags_clear || update.temp_flags_clear)) {
    setFlag(state, String(flag), false, log, "Cleared temporary flag.");
  }
  if (
    isRealValue(update.objective_text_zh)
    || isRealValue(update.objective)
    || isRealValue(update.current_objective)
    || isRealValue(update.current_Objective)
  ) {
    setField(
      state,
      "objective",
      String(firstValue(update.objective_text_zh, update.objective, update.current_objective, update.current_Objective)),
      log,
      "Updated objective."
    );
  }
  if (isPlainObject(update.affinity_changes)) {
    applyAffinityChanges(state, update.affinity_changes, log);
  }
  if (isPlainObject(update.attribute_exp_changes)) {
    applyAttributeExpChanges(state, update.attribute_exp_changes, log);
  }
  if (isPlainObject(update.quest_updates)) {
    applyQuestUpdates(state, update.quest_updates, log);
  }
}

function addInventoryItem(state, rawItem, log) {
  const item = typeof rawItem === "string" ? { name: rawItem, quantity: 1 } : rawItem;
  if (!isPlainObject(item) || !item.name) return;
  const quantity = Math.max(1, toInteger(item.quantity ?? item.count, 1));
  const items = state.inventory.items;
  const existing = items.find((entry) => String(entry.name).trim() === String(item.name).trim());
  if (existing) {
    const old = toInteger(existing.quantity, 1);
    existing.quantity = old + quantity;
    logChange(log, `Inventory.${item.name}`, old, existing.quantity, "Added inventory quantity.");
  } else {
    const nextItem = { ...item, quantity };
    items.push(nextItem);
    logChange(log, `Inventory.${item.name}`, 0, quantity, "Added inventory item.");
  }
}

function removeInventoryItem(state, rawItem, log) {
  const item = typeof rawItem === "string" ? { name: rawItem, quantity: 1 } : rawItem;
  if (!isPlainObject(item) || !item.name) return;
  const quantity = Math.max(1, toInteger(item.quantity ?? item.count, 1));
  const items = state.inventory.items;
  const index = items.findIndex((entry) => String(entry.name).trim() === String(item.name).trim());
  if (index < 0) return;
  const old = toInteger(items[index].quantity, 1);
  const nextQuantity = old - quantity;
  if (nextQuantity <= 0) {
    items.splice(index, 1);
    logChange(log, `Inventory.${item.name}`, old, 0, "Removed inventory item.");
  } else {
    items[index].quantity = nextQuantity;
    logChange(log, `Inventory.${item.name}`, old, nextQuantity, "Reduced inventory quantity.");
  }
}

function applyAffinityChanges(state, changes, log) {
  const aliases = {
    gojo: "gojo_affinity",
    gojo_affinity: "gojo_affinity",
    gojoaffinity: "gojo_affinity",
    nanami: "nam_affinity",
    nam: "nam_affinity",
    nam_affinity: "nam_affinity",
    nanami_affinity: "nam_affinity",
    nanamiaffinity: "nam_affinity"
  };
  for (const [key, value] of Object.entries(changes)) {
    const normalizedKey = String(key).trim().replace(/-/g, "_").toLowerCase();
    const field = aliases[normalizedKey];
    if (!field) continue;
    const old = state[field] || 0;
    const next = clampNumber(old + toInteger(value, 0), 0, AFFINITY_MAX, old);
    setAffinity(state, field, next);
    logChange(log, field === "gojo_affinity" ? "Gojo_Affinity" : "Nanami_Affinity", old, next, "Applied affinity change.");
  }
}

function applyAttributeExpChanges(state, changes, log) {
  if (!isPlainObject(state.attributes._exp)) state.attributes._exp = {};
  for (const key of ATTRIBUTE_KEYS) {
    if (!isFiniteNumberLike(changes[key])) continue;
    const old = toInteger(state.attributes._exp[key], 0);
    const next = Math.max(0, old + toInteger(changes[key], 0));
    state.attributes._exp[key] = next;
    logChange(log, `Attributes._exp.${key}`, old, next, "Applied attribute EXP change.");
  }
}

function applyQuestUpdates(state, questUpdates, log) {
  console.log("QUEST_UPDATE_RECEIVED", questUpdates);
  state.questLog = normalizeQuestLog(state.questLog, state.objective);

  for (const quest of normalizeList(questUpdates.add_active)) {
    addActiveQuest(state, quest, log);
  }
  for (const item of normalizeList(questUpdates.complete)) {
    moveQuest(state, readQuestId(item), "completed", log);
  }
  for (const item of normalizeList(questUpdates.fail)) {
    moveQuest(state, readQuestId(item), "failed", log);
  }
  for (const clue of normalizeList(questUpdates.add_clue)) {
    addQuestClue(state, clue, log);
  }
  for (const progress of normalizeList(questUpdates.update_progress)) {
    updateQuestProgress(state, progress, log);
  }

  syncObjectiveFromQuestLog(state, log);
  console.log("QUEST_LOG_ACTIVE_COUNT", state.questLog.active.length);
  console.log("QUEST_LOG_COMPLETED_COUNT", state.questLog.completed.length);
}

function addActiveQuest(state, rawQuest, log) {
  if (!isPlainObject(rawQuest)) return;
  const quest = normalizeQuest(rawQuest, "active");
  if (!quest.id || !quest.title || !quest.description) return;
  if (findQuestById(state.questLog, quest.id)) return;
  state.questLog.active.push({
    ...quest,
    status: "active",
    clues: Array.isArray(quest.clues) ? quest.clues : []
  });
  console.log("QUEST_ADDED", quest.id);
  logChange(log, `QuestLog.active.${quest.id}`, null, quest.title, "Added active quest.");
}

function moveQuest(state, questId, targetStatus, log) {
  if (!questId) return;
  const index = state.questLog.active.findIndex((quest) => quest.id === questId);
  if (index < 0) return;
  const [quest] = state.questLog.active.splice(index, 1);
  const moved = { ...quest, status: targetStatus };
  state.questLog[targetStatus].push(moved);
  const label = targetStatus === "completed" ? "QUEST_COMPLETED" : "QUEST_FAILED";
  console.log(label, questId);
  logChange(
    log,
    `QuestLog.${questId}.status`,
    quest.status || "active",
    targetStatus,
    targetStatus === "completed" ? "Completed quest." : "Failed quest."
  );
}

function addQuestClue(state, rawClue, log) {
  if (!isPlainObject(rawClue)) return;
  const questId = stringValue(rawClue.quest_id ?? rawClue.questId ?? rawClue.id).trim();
  const clueText = stringValue(rawClue.clue ?? rawClue.text ?? rawClue.description).trim();
  if (!questId || !clueText) return;
  const quest = findQuestById(state.questLog, questId);
  if (!quest) return;
  if (!Array.isArray(quest.clues)) quest.clues = [];
  quest.clues.push(clueText);
  console.log("QUEST_CLUE_ADDED", { questId, clue: clueText });
  logChange(log, `QuestLog.${questId}.clues`, quest.clues.length - 1, quest.clues.length, "Added quest clue.");
}

function updateQuestProgress(state, rawProgress, log) {
  if (!isPlainObject(rawProgress)) return;
  const questId = stringValue(rawProgress.quest_id ?? rawProgress.questId ?? rawProgress.id).trim();
  if (!questId || !isFiniteNumberLike(rawProgress.progress)) return;
  const quest = findQuestById(state.questLog, questId);
  if (!quest) return;
  const old = clampNumber(quest.progress, 0, 100, 0);
  quest.progress = clampNumber(rawProgress.progress, 0, 100, old);
  console.log("QUEST_PROGRESS_UPDATED", { questId, progress: quest.progress });
  logChange(log, `QuestLog.${questId}.progress`, old, quest.progress, "Updated quest progress.");
}

function syncObjectiveFromQuestLog(state, log) {
  const nextObjective = deriveObjectiveFromQuestLog(state.questLog);
  if (!nextObjective) return;
  setField(state, "objective", nextObjective, log, "Mirrored objective from quest log.");
}

function findQuestById(questLog, questId) {
  if (!questId) return null;
  if (questLog.main?.id === questId) return questLog.main;
  for (const bucket of ["active", "completed", "failed"]) {
    const found = questLog[bucket]?.find((quest) => quest.id === questId);
    if (found) return found;
  }
  return null;
}

function readQuestId(value) {
  if (typeof value === "string") return value.trim();
  if (!isPlainObject(value)) return "";
  return stringValue(value.id ?? value.quest_id ?? value.questId).trim();
}

function normalizeAttributes(attributes) {
  const source = isPlainObject(attributes) ? attributes : {};
  const exp = isPlainObject(source._exp) ? source._exp : {};
  return {
    ...source,
    ...Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, clampNumber(source[key], 0, ATTRIBUTE_MAX, 0)])),
    _exp: Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, Math.max(0, toInteger(exp[key], 0))]))
  };
}

function normalizeInventory(inventory) {
  if (Array.isArray(inventory)) return { items: inventory.map(normalizeInventoryItem).filter(Boolean) };
  if (isPlainObject(inventory)) {
    return {
      ...inventory,
      items: Array.isArray(inventory.items) ? inventory.items.map(normalizeInventoryItem).filter(Boolean) : []
    };
  }
  return { items: [] };
}

function normalizeInventoryItem(item) {
  if (typeof item === "string") return { name: item, quantity: 1 };
  if (!isPlainObject(item) || !item.name) return null;
  return {
    ...item,
    name: String(item.name),
    quantity: Math.max(1, toInteger(item.quantity ?? item.count, 1))
  };
}

function normalizeFlags(flags) {
  return isPlainObject(flags) ? { ...flags } : {};
}

function normalizeTimeline(timeline) {
  const source = isPlainObject(timeline) ? timeline : {};
  return {
    turn: Math.max(1, toInteger(source.turn, DEFAULT_TIMELINE.turn)),
    day: stringValue(source.day || DEFAULT_TIMELINE.day),
    timeOfDay: stringValue(source.timeOfDay || source.time_of_day || DEFAULT_TIMELINE.timeOfDay),
    location: stringValue(source.location || DEFAULT_TIMELINE.location),
    scene: stringValue(source.scene || DEFAULT_TIMELINE.scene)
  };
}

function normalizeCombat(combat) {
  const source = isPlainObject(combat) ? combat : {};
  const enemies = normalizeList(source.enemies)
    .map(normalizeEnemy)
    .filter((enemy) => enemy.id)
    .slice(0, 12);
  const active = Boolean(source.active) && enemies.some((enemy) => !enemy.defeated && Number(enemy.hp || 0) > 0);
  const currentEnemyId = active && source.currentEnemyId && enemies.some((enemy) => enemy.id === source.currentEnemyId && !enemy.defeated)
    ? String(source.currentEnemyId)
    : active
      ? enemies.find((enemy) => !enemy.defeated && Number(enemy.hp || 0) > 0)?.id || null
      : null;
  const normalized = {
    active,
    round: Math.max(0, toInteger(source.round, 0)),
    enemies,
    currentEnemyId,
    playerStance: stringValue(source.playerStance || "neutral"),
    lastDamageDealt: Math.max(0, toInteger(source.lastDamageDealt, 0)),
    lastDamageTaken: Math.max(0, toInteger(source.lastDamageTaken, 0)),
    combatLog: normalizeList(source.combatLog)
      .map((entry) => typeof entry === "string" ? entry : stringValue(entry?.text || entry?.message || entry))
      .filter(Boolean)
      .slice(-10)
  };
  console.log("COMBAT_STATE_REPAIRED", {
    active: normalized.active,
    enemies: normalized.enemies.length
  });
  return normalized;
}

function normalizeEnemy(enemy) {
  const source = isPlainObject(enemy) ? enemy : {};
  const level = Math.max(1, toInteger(source.level, 1));
  const maxHp = Math.max(1, toInteger(source.maxHp ?? source.max_hp, defaultEnemyMaxHp(level)));
  const hp = clampNumber(source.hp ?? maxHp, 0, maxHp, maxHp);
  const defeated = Boolean(source.defeated) || hp <= 0;
  return {
    id: stringValue(source.id).trim(),
    name: stringValue(source.name || "敌人"),
    level,
    rank: stringValue(source.rank || ""),
    hp,
    maxHp,
    armor: Math.max(0, toInteger(source.armor, 0)),
    status: normalizeList(source.status ?? source.statuses ?? source.statusEffects)
      .map((item) => stringValue(item).trim())
      .filter(Boolean),
    defeated,
    intent: stringValue(source.intent || ""),
    description: stringValue(source.description || "")
  };
}

function normalizeSkills(skills, character) {
  const source = Array.isArray(skills) && skills.length
    ? skills
    : defaultSkillsForCharacter(character);
  return source.map(normalizeSkill).filter((skill) => skill.id && skill.name).slice(0, 20);
}

function defaultSkillsForCharacter(character) {
  const characterName = stringValue(character?.name);
  const techniqueName = stringValue(character?.technique?.name);
  if (characterName === "雨宫朔" || techniqueName.includes("雨债")) {
    return DEFAULT_RAIN_DEBT_SKILLS;
  }
  return DEFAULT_GENERIC_SKILLS;
}

function normalizeSkill(skill) {
  const source = isPlainObject(skill) ? skill : {};
  return {
    id: stringValue(source.id).trim(),
    name: stringValue(source.name).trim(),
    type: normalizeSkillEnum(source.type, ["setup", "attack", "finisher", "defense", "support"], "attack"),
    mpCost: Math.max(0, toInteger(source.mpCost ?? source.mp_cost, 0)),
    attribute: ATTRIBUTE_KEYS.includes(stringValue(source.attribute)) ? stringValue(source.attribute) : "technique",
    damageType: normalizeSkillEnum(source.damageType ?? source.damage_type, ["none", "physical", "technique", "cursed_energy", "mind"], "technique"),
    basePower: Math.max(0, Number.isFinite(Number(source.basePower ?? source.base_power)) ? Number(source.basePower ?? source.base_power) : 1),
    cooldown: Math.max(0, toInteger(source.cooldown, 0)),
    currentCooldown: Math.max(0, toInteger(source.currentCooldown ?? source.current_cooldown, 0)),
    description: stringValue(source.description),
    requirements: normalizeList(source.requirements).filter(isPlainObject),
    effects: isPlainObject(source.effects) ? { ...source.effects } : {}
  };
}

function normalizeSkillEnum(value, allowed, fallback) {
  const normalized = stringValue(value).trim();
  return allowed.includes(normalized) ? normalized : fallback;
}

function defaultEnemyMaxHp(level) {
  const table = { 1: 25, 2: 35, 3: 45, 4: 60, 5: 80 };
  return table[Math.max(1, Math.min(5, toInteger(level, 1)))] || 45;
}

function normalizeCharacter(character, legacySource = {}) {
  const source = isPlainObject(character) ? character : {};
  const technique = isPlainObject(source.technique) ? source.technique : {};
  const normalized = {
    ...DEFAULT_CHARACTER,
    ...source,
    name: stringValue(firstValue(source.name, legacySource.character_name, legacySource.characterName, legacySource.name)),
    age: firstValue(source.age, legacySource.age, ""),
    gender: stringValue(source.gender),
    role: stringValue(firstValue(source.role, legacySource.role, legacySource.rank)),
    affiliation: stringValue(source.affiliation),
    rank: stringValue(firstValue(source.rank, legacySource.rank)),
    appearance: stringValue(source.appearance),
    personality: stringValue(source.personality),
    background: stringValue(firstValue(source.background, legacySource.background)),
    coreMotivation: stringValue(firstValue(source.coreMotivation, source.core_motivation)),
    technique: {
      ...DEFAULT_CHARACTER.technique,
      ...technique,
      name: stringValue(firstValue(technique.name, legacySource.technique_name, legacySource.techniqueName)),
      description: stringValue(firstValue(technique.description, legacySource.technique_description, legacySource.techniqueDescription)),
      strengths: normalizeStringArray(technique.strengths),
      weaknesses: normalizeStringArray(technique.weaknesses),
      stages: normalizeStringArray(technique.stages)
    }
  };
  return normalized;
}

function hasLegacyCharacterFields(source) {
  return Boolean(
    source.characterName ||
    source.character_name ||
    source.name ||
    source.techniqueName ||
    source.technique_name ||
    source.techniqueDescription ||
    source.technique_description
  );
}

function normalizeQuestLog(questLog, fallbackObjective = "") {
  const source = isPlainObject(questLog) ? questLog : {};
  const fallbackMain = {
    ...DEFAULT_QUEST_LOG.main,
    description: stringValue(fallbackObjective)
  };
  const main = normalizeQuest(source.main || fallbackMain, "active", fallbackMain);
  return {
    main,
    active: normalizeQuestList(source.active, "active"),
    completed: normalizeQuestList(source.completed, "completed"),
    failed: normalizeQuestList(source.failed, "failed")
  };
}

function normalizeQuestList(value, status) {
  return normalizeList(value)
    .map((quest) => normalizeQuest(quest, status))
    .filter((quest) => quest.id && quest.title)
    .slice(0, 30);
}

function normalizeQuest(value, status, fallback = {}) {
  const source = isPlainObject(value) ? value : {};
  const id = stringValue(source.id ?? fallback.id).trim();
  const title = stringValue(source.title ?? fallback.title).trim();
  const description = stringValue(source.description ?? fallback.description).trim();
  const clues = normalizeList(source.clues)
    .map((clue) => stringValue(clue).trim())
    .filter(Boolean)
    .slice(0, 50);
  return {
    ...source,
    id,
    title,
    description,
    status,
    progress: clampNumber(source.progress ?? fallback.progress, 0, 100, 0),
    ...(clues.length || Array.isArray(source.clues) ? { clues } : {})
  };
}

function deriveObjectiveFromQuestLog(questLog) {
  const activeQuest = questLog?.active?.[0];
  return stringValue(activeQuest?.description || questLog?.main?.description || "").trim();
}

function setResource(state, field, value, log, reason) {
  const max = field === "hp" ? MAX_HP : MAX_MP;
  const old = state[field];
  state[field] = clampNumber(value, 0, max, old);
  logChange(log, field.toUpperCase(), old, state[field], reason);
}

function setFlag(state, flag, value, log, reason) {
  const old = Boolean(state.flags[flag]);
  if (value) state.flags[flag] = true;
  else delete state.flags[flag];
  logChange(log, `Active_Flag.${flag}`, old, value, reason);
}

function setField(state, field, value, log, reason) {
  const old = state[field];
  state[field] = value;
  logChange(log, field, old, value, reason);
}

function setAffinity(state, field, value) {
  if (field === "gojo_affinity") {
    state.gojo_affinity = value;
    state.gojoAffinity = value;
    state.Gojo_Affinity = value;
  } else {
    state.nam_affinity = value;
    state.nanami_affinity = value;
    state.nanamiAffinity = value;
    state.Nanami_Affinity = value;
  }
}

function logChange(log, field, oldValue, newValue, reason) {
  if (oldValue === newValue) return;
  log.push({ field, old: oldValue, new: newValue, reason });
}

function clampNumber(value, min, max, fallback = 0) {
  const number = toInteger(value, fallback);
  return Math.max(min, Math.min(max, number));
}

function toInteger(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isNaN(number) ? fallback : number;
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function stringValue(value) {
  return value === undefined || value === null ? "" : String(value);
}

function isRealValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function isFiniteNumberLike(value) {
  if (value === undefined || value === null || value === "") return false;
  return Number.isFinite(Number(value));
}

function normalizeList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeStringArray(value) {
  if (typeof value === "string") {
    return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }
  return normalizeList(value)
    .map((item) => stringValue(item).trim())
    .filter(Boolean)
    .slice(0, 30);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

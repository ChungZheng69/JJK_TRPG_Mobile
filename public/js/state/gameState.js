import {
  CHARACTER_CONFIG,
  DEFAULT_ATTRIBUTE_MAX,
  DEFAULT_MAX_HP,
  DEFAULT_MAX_MP,
  getInitialGameStateFromCharacterConfig
} from "../config/character_config.js";

export const UNKNOWN = "Unknown";
const ATTRIBUTE_KEYS = ["physique", "technique", "cursed_energy", "mind"];
const GAME_STATE_STORAGE_KEY = "jjk_trpg_game_state";
export const ATTRIBUTE_POINT_BUDGET = 235;
export const ATTRIBUTE_MIN = 30;
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

export const TRPG_STATE = getGlobalStateContainer();
installGlobalGameStateBridge();
if (!TRPG_STATE.gameState || typeof TRPG_STATE.gameState !== "object") {
  commitGameState(createInitialGameState());
} else {
  commitGameState(normalizeGameState(TRPG_STATE.gameState));
}

export function createInitialGameState() {
  const characterState = getInitialGameStateFromCharacterConfig();
  return normalizeGameState({
    ...characterState,
    dice: null,
    lastDice: null,
    sessionSummary: "",
    changeLog: [],
    warnings: [],
    sourceMap: {}
  });
}

export function getGameState() {
  return TRPG_STATE.gameState;
}

export function setGameState(nextState) {
  const incoming = nextState || {};
  const baseState = createInitialGameState();
  if (!incoming.questLog && incoming.objective) delete baseState.questLog;
  const normalized = commitGameState(normalizeGameState({
    ...baseState,
    ...incoming
  }));
  if (normalized.dice && !normalized.lastDice) normalized.lastDice = normalized.dice;
  if (normalized.lastDice && !normalized.dice) normalized.dice = normalized.lastDice;
  return normalized;
}

export function resetGameState() {
  return commitGameState(createInitialGameState());
}

export function resetGameFromCharacterConfig() {
  return commitGameState(normalizeGameState(getInitialGameStateFromCharacterConfig()));
}

export function mergeParsedState(parsed) {
  if (!parsed || typeof parsed !== "object") return getGameState();
  console.log("AFFINITY_INCOMING_STATE", {
    gojo_affinity: parsed.gojo_affinity,
    Gojo_Affinity: parsed.Gojo_Affinity,
    gojoAffinity: parsed.gojoAffinity,
    nam_affinity: parsed.nam_affinity,
    nanami_affinity: parsed.nanami_affinity,
    Nanami_Affinity: parsed.Nanami_Affinity,
    nanamiAffinity: parsed.nanamiAffinity
  });
  const latestWarnings = normalizeWarningList(parsed.warnings);
  const nextState = { ...getGameState() };
  mergeAffinityFields(nextState, parsed);

  for (const [key, value] of Object.entries(parsed)) {
    if (key === "warnings") continue;
    if (isAffinityAlias(key)) continue;
    if (key === "dice" || key === "lastDice") {
      nextState.dice = mergeObjectValue(nextState.dice, value);
      nextState.lastDice = nextState.dice;
      continue;
    }
    if (key === "sourceMap") {
      nextState.sourceMap = { ...(nextState.sourceMap || {}), ...(value || {}) };
      continue;
    }
    if (key === "attributes") {
      if (isValidAttributes(value) || !isValidAttributes(nextState.attributes)) {
        nextState.attributes = value;
      } else {
        console.warn("Ignoring invalid incoming attributes; keeping local attributes");
      }
      continue;
    }
    if (key === "inventory") {
      if (isValidInventory(value) || !isValidInventory(nextState.inventory)) {
        nextState.inventory = value;
      } else {
        console.warn("Ignoring invalid incoming inventory; keeping local inventory");
      }
      continue;
    }
    if (key === "flags") {
      nextState.flags = {
        ...(nextState.flags && typeof nextState.flags === "object" && !Array.isArray(nextState.flags) ? nextState.flags : {}),
        ...(value && typeof value === "object" && !Array.isArray(value) ? value : {})
      };
      continue;
    }
    if (isRealValue(value)) nextState[key] = value;
  }

  nextState.warnings = latestWarnings;
  const mergedState = commitGameState(normalizeGameState(nextState));
  console.log("AFFINITY_MERGED_STATE", {
    gojo_affinity: mergedState.gojo_affinity,
    gojoAffinity: mergedState.gojoAffinity,
    Gojo_Affinity: mergedState.Gojo_Affinity,
    nam_affinity: mergedState.nam_affinity,
    nanami_affinity: mergedState.nanami_affinity,
    nanamiAffinity: mergedState.nanamiAffinity,
    Nanami_Affinity: mergedState.Nanami_Affinity
  });
  return mergedState;
}

export function repairInvalidOutgoingGameState(state = getGameState()) {
  const rawAttributesInvalid = !isValidAttributes(state?.attributes);
  let normalized = normalizeGameState(state);
  if (rawAttributesInvalid || !isValidAttributes(normalized.attributes)) {
    console.warn("Invalid attributes before send; repairing from character_config");
    const storedState = normalizeGameState(readStoredGameState());
    const repairedAttributes = isValidAttributes(storedState.attributes)
      ? storedState.attributes
      : buildAttributesFromCharacterConfig(normalized.attributes?._exp);
    normalized = normalizeGameState({
      ...normalized,
      attributes: repairedAttributes
    });
  }
  return commitGameState(normalized);
}

export function isValidAttributes(attributes) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return false;
  const coreValues = ATTRIBUTE_KEYS.map((key) => attributes[key]);
  if (coreValues.some((value) => value === undefined || value === null || value === "")) return false;
  return !coreValues.every((value) => safeNumber(value, 0) === 0);
}

export function buildAttributesFromCharacterConfig(exp = {}) {
  const configAttrs = CHARACTER_CONFIG.starting_attributes || {};
  const sourceExp = exp && typeof exp === "object" && !Array.isArray(exp) ? exp : {};
  return {
    ...Object.fromEntries(
      ATTRIBUTE_KEYS.map((key) => [key, safeNumber(configAttrs[key], 0)])
    ),
    _exp: Object.fromEntries(
      ATTRIBUTE_KEYS.map((key) => [key, safeNumber(sourceExp[key], 0)])
    )
  };
}

export function normalizeGameState(state = {}) {
  const source = state && typeof state === "object" ? state : {};
  const characterName = firstValue(source.character_name, source.characterName, CHARACTER_CONFIG.character_name);
  const techniqueName = firstValue(source.technique_name, source.techniqueName, CHARACTER_CONFIG.technique_name);
  const techniqueDescription = firstValue(
    source.technique_description,
    source.techniqueDescription,
    CHARACTER_CONFIG.technique_description
  );
  const maxHp = safeNumber(firstValue(source.max_hp, source.maxHp), DEFAULT_MAX_HP);
  const maxMp = safeNumber(firstValue(source.max_mp, source.maxMp), DEFAULT_MAX_MP);
  const attributeMax = safeNumber(firstValue(source.attribute_max, source.attributeMax), DEFAULT_ATTRIBUTE_MAX);
  const gojoAffinity = safeNumber(firstValue(source.gojo_affinity, source.Gojo_Affinity, source.gojoAffinity), 0);
  const nanamiAffinity = safeNumber(
    firstValue(source.nam_affinity, source.nanami_affinity, source.Nanami_Affinity, source.nanamiAffinity),
    0
  );
  const sukunaFingers = safeNumber(firstValue(source.sukuna_fingers, source.sukunaFingers), 0);
  const character = normalizeCharacter(source.character, source);
  if (!source.character && hasLegacyCharacterFields(source)) {
    console.log("CHARACTER_MIGRATED_FROM_OLD_SAVE");
  } else if (!source.character) {
    console.log("CHARACTER_STATE_REPAIRED", {
      name: character.name,
      technique: character.technique.name
    });
  }
  const questLog = normalizeQuestLog(source.questLog, source.objective);
  const objective = deriveObjectiveFromQuestLog(questLog) || firstValue(source.objective, CHARACTER_CONFIG.starting_objective, UNKNOWN);
  const timeline = normalizeTimeline(source.timeline);
  const combat = normalizeCombat(source.combat);
  const skills = normalizeSkills(source.skills, character);

  return {
    ...source,
    character,
    character_name: character.name || characterName,
    characterName: character.name || characterName,
    age: firstValue(character.age, source.age, CHARACTER_CONFIG.age),
    rank: firstValue(character.rank, source.rank, CHARACTER_CONFIG.rank),
    background: firstValue(character.background, source.background, CHARACTER_CONFIG.background),
    technique_name: character.technique.name || techniqueName,
    techniqueName: character.technique.name || techniqueName,
    technique_description: character.technique.description || techniqueDescription,
    techniqueDescription: character.technique.description || techniqueDescription,
    hp: safeNumber(source.hp, safeNumber(CHARACTER_CONFIG.starting_hp, DEFAULT_MAX_HP)),
    max_hp: maxHp,
    maxHp,
    mp: safeNumber(source.mp, safeNumber(CHARACTER_CONFIG.starting_mp, DEFAULT_MAX_MP)),
    max_mp: maxMp,
    maxMp,
    objective,
    questLog,
    timeline,
    combat,
    skills,
    attributes: ensureAttributeExp(source.attributes),
    attribute_max: attributeMax,
    attributeMax,
    inventory: normalizeInventoryState(source.inventory),
    flags: normalizeObjectState(source.flags, CHARACTER_CONFIG.starting_flags),
    gojo_affinity: gojoAffinity,
    gojoAffinity,
    Gojo_Affinity: gojoAffinity,
    nam_affinity: nanamiAffinity,
    nanami_affinity: nanamiAffinity,
    nanamiAffinity,
    Nanami_Affinity: nanamiAffinity,
    sukuna_fingers: sukunaFingers,
    sukunaFingers,
    dice: source.dice ?? null,
    lastDice: source.lastDice ?? source.dice ?? null,
    sessionSummary: normalizeSessionSummaryValue(source.sessionSummary),
    changeLog: Array.isArray(source.changeLog) ? source.changeLog : [],
    warnings: Array.isArray(source.warnings) ? source.warnings : [],
    sourceMap: normalizeObjectState(source.sourceMap)
  };
}

export function createGameStateFromCharacter({ character, attributes, questMode = "custom" } = {}) {
  const normalizedCharacter = normalizeCharacter(character, {});
  const normalizedAttributes = normalizeCreatorAttributes(attributes);
  const maxHp = DEFAULT_MAX_HP;
  const maxMp = DEFAULT_MAX_MP;
  const questLog = createQuestLogForCharacter(normalizedCharacter, questMode);
  const state = normalizeGameState({
    character: normalizedCharacter,
    character_name: normalizedCharacter.name,
    characterName: normalizedCharacter.name,
    technique_name: normalizedCharacter.technique.name,
    techniqueName: normalizedCharacter.technique.name,
    technique_description: normalizedCharacter.technique.description,
    techniqueDescription: normalizedCharacter.technique.description,
    hp: maxHp,
    max_hp: maxHp,
    maxHp,
    mp: maxMp,
    max_mp: maxMp,
    maxMp,
    objective: questLog.active[0]?.description || questLog.main.description,
    attributes: normalizedAttributes,
    attribute_max: DEFAULT_ATTRIBUTE_MAX,
    attributeMax: DEFAULT_ATTRIBUTE_MAX,
    inventory: cloneInventory(CHARACTER_CONFIG.starting_inventory || { items: [] }),
    flags: cloneObject(CHARACTER_CONFIG.starting_flags || {}),
    questLog,
    timeline: cloneObject(CHARACTER_CONFIG.starting_timeline || DEFAULT_TIMELINE),
    combat: cloneObject(CHARACTER_CONFIG.starting_combat || DEFAULT_COMBAT),
    skills: normalizeSkills([], normalizedCharacter),
    sessionSummary: "",
    dice: null,
    lastDice: null,
    changeLog: [],
    warnings: [],
    sourceMap: {}
  });
  return state;
}

export function validateCreatorAttributes(attributes = {}) {
  const normalized = normalizeCreatorAttributes(attributes);
  const total = ATTRIBUTE_KEYS.reduce((sum, key) => sum + safeNumber(normalized[key], 0), 0);
  const invalidKeys = ATTRIBUTE_KEYS.filter((key) => normalized[key] < ATTRIBUTE_MIN || normalized[key] > DEFAULT_ATTRIBUTE_MAX);
  return {
    valid: invalidKeys.length === 0 && total <= ATTRIBUTE_POINT_BUDGET,
    total,
    budget: ATTRIBUTE_POINT_BUDGET,
    invalidKeys,
    overBudget: total > ATTRIBUTE_POINT_BUDGET,
    attributes: normalized
  };
}

function mergeObjectValue(previous, incoming) {
  if (!isRealValue(incoming)) return previous;
  if (!previous || typeof previous !== "object" || Array.isArray(previous)) return incoming;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return incoming;
  const merged = { ...previous };
  for (const [key, value] of Object.entries(incoming)) {
    if (isRealValue(value)) merged[key] = value;
  }
  return merged;
}

function mergeAffinityFields(target, incoming) {
  const gojoAffinity = firstValidNumber(
    incoming.gojo_affinity,
    incoming.Gojo_Affinity,
    incoming.gojoAffinity
  );
  if (gojoAffinity !== undefined) {
    target.gojo_affinity = gojoAffinity;
    target.gojoAffinity = gojoAffinity;
    target.Gojo_Affinity = gojoAffinity;
  }

  const nanamiAffinity = firstValidNumber(
    incoming.nam_affinity,
    incoming.nanami_affinity,
    incoming.Nanami_Affinity,
    incoming.nanamiAffinity
  );
  if (nanamiAffinity !== undefined) {
    target.nam_affinity = nanamiAffinity;
    target.nanami_affinity = nanamiAffinity;
    target.nanamiAffinity = nanamiAffinity;
    target.Nanami_Affinity = nanamiAffinity;
  }
}

function normalizeSessionSummaryValue(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return text === UNKNOWN ? "" : text;
}

function isAffinityAlias(key) {
  return [
    "gojo_affinity",
    "Gojo_Affinity",
    "gojoAffinity",
    "nam_affinity",
    "nanami_affinity",
    "Nanami_Affinity",
    "nanamiAffinity"
  ].includes(key);
}

function firstValidNumber(...values) {
  for (const value of values) {
    if (isValidNumberValue(value)) return safeNumber(value, 0);
  }
  return undefined;
}

function isValidNumberValue(value) {
  if (value === undefined || value === null || value === "" || value === UNKNOWN) return false;
  const number = Number.parseInt(value, 10);
  return !Number.isNaN(number);
}

function isRealValue(value) {
  if (value === undefined || value === null || value === "" || value === UNKNOWN) return false;
  return true;
}

function normalizeWarningList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function ensureAttributeExp(attributes) {
  const source = attributes && typeof attributes === "object" && !Array.isArray(attributes)
    ? attributes
    : {};
  const next = { ...source };
  const configAttributes = buildAttributesFromCharacterConfig(source._exp);
  for (const key of ATTRIBUTE_KEYS) {
    next[key] = safeNumber(source[key], configAttributes[key]);
  }
  const sourceExp = source._exp && typeof source._exp === "object" && !Array.isArray(source._exp)
    ? source._exp
    : {};
  next._exp = Object.fromEntries(
    ATTRIBUTE_KEYS.map((key) => [key, safeNumber(sourceExp[key], 0)])
  );
  return next;
}

function normalizeInventoryState(inventory) {
  if (Array.isArray(inventory)) {
    return { items: inventory };
  }
  if (inventory && typeof inventory === "object" && !Array.isArray(inventory)) {
    const items = Array.isArray(inventory.items) ? inventory.items : [];
    return { ...inventory, items };
  }
  return cloneInventory(CHARACTER_CONFIG.starting_inventory);
}

function normalizeObjectState(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : cloneObject(fallback);
}

function normalizeTimeline(timeline) {
  const configTimeline = CHARACTER_CONFIG.starting_timeline || DEFAULT_TIMELINE;
  const source = timeline && typeof timeline === "object" && !Array.isArray(timeline)
    ? timeline
    : configTimeline;
  return {
    turn: Math.max(1, safeNumber(source.turn, DEFAULT_TIMELINE.turn)),
    day: stringOrEmpty(source.day || DEFAULT_TIMELINE.day),
    timeOfDay: stringOrEmpty(source.timeOfDay || source.time_of_day || DEFAULT_TIMELINE.timeOfDay),
    location: stringOrEmpty(source.location || DEFAULT_TIMELINE.location),
    scene: stringOrEmpty(source.scene || DEFAULT_TIMELINE.scene)
  };
}

function normalizeCombat(combat) {
  const configCombat = CHARACTER_CONFIG.starting_combat || DEFAULT_COMBAT;
  const source = combat && typeof combat === "object" && !Array.isArray(combat)
    ? combat
    : configCombat;
  const enemies = Array.isArray(source.enemies)
    ? source.enemies.map(normalizeEnemy).filter((enemy) => enemy.id).slice(0, 12)
    : [];
  const active = Boolean(source.active) && enemies.some((enemy) => !enemy.defeated && Number(enemy.hp || 0) > 0);
  const currentEnemyId = active && source.currentEnemyId && enemies.some((enemy) => enemy.id === source.currentEnemyId && !enemy.defeated)
    ? String(source.currentEnemyId)
    : active
      ? enemies.find((enemy) => !enemy.defeated && Number(enemy.hp || 0) > 0)?.id || null
      : null;
  return {
    active,
    round: Math.max(0, safeNumber(source.round, 0)),
    enemies,
    currentEnemyId,
    playerStance: stringOrEmpty(source.playerStance || "neutral"),
    lastDamageDealt: Math.max(0, safeNumber(source.lastDamageDealt, 0)),
    lastDamageTaken: Math.max(0, safeNumber(source.lastDamageTaken, 0)),
    combatLog: (Array.isArray(source.combatLog) ? source.combatLog : [])
      .map((entry) => typeof entry === "string" ? entry : stringOrEmpty(entry?.text || entry?.message || entry))
      .filter(Boolean)
      .slice(-10)
  };
}

function normalizeEnemy(enemy) {
  const source = enemy && typeof enemy === "object" && !Array.isArray(enemy) ? enemy : {};
  const level = Math.max(1, safeNumber(source.level, 1));
  const maxHp = Math.max(1, safeNumber(source.maxHp ?? source.max_hp, defaultEnemyMaxHp(level)));
  const hp = clampNumber(source.hp ?? maxHp, 0, maxHp, maxHp);
  const defeated = Boolean(source.defeated) || hp <= 0;
  return {
    id: stringOrEmpty(source.id).trim(),
    name: stringOrEmpty(source.name || "敌人"),
    level,
    rank: stringOrEmpty(source.rank),
    hp,
    maxHp,
    armor: Math.max(0, safeNumber(source.armor, 0)),
    status: normalizeEnemyStatus(source),
    defeated,
    intent: stringOrEmpty(source.intent),
    description: stringOrEmpty(source.description)
  };
}

function normalizeEnemyStatus(source) {
  const raw = Array.isArray(source.status)
    ? source.status
    : Array.isArray(source.statuses)
      ? source.statuses
      : Array.isArray(source.statusEffects)
        ? source.statusEffects
        : [];
  return raw.map((item) => stringOrEmpty(item).trim()).filter(Boolean);
}

function normalizeSkills(skills, character) {
  const source = Array.isArray(skills) && skills.length
    ? skills
    : defaultSkillsForCharacter(character);
  return source.map(normalizeSkill).filter((skill) => skill.id && skill.name).slice(0, 20);
}

function defaultSkillsForCharacter(character) {
  const characterName = stringOrEmpty(character?.name);
  const techniqueName = stringOrEmpty(character?.technique?.name);
  if (characterName === "\u96e8\u5bab\u6714" || techniqueName.includes("\u96e8\u503a")) {
    return cloneObjectArray(CHARACTER_CONFIG.starting_skills || []);
  }
  return cloneObjectArray(DEFAULT_GENERIC_SKILLS);
}

function normalizeSkill(skill) {
  const source = skill && typeof skill === "object" && !Array.isArray(skill) ? skill : {};
  return {
    id: stringOrEmpty(source.id).trim(),
    name: stringOrEmpty(source.name).trim(),
    type: normalizeSkillEnum(source.type, ["setup", "attack", "finisher", "defense", "support"], "attack"),
    mpCost: Math.max(0, safeNumber(source.mpCost ?? source.mp_cost, 0)),
    attribute: ATTRIBUTE_KEYS.includes(stringOrEmpty(source.attribute)) ? stringOrEmpty(source.attribute) : "technique",
    damageType: normalizeSkillEnum(source.damageType ?? source.damage_type, ["none", "physical", "technique", "cursed_energy", "mind"], "technique"),
    basePower: Math.max(0, Number.isFinite(Number(source.basePower ?? source.base_power)) ? Number(source.basePower ?? source.base_power) : 1),
    cooldown: Math.max(0, safeNumber(source.cooldown, 0)),
    currentCooldown: Math.max(0, safeNumber(source.currentCooldown ?? source.current_cooldown, 0)),
    description: stringOrEmpty(source.description),
    requirements: Array.isArray(source.requirements) ? source.requirements.filter((item) => item && typeof item === "object") : [],
    effects: source.effects && typeof source.effects === "object" && !Array.isArray(source.effects) ? { ...source.effects } : {}
  };
}

function normalizeSkillEnum(value, allowed, fallback) {
  const normalized = stringOrEmpty(value).trim();
  return allowed.includes(normalized) ? normalized : fallback;
}

function defaultEnemyMaxHp(level) {
  return {
    1: 25,
    2: 35,
    3: 45,
    4: 60,
    5: 80
  }[Math.max(1, Math.min(5, safeNumber(level, 1)))] || 45;
}

function normalizeCharacter(character, legacySource = {}) {
  const source = character && typeof character === "object" && !Array.isArray(character)
    ? character
    : {};
  const configCharacter = CHARACTER_CONFIG.character || {};
  const technique = source.technique && typeof source.technique === "object" && !Array.isArray(source.technique)
    ? source.technique
    : {};
  const configTechnique = configCharacter.technique || {};
  const normalized = {
    name: stringOrEmpty(firstValue(source.name, legacySource.character_name, legacySource.characterName, legacySource.name, configCharacter.name, CHARACTER_CONFIG.character_name)),
    age: firstValue(source.age, legacySource.age, configCharacter.age, CHARACTER_CONFIG.age, ""),
    gender: stringOrEmpty(firstValue(source.gender, configCharacter.gender)),
    role: stringOrEmpty(firstValue(source.role, legacySource.role, configCharacter.role, legacySource.rank, CHARACTER_CONFIG.rank)),
    affiliation: stringOrEmpty(firstValue(source.affiliation, configCharacter.affiliation)),
    rank: stringOrEmpty(firstValue(source.rank, legacySource.rank, configCharacter.rank, CHARACTER_CONFIG.rank)),
    appearance: stringOrEmpty(firstValue(source.appearance, configCharacter.appearance)),
    personality: stringOrEmpty(firstValue(source.personality, configCharacter.personality)),
    background: stringOrEmpty(firstValue(source.background, legacySource.background, configCharacter.background, CHARACTER_CONFIG.background)),
    coreMotivation: stringOrEmpty(firstValue(source.coreMotivation, source.core_motivation, configCharacter.coreMotivation)),
    technique: {
      name: stringOrEmpty(firstValue(technique.name, legacySource.technique_name, legacySource.techniqueName, configTechnique.name, CHARACTER_CONFIG.technique_name)),
      description: stringOrEmpty(firstValue(technique.description, legacySource.technique_description, legacySource.techniqueDescription, configTechnique.description, CHARACTER_CONFIG.technique_description)),
      strengths: normalizeStringArray(firstValue(technique.strengths, configTechnique.strengths)),
      weaknesses: normalizeStringArray(firstValue(technique.weaknesses, configTechnique.weaknesses)),
      stages: normalizeStringArray(firstValue(technique.stages, configTechnique.stages))
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

function normalizeCreatorAttributes(attributes = {}) {
  const source = attributes && typeof attributes === "object" && !Array.isArray(attributes)
    ? attributes
    : {};
  const exp = source._exp && typeof source._exp === "object" && !Array.isArray(source._exp) ? source._exp : {};
  return {
    ...Object.fromEntries(
      ATTRIBUTE_KEYS.map((key) => [key, clampNumber(source[key], ATTRIBUTE_MIN, DEFAULT_ATTRIBUTE_MAX, ATTRIBUTE_MIN)])
    ),
    _exp: Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, safeNumber(exp[key], 0)]))
  };
}

function createQuestLogForCharacter(character, questMode = "custom") {
  const isDefaultAmemiya = character?.name === "\u96e8\u5bab\u6714" || questMode === "default";
  if (isDefaultAmemiya) return cloneObject(CHARACTER_CONFIG.starting_quest_log || {});
  return {
    main: {
      id: "main_001",
      title: "\u5bfb\u627e\u81ea\u5df1\u7684\u672f\u5e08\u9053\u8def",
      description: "\u4f5c\u4e3a\u672f\u5e08\u786e\u7acb\u81ea\u5df1\u7684\u9053\u8def\uff0c\u5bfb\u627e\u503c\u5f97\u8ffd\u968f\u6216\u5fc5\u987b\u6297\u4e89\u7684\u7b54\u6848\u3002",
      status: "active",
      progress: 0
    },
    active: [],
    completed: [],
    failed: []
  };
}

function normalizeQuestLog(questLog, fallbackObjective = "") {
  const configQuestLog = CHARACTER_CONFIG.starting_quest_log || {};
  const hasQuestLog = questLog && typeof questLog === "object" && !Array.isArray(questLog);
  const source = hasQuestLog ? questLog : {};
  const fallbackDescription = stringOrEmpty(fallbackObjective).trim();
  const fallbackMain = hasQuestLog
    ? (configQuestLog.main || {
      id: "main_001",
      title: "Main Quest",
      description: fallbackDescription || stringOrEmpty(CHARACTER_CONFIG.starting_objective),
      status: "active",
      progress: 0
    })
    : {
    id: "main_001",
    title: "Main Quest",
    description: fallbackDescription || stringOrEmpty(CHARACTER_CONFIG.starting_objective),
    status: "active",
    progress: 0
  };
  return {
    main: normalizeQuest(source.main || fallbackMain, "active", fallbackMain),
    active: normalizeQuestList(source.active, "active"),
    completed: normalizeQuestList(source.completed, "completed"),
    failed: normalizeQuestList(source.failed, "failed")
  };
}

function normalizeQuestList(value, status) {
  return (Array.isArray(value) ? value : [])
    .map((quest) => normalizeQuest(quest, status))
    .filter((quest) => quest.id && quest.title)
    .slice(0, 30);
}

function normalizeQuest(value, status, fallback = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const clues = Array.isArray(source.clues)
    ? source.clues.map((clue) => stringOrEmpty(clue).trim()).filter(Boolean).slice(0, 50)
    : [];
  return {
    ...source,
    id: stringOrEmpty(source.id ?? fallback.id).trim(),
    title: stringOrEmpty(source.title ?? fallback.title).trim(),
    description: stringOrEmpty(source.description ?? fallback.description).trim(),
    status,
    progress: clampNumber(source.progress ?? fallback.progress, 0, 100, 0),
    ...(clues.length || Array.isArray(source.clues) ? { clues } : {})
  };
}

function deriveObjectiveFromQuestLog(questLog) {
  return stringOrEmpty(questLog?.active?.[0]?.description || questLog?.main?.description || "").trim();
}

function safeNumber(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isNaN(number) ? fallback : number;
}

function clampNumber(value, min, max, fallback = 0) {
  return Math.max(min, Math.min(max, safeNumber(value, fallback)));
}

function stringOrEmpty(value) {
  return value === undefined || value === null || value === UNKNOWN ? "" : String(value);
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function getGlobalStateContainer() {
  const root = globalThis;
  if (!root.TRPG_STATE || typeof root.TRPG_STATE !== "object") root.TRPG_STATE = {};
  if (!root.TRPG_STATE.gameState && root.gameState && typeof root.gameState === "object") {
    root.TRPG_STATE.gameState = root.gameState;
  }
  return root.TRPG_STATE;
}

function installGlobalGameStateBridge() {
  const root = globalThis;
  const descriptor = Object.getOwnPropertyDescriptor(root, "gameState");
  if (descriptor?.get && descriptor?.set) return;
  Object.defineProperty(root, "gameState", {
    configurable: true,
    get() {
      return TRPG_STATE.gameState;
    },
    set(value) {
      TRPG_STATE.gameState = normalizeGameState(value);
    }
  });
}

function commitGameState(nextState) {
  TRPG_STATE.gameState = nextState;
  globalThis.gameState = TRPG_STATE.gameState;
  return TRPG_STATE.gameState;
}

function cloneInventory(value) {
  const cloned = cloneObject(value || { items: [] });
  if (!Array.isArray(cloned.items)) cloned.items = [];
  return cloned;
}

function cloneObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

function cloneObjectArray(value) {
  return Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : [];
}

function normalizeStringArray(value) {
  if (typeof value === "string") {
    return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringOrEmpty(item).trim()).filter(Boolean);
}

function readStoredGameState() {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(GAME_STATE_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function isValidInventory(inventory) {
  if (!inventory || inventory === UNKNOWN) return false;
  if (typeof inventory === "string") return inventory.trim() !== "" && inventory !== UNKNOWN;
  if (Array.isArray(inventory)) return true;
  return typeof inventory === "object";
}

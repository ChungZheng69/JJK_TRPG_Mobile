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
    sessionSummary: UNKNOWN,
    changeLog: [],
    warnings: [],
    sourceMap: {}
  });
}

export function getGameState() {
  return TRPG_STATE.gameState;
}

export function setGameState(nextState) {
  const normalized = commitGameState(normalizeGameState({
    ...createInitialGameState(),
    ...(nextState || {})
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

export function buildDifyInputsFromGameState() {
  const state = TRPG_STATE.gameState;
  const normalized = repairInvalidOutgoingGameState(state);
  const attributes = ensureAttributeExp(normalized.attributes);
  const inventory = normalizeInventoryState(normalized.inventory);
  const flags = normalizeObjectState(normalized.flags);
  const payload = {
    Current_HP: safeNumber(normalized.hp, 0),
    Current_MP: safeNumber(normalized.mp, 0),
    Attributes: JSON.stringify(attributes),
    Inventory: JSON.stringify(inventory),
    Active_Flag: JSON.stringify(flags),
    current_Objective: stringOrEmpty(normalized.objective),
    Gojo_Affinity: safeNumber(normalized.gojo_affinity ?? normalized.gojoAffinity, 0),
    Nanami_Affinity: safeNumber(normalized.nam_affinity ?? normalized.nanamiAffinity, 0),
    sukuna_fingers: safeNumber(normalized.sukuna_fingers ?? normalized.sukunaFingers, 0)
  };

  payload.state_updates_json = JSON.stringify({
    Current_HP: payload.Current_HP,
    Current_MP: payload.Current_MP,
    Attributes: attributes,
    Inventory: inventory,
    Active_Flag: flags,
    current_Objective: payload.current_Objective,
    Gojo_Affinity: payload.Gojo_Affinity,
    Nanami_Affinity: payload.Nanami_Affinity,
    sukuna_fingers: payload.sukuna_fingers
  });

  return payload;
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

  return {
    ...source,
    character_name: characterName,
    characterName,
    age: firstValue(source.age, CHARACTER_CONFIG.age),
    rank: firstValue(source.rank, CHARACTER_CONFIG.rank),
    background: firstValue(source.background, CHARACTER_CONFIG.background),
    technique_name: techniqueName,
    techniqueName,
    technique_description: techniqueDescription,
    techniqueDescription,
    hp: safeNumber(source.hp, safeNumber(CHARACTER_CONFIG.starting_hp, DEFAULT_MAX_HP)),
    max_hp: maxHp,
    maxHp,
    mp: safeNumber(source.mp, safeNumber(CHARACTER_CONFIG.starting_mp, DEFAULT_MAX_MP)),
    max_mp: maxMp,
    maxMp,
    objective: firstValue(source.objective, CHARACTER_CONFIG.starting_objective, UNKNOWN),
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
    sessionSummary: firstValue(source.sessionSummary, UNKNOWN),
    changeLog: Array.isArray(source.changeLog) ? source.changeLog : [],
    warnings: Array.isArray(source.warnings) ? source.warnings : [],
    sourceMap: normalizeObjectState(source.sourceMap)
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

function safeNumber(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isNaN(number) ? fallback : number;
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

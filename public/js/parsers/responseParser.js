import { stripThinkBlocks } from "../utils/sanitize.js";
import {
  extractJsonCodeBlocks,
  extractLikelyJsonObjects,
  extractNamedJsonPayloads,
  safeJsonParse as strictJsonParse
} from "./jsonExtractor.js";

const UNKNOWN = "Unknown";
const OUTCOME_LLM_MARKER = "【OUTCOME_LLM_ACTIVE】";

const FIELD_PATHS = {
  hp: [
    "hp",
    "Current_HP",
    "current_hp",
    "state.Current_HP",
    "state.hp",
    "game_state.hp",
    "game_state.Current_HP"
  ],
  maxHp: [
    "max_hp",
    "Max_HP",
    "state.max_hp",
    "state.Max_HP",
    "game_state.max_hp",
    "game_state.Max_HP"
  ],
  mp: [
    "mp",
    "Current_MP",
    "current_mp",
    "state.Current_MP",
    "state.mp",
    "game_state.mp",
    "game_state.Current_MP"
  ],
  maxMp: [
    "max_mp",
    "Max_MP",
    "state.max_mp",
    "state.Max_MP",
    "game_state.max_mp",
    "game_state.Max_MP"
  ],
  objective: [
    "objective",
    "current_Objective",
    "current_objective",
    "objective_output",
    "state.current_Objective",
    "state.current_objective",
    "state.objective",
    "game_state.objective",
    "player_visible_summary.objective_text",
    "suggested_state_update.objective_text_zh"
  ],
  inventory: [
    "inventory",
    "Inventory",
    "inventory_output",
    "state.Inventory",
    "state.inventory",
    "game_state.inventory"
  ],
  attributes: [
    "attributes",
    "Attributes",
    "attributes_output",
    "state.Attributes",
    "state.attributes",
    "game_state.attributes"
  ],
  attributeMax: [
    "attribute_max",
    "Attribute_Max",
    "state.attribute_max",
    "state.Attribute_Max",
    "game_state.attribute_max",
    "game_state.Attribute_Max"
  ],
  flags: [
    "flags",
    "Active_Flag",
    "Active_Flags",
    "active_flags",
    "state.Active_Flag",
    "state.Active_Flags",
    "game_state.flags"
  ],
  sukunaFingers: [
    "sukuna_fingers",
    "sukuna_fingers_output",
    "su_kuna_fingers",
    "state.sukuna_fingers"
  ],
  gojoAffinity: [
    "gojo_affinity",
    "Gojo_Affinity",
    "gojoAffinity",
    "state.Gojo_Affinity",
    "state.gojo_affinity",
    "state.gojoAffinity",
    "game_state.gojo_affinity",
    "game_state.Gojo_Affinity",
    "game_state.gojoAffinity"
  ],
  nanamiAffinity: [
    "nam_affinity",
    "nanami_affinity",
    "Nanami_Affinity",
    "nanamiAffinity",
    "state.Nanami_Affinity",
    "state.nam_affinity",
    "state.nanami_affinity",
    "state.nanamiAffinity",
    "game_state.nam_affinity",
    "game_state.nanami_affinity",
    "game_state.Nanami_Affinity",
    "game_state.nanamiAffinity"
  ],
  sessionSummary: [
    "Session_Summary",
    "session_summary",
    "state.Session_Summary",
    "state.session_summary",
    "game_state.Session_Summary",
    "game_state.session_summary"
  ]
};

const DICE_OBJECT_PATHS = [
  "dice",
  "dice_result",
  "dice_result_json",
  "game_state.dice",
  "full_response_payload.dice",
  "full_response_payload_json.dice"
];

const DICE_FIELD_PATHS = {
  dice: ["dice", "check", "check_type"],
  attribute: ["attribute"],
  base_attribute: ["base_attribute", "attribute_value", "attribute_score"],
  difficulty: ["difficulty", "difficulty_modifier"],
  final_target: ["final_target", "target"],
  roll: ["roll", "dice_roll"],
  result: ["result"],
  success: ["success"],
  critical_success: ["critical_success"],
  critical_failure: ["critical_failure"],
  critical: ["critical"]
};

const NESTED_PAYLOAD_KEYS = [
  "frontend_state_json",
  "full_response_json",
  "p_visible_summary_json",
  "full_response_payload_json",
  "full_response_payload",
  "player_visible_summary_json",
  "player_visible_summary",
  "dice_result_json",
  "dice_result",
  "state_change_log_json",
  "state_change_log",
  "parser_warnings_json",
  "parser_warnings"
];

export function parseDifyAnswer(answer, apiPayload = {}) {
  const warnings = [];
  const rawText = String(
    answer || apiPayload?.answer || apiPayload?.data?.answer || apiPayload?.message || ""
  );
  console.log("RAW_FINAL_ANSWER", rawText);
  const withoutThink = stripThinkBlocks(rawText);
  const cleanedPlanning = removeAccidentalPlanningText(withoutThink);
  const { textWithoutJson, jsonBlocks } = extractJsonCodeBlocks(cleanedPlanning);
  const inlineObjects = extractLikelyJsonObjects(textWithoutJson, warnings);
  const namedObjects = extractNamedJsonPayloads(textWithoutJson, warnings);
  const rawJsonObjects = extractRawJsonObjects(cleanedPlanning);
  const allJsonBlocks = uniqueJsonBlocks([
    ...jsonBlocks,
    ...inlineObjects.map((item) => item.raw),
    ...namedObjects.map((item) => `${item.name}: ${item.raw}`),
    ...rawJsonObjects
  ]);
  console.log("EXTRACTED_JSON_BLOCKS", allJsonBlocks);
  const answerFrontendState = findFrontendStateJson({
    rawText: cleanedPlanning,
    jsonBlocks: allJsonBlocks,
    inlineObjects,
    namedObjects,
    warnings
  });
  const payloadFrontendState = findFrontendStateJsonFromPayload(apiPayload, warnings);
  const chosenFrontendState = answerFrontendState || payloadFrontendState;
  const debugStateJson = chosenFrontendState?.block ?? null;
  console.log("SELECTED_FRONTEND_STATE_JSON", debugStateJson);
  console.log(
    "SELECTED_FRONTEND_STATE_JSON.game_state.gojo_affinity",
    debugStateJson?.game_state?.gojo_affinity
  );

  const state = { warnings, sourceMap: {} };

  if (debugStateJson) {
    mergeDebugJsonIntoState(state, debugStateJson, chosenFrontendState?.source || "frontend_state_json");
  } else {
    warnings.push("No frontend_state_json block with game_state and dice was selected.");
  }

  enrichDiceFromState(state);

  if (apiPayload?.conversation_id) {
    setField(state, "conversationId", apiPayload.conversation_id, "response.conversation_id");
  }
  const displayText = buildVisibleTextAfterParse(textWithoutJson, allJsonBlocks).trim() || cleanedPlanning;

  return {
    displayText,
    rawJsonBlocks: allJsonBlocks,
    debugStateJson,
    chosenFrontendStateBlock: debugStateJson,
    chosenFrontendStateBlockIndex: chosenFrontendState?.index ?? -1,
    selectedFrontendStateJson: debugStateJson,
    selectedDiceObject: state.dice || null,
    state
  };
}

function stripDebugJsonFromDisplay(text, rawJsonBlocks) {
  let cleaned = text || "";
  for (const block of rawJsonBlocks || []) {
    const raw = String(block || "");
    cleaned = cleaned.replace(raw, "");
    const colonIndex = raw.indexOf(":");
    if (colonIndex > 0) {
      cleaned = cleaned.replace(raw.slice(colonIndex + 1).trim(), "");
    }
  }
  return cleaned.replace(/\n{3,}/g, "\n\n");
}

function buildVisibleTextAfterParse(text, rawJsonBlocks) {
  let cleaned = stripDebugJsonFromDisplay(text, rawJsonBlocks).trim();
  const markerIndex = cleaned.lastIndexOf(OUTCOME_LLM_MARKER);
  if (markerIndex >= 0) {
    cleaned = cleaned.slice(markerIndex).trim();
  }
  return cleaned;
}

function uniqueJsonBlocks(blocks) {
  const seen = new Set();
  const unique = [];
  for (const block of blocks || []) {
    const raw = String(block || "").trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    unique.push(raw);
  }
  return unique;
}

export function findFrontendStateJson({ rawText = "", jsonBlocks = [], inlineObjects = [], namedObjects = [], warnings = [] }) {
  const candidates = [];

  jsonBlocks.forEach((block, index) => {
    addDebugCandidate(candidates, block, index, `answer.json_block[${index + 1}]`, warnings);
  });

  inlineObjects.forEach((item, index) => {
    addDebugCandidate(candidates, item.value ?? item.raw, jsonBlocks.length + index, `answer.inline_json[${index + 1}]`, warnings);
  });

  namedObjects.forEach((item) => {
    addDebugCandidate(candidates, item.value ?? item.raw, -1, `answer.${item.name}`, warnings);
  });

  extractRawJsonObjects(rawText).forEach((raw, index) => {
    addDebugCandidate(candidates, raw, jsonBlocks.length + inlineObjects.length + index, `answer.raw_json[${index + 1}]`, warnings);
  });

  const ranked = candidates
    .map((candidate) => ({ ...candidate, priority: frontendStatePriority(candidate.value) }))
    .filter((candidate) => candidate.priority > 0)
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return b.index - a.index;
    });

  const chosen = ranked[0];
  return chosen
    ? { block: normalizeSelectedFrontendStateBlock(chosen.value), index: chosen.index, source: chosen.source, priority: chosen.priority }
    : null;
}

function findFrontendStateJsonFromPayload(apiPayload, warnings = []) {
  const candidates = [];
  addPayloadFrontendCandidates(candidates, apiPayload, "response", warnings);
  addPayloadFrontendCandidates(candidates, apiPayload?.data, "response.data", warnings);
  addPayloadFrontendCandidates(candidates, apiPayload?.metadata, "response.metadata", warnings);
  addPayloadFrontendCandidates(candidates, apiPayload?.metadata?.outputs, "response.metadata.outputs", warnings);
  addPayloadFrontendCandidates(candidates, apiPayload?.outputs, "response.outputs", warnings);

  const ranked = candidates
    .map((candidate) => ({ ...candidate, priority: frontendStatePriority(candidate.value) }))
    .filter((candidate) => candidate.priority > 0)
    .sort((a, b) => b.priority - a.priority);

  const chosen = ranked[0];
  return chosen
    ? { block: normalizeSelectedFrontendStateBlock(chosen.value), index: chosen.index, source: chosen.source, priority: chosen.priority }
    : null;
}

function addPayloadFrontendCandidates(candidates, value, source, warnings) {
  if (!value || typeof value !== "object") return;
  addDebugCandidate(candidates, value, -1, source, warnings);
  for (const payload of findNestedPayloads(value, source, warnings)) {
    addDebugCandidate(candidates, payload.value, -1, payload.source, warnings);
  }
}

function addDebugCandidate(candidates, value, index, source, warnings) {
  const parsed = deepParseJsonStrings(parseMaybeJsonString(value, warnings), warnings);
  if (parsed && typeof parsed === "object") {
    candidates.push({ index, source, value: parsed });
    for (const payload of findNestedPayloads(parsed, source, warnings)) {
      candidates.push({ index, source: payload.source, value: payload.value });
    }
  }
}

function frontendStatePriority(value) {
  if (!value || typeof value !== "object") return 0;
  if (isMechanicsJsonBlock(value)) return 0;
  if (value.game_state && value.dice) return 500;
  if (value.game_state && Array.isArray(value.state_change_log)) return 400;
  if (value.game_state && Array.isArray(value.applied_updates)) return 390;
  if (value.player_visible_summary && value.state && value.debug) return 100;
  return 0;
}

function normalizeSelectedFrontendStateBlock(value) {
  if (!value || typeof value !== "object") return value;
  if (value.game_state) return value;
  if (value.player_visible_summary && value.state && value.debug) {
    return {
      game_state: normalizeLegacyStateToGameState(value.state),
      dice: value.debug?.dice_result || value.debug?.dice || value.dice || {},
      state_change_log: value.debug?.state_change_log || value.state_change_log || [],
      parser_warnings: value.debug?.parser_warnings || value.parser_warnings || []
    };
  }
  return value;
}

function normalizeLegacyStateToGameState(state) {
  const parsed = parseMaybeJsonString(state);
  if (!parsed || typeof parsed !== "object") return {};
  return {
    hp: parsed.hp ?? parsed.Current_HP ?? parsed.current_hp,
    max_hp: parsed.max_hp ?? parsed.Max_HP,
    mp: parsed.mp ?? parsed.Current_MP ?? parsed.current_mp,
    max_mp: parsed.max_mp ?? parsed.Max_MP,
    objective: parsed.objective ?? parsed.current_Objective ?? parsed.current_objective,
    inventory: normalizeInventory(parsed.inventory ?? parsed.Inventory),
    attributes: normalizeAttributes(parsed.attributes ?? parsed.Attributes),
    attribute_max: parsed.attribute_max ?? parsed.Attribute_Max,
    flags: normalizeFlags(parsed.flags ?? parsed.Active_Flag ?? parsed.active_flags),
    sukuna_fingers: parsed.sukuna_fingers ?? parsed.sukunaFingers,
    gojo_affinity: parsed.gojo_affinity ?? parsed.Gojo_Affinity ?? parsed.gojoAffinity,
    nam_affinity: parsed.nam_affinity ?? parsed.nanami_affinity ?? parsed.Nanami_Affinity ?? parsed.nanamiAffinity
  };
}

function isMechanicsJsonBlock(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (
        Object.prototype.hasOwnProperty.call(value, "mechanics") ||
        Object.prototype.hasOwnProperty.call(value, "suggested_state_update") ||
        Object.prototype.hasOwnProperty.call(value, "narration_zh")
      )
  );
}

function extractRawJsonObjects(text) {
  const found = [];
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    const raw = balancedJsonFrom(text, start);
    if (raw) found.push(raw);
  }
  return found;
}

function balancedJsonFrom(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function isDebugStateJson(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (
        value.game_state ||
        value.dice ||
        Array.isArray(value.state_change_log) ||
        Array.isArray(value.parser_warnings)
      )
  );
}

function mergeDebugJsonIntoState(target, debugStateJson, source) {
  const gameState = debugStateJson.game_state || {};

  setField(target, "hp", gameState.hp, `${source}.game_state.hp`);
  setField(target, "maxHp", gameState.max_hp, `${source}.game_state.max_hp`);
  setField(target, "mp", gameState.mp, `${source}.game_state.mp`);
  setField(target, "maxMp", gameState.max_mp, `${source}.game_state.max_mp`);
  setField(target, "objective", gameState.objective, `${source}.game_state.objective`);
  setField(target, "sukunaFingers", gameState.sukuna_fingers, `${source}.game_state.sukuna_fingers`);
  const gojoAffinity = firstRealValue(gameState.gojo_affinity, gameState.Gojo_Affinity, gameState.gojoAffinity);
  const nanamiAffinity = firstRealValue(
    gameState.nam_affinity,
    gameState.nanami_affinity,
    gameState.Nanami_Affinity,
    gameState.nanamiAffinity
  );
  setField(target, "gojo_affinity", gojoAffinity, `${source}.game_state.gojo_affinity`);
  setField(target, "gojoAffinity", gojoAffinity, `${source}.game_state.gojo_affinity`);
  setField(target, "nam_affinity", nanamiAffinity, `${source}.game_state.nam_affinity`);
  setField(target, "nanamiAffinity", nanamiAffinity, `${source}.game_state.nam_affinity`);
  setField(target, "inventory", normalizeInventory(gameState.inventory), `${source}.game_state.inventory`);
  setField(target, "attributes", normalizeAttributes(gameState.attributes), `${source}.game_state.attributes`);
  setField(target, "attributeMax", gameState.attribute_max, `${source}.game_state.attribute_max`);
  setField(target, "flags", normalizeFlags(gameState.flags), `${source}.game_state.flags`);

  const dice = normalizeDiceFromDebug(debugStateJson.dice || {});
  mergeDice(target, dice, `${source}.dice`);
  if (target.dice) {
    target.lastDice = target.dice;
    target.sourceMap.lastDice = `${source}.dice`;
  }

  if (Array.isArray(debugStateJson.state_change_log)) {
    setField(target, "changeLog", debugStateJson.state_change_log, `${source}.state_change_log`);
  } else if (Array.isArray(debugStateJson.applied_updates)) {
    setField(target, "changeLog", debugStateJson.applied_updates, `${source}.applied_updates`);
  }

  if (Array.isArray(debugStateJson.parser_warnings)) {
    target.warnings = mergeWarnings(target.warnings, debugStateJson.parser_warnings);
    target.sourceMap.warnings = `${source}.parser_warnings`;
  }
}

function buildCandidates({ apiPayload, jsonBlocks, inlineObjects, namedObjects, warnings }) {
  const candidates = [];
  addCandidate(candidates, apiPayload, "response", warnings);
  addCandidate(candidates, apiPayload?.data, "response.data", warnings);

  jsonBlocks.forEach((block, index) => {
    addCandidate(candidates, block, `answer.json_block[${index + 1}]`, warnings);
  });

  inlineObjects.forEach((item, index) => {
    addCandidate(candidates, item.value, `answer.inline_json[${index + 1}]`, warnings);
  });

  namedObjects.forEach((item) => {
    const parsedValue = parseMaybeJsonString(item.value ?? item.raw, warnings);
    addCandidate(candidates, { [item.name]: parsedValue }, `answer.${item.name}`, warnings);
    addCandidate(candidates, parsedValue, item.name, warnings);
  });

  return candidates;
}

function addCandidate(candidates, value, source, warnings) {
  const parsed = parseMaybeJsonString(value, warnings);
  if (!parsed || typeof parsed !== "object") return;
  candidates.push({ value: parsed, source });

  for (const payload of findNestedPayloads(parsed, source, warnings)) {
    candidates.push(payload);
  }
}

function mergeCandidateIntoState(target, candidate, source, warnings) {
  if (!candidate || typeof candidate !== "object") return;
  const obj = deepParseJsonStrings(candidate, warnings);

  setFoundValue(target, "hp", getFirstExisting(obj, FIELD_PATHS.hp, source));
  setFoundValue(target, "maxHp", getFirstExisting(obj, FIELD_PATHS.maxHp, source));
  setFoundValue(target, "mp", getFirstExisting(obj, FIELD_PATHS.mp, source));
  setFoundValue(target, "maxMp", getFirstExisting(obj, FIELD_PATHS.maxMp, source));
  setFoundValue(target, "objective", getFirstExisting(obj, FIELD_PATHS.objective, source), cleanObjective);
  setFoundValue(target, "sukunaFingers", getFirstExisting(obj, FIELD_PATHS.sukunaFingers, source));
  const gojoAffinity = getFirstExisting(obj, FIELD_PATHS.gojoAffinity, source);
  setFoundValue(target, "gojo_affinity", gojoAffinity);
  setFoundValue(target, "gojoAffinity", gojoAffinity);
  const nanamiAffinity = getFirstExisting(obj, FIELD_PATHS.nanamiAffinity, source);
  setFoundValue(target, "nam_affinity", nanamiAffinity);
  setFoundValue(target, "nanamiAffinity", nanamiAffinity);
  setFoundValue(target, "sessionSummary", getFirstExisting(obj, FIELD_PATHS.sessionSummary, source));

  setFoundValue(target, "inventory", getFirstExisting(obj, FIELD_PATHS.inventory, source), normalizeInventory);
  setFoundValue(target, "attributes", getFirstExisting(obj, FIELD_PATHS.attributes, source), normalizeAttributes);
  setFoundValue(target, "attributeMax", getFirstExisting(obj, FIELD_PATHS.attributeMax, source));
  setFoundValue(target, "flags", getFirstExisting(obj, FIELD_PATHS.flags, source), normalizeFlags);

  const diceSources = collectDiceSources(obj, source);
  for (const diceSource of diceSources) {
    mergeDice(target, normalizeDice(diceSource.value), diceSource.source);
  }

  if (obj.mechanics?.need_dice !== undefined) {
    mergeDice(
      target,
      normalizeDice({
        dice: "1d100",
        dice_required: obj.mechanics.need_dice,
        attribute: obj.mechanics.attribute,
        difficulty: obj.mechanics.difficulty
      }),
      `${source}.mechanics`
    );
  }

  const summary = getFirstExisting(obj, ["player_visible_summary", "player_visible_summary_json"], source);
  if (summary?.value && typeof summary.value === "object") {
    setFoundValue(
      target,
      "objective",
      getFirstExisting(summary.value, ["objective_text"], summary.source),
      cleanObjective
    );
    if (isRealValue(summary.value.dice_text)) {
      mergeDice(target, normalizeDice(parseDiceText(String(summary.value.dice_text))), `${summary.source}.dice_text`);
    }
  }

  const changeLog = getFirstExisting(obj, ["state_change_log_json", "state_change_log", "debug.state_change_log"], source);
  const normalizedLog = parseMaybeJsonString(changeLog?.value, warnings);
  if (Array.isArray(normalizedLog)) setField(target, "changeLog", normalizedLog, changeLog.source);

  const parserWarnings = getFirstExisting(obj, ["parser_warnings_json", "parser_warnings", "warnings"], source);
  const normalizedWarnings = normalizeWarningList(parseMaybeJsonString(parserWarnings?.value, warnings));
  if (normalizedWarnings.length) {
    target.warnings = mergeWarnings(target.warnings, normalizedWarnings);
    target.sourceMap.warnings = parserWarnings.source;
  }
}

export function safeJsonParse(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return value;
  return strictJsonParse(value, "JSON", []);
}

export function parseMaybeJsonString(value, warnings = [], depth = 0) {
  if (depth > 4 || typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  if (looksJsonLike(trimmed)) {
    const parsed = strictJsonParse(trimmed, "JSON string", []);
    if (parsed !== null) return parseMaybeJsonString(parsed, warnings, depth + 1);

    const loose = parseLoosePythonLiteral(trimmed);
    if (loose !== null) return parseMaybeJsonString(loose, warnings, depth + 1);
  }

  if (/^".*"$/.test(trimmed)) {
    const parsedString = strictJsonParse(trimmed, "quoted JSON string", []);
    if (typeof parsedString === "string" && parsedString !== value) {
      return parseMaybeJsonString(parsedString, warnings, depth + 1);
    }
  }

  return value;
}

function firstRealValue(...values) {
  return values.find((value) => isRealValue(value));
}

export function getFirstExisting(obj, paths, sourcePrefix = "") {
  for (const path of paths) {
    const pathResult = readPath(obj, path);
    if (isRealValue(pathResult.value)) {
      return {
        value: pathResult.value,
        source: joinSource(sourcePrefix, path)
      };
    }
  }

  const keyNames = paths
    .map((path) => path.split(".").pop())
    .filter(Boolean);
  const deepResult = findDeepByKey(obj, keyNames);
  if (isRealValue(deepResult.value)) {
    return {
      value: deepResult.value,
      source: joinSource(sourcePrefix, deepResult.path)
    };
  }

  return { value: undefined, source: "" };
}

export function normalizeInventory(value) {
  const parsed = parseMaybeJsonString(value);
  if (!isRealValue(parsed)) return undefined;
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed !== "object") return parsed;

  const items = parseMaybeJsonString(parsed.items);
  if (Array.isArray(items)) return { ...parsed, items };
  if (Array.isArray(parsed.inventory)) return { items: parsed.inventory };
  if (Array.isArray(parsed.Inventory)) return { items: parsed.Inventory };
  return parsed;
}

export function normalizeAttributes(value) {
  const parsed = parseMaybeJsonString(value);
  if (!isRealValue(parsed)) return undefined;
  return parsed;
}

export function normalizeFlags(value) {
  const parsed = parseMaybeJsonString(value);
  if (!isRealValue(parsed)) return undefined;
  return parsed;
}

export function normalizeDice(value) {
  const parsed = parseMaybeJsonString(value);
  if (!parsed || typeof parsed !== "object") return {};

  const dice = {};
  for (const [field, paths] of Object.entries(DICE_FIELD_PATHS)) {
    const found = getFirstExisting(parsed, paths);
    if (isRealValue(found.value)) dice[field] = normalizeDiceField(field, found.value);
  }

  if (parsed.dice_required !== undefined) dice.dice_required = Boolean(parsed.dice_required);
  if (parsed.need_dice !== undefined) dice.dice_required = Boolean(parsed.need_dice);
  if (!dice.dice && Object.keys(dice).length) dice.dice = "1d100";
  if (dice.result !== undefined && dice.success === undefined) {
    dice.success = parseResultToSuccess(dice.result);
  }
  return dice;
}

function normalizeDiceFromDebug(value) {
  const parsed = parseMaybeJsonString(value);
  if (!parsed || typeof parsed !== "object") return {};
  if (!Object.keys(parsed).length) return {};
  const dice = {
    dice_required: parsed.dice_required ?? parsed.need_dice,
    dice: parsed.dice || "1d100",
    attribute: parsed.attribute,
    base_attribute: parsed.attribute_score ?? parsed.base_attribute ?? parsed.attribute_value,
    attribute_score: parsed.attribute_score ?? parsed.base_attribute ?? parsed.attribute_value,
    difficulty: parsed.difficulty,
    final_target: parsed.final_target ?? parsed.target,
    target: parsed.final_target ?? parsed.target,
    roll: parsed.roll ?? parsed.dice_roll,
    success: parsed.success,
    critical_success: parsed.critical_success,
    critical_failure: parsed.critical_failure,
    critical: parsed.critical,
    result: parsed.result,
    degree: parsed.degree
  };

  return Object.fromEntries(
    Object.entries(dice)
      .map(([key, item]) => [key, normalizeDiceField(key, item)])
      .filter(([, item]) => isRealValue(item))
  );
}

function collectDiceSources(obj, source) {
  const diceSources = [];
  for (const path of DICE_OBJECT_PATHS) {
    const found = getFirstExisting(obj, [path], source);
    if (found.value && typeof found.value === "object") diceSources.push(found);
  }

  if (hasAnyKey(obj, Object.values(DICE_FIELD_PATHS).flat())) {
    diceSources.push({ value: obj, source });
  }

  const debugDice = getFirstExisting(obj, ["debug.dice_result", "debug.dice"], source);
  if (debugDice.value && typeof debugDice.value === "object") diceSources.push(debugDice);
  return diceSources;
}

function mergeDice(target, incoming, source) {
  if (!incoming || !Object.keys(incoming).length) return;
  if (!target.dice || typeof target.dice !== "object") target.dice = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (isRealValue(value)) {
      target.dice[key] = value;
      target.sourceMap[`dice.${key}`] = source.includes(`.${key}`) ? source : `${source}.${key}`;
    }
  }
}

function enrichDiceFromState(state) {
  if (!state.dice || typeof state.dice !== "object") return;
  const attribute = state.dice.attribute;
  const attributes = state.attributes;
  if (attribute && attributes && typeof attributes === "object") {
    const score = Number(attributes[attribute]);
    if (Number.isFinite(score)) {
      if (!isRealValue(state.dice.base_attribute)) {
        state.dice.base_attribute = score;
        state.sourceMap["dice.base_attribute"] = `attributes.${attribute}`;
      }
      if (!isRealValue(state.dice.attribute_score)) {
        state.dice.attribute_score = score;
        state.sourceMap["dice.attribute_score"] = `attributes.${attribute}`;
      }
    }
  }

  const base = Number(state.dice.base_attribute ?? state.dice.attribute_score);
  const difficulty = Number(state.dice.difficulty ?? state.dice.difficulty_modifier);
  if (Number.isFinite(base) && Number.isFinite(difficulty) && !isRealValue(state.dice.final_target)) {
    const target = Math.max(5, Math.min(95, base - difficulty));
    state.dice.final_target = target;
    state.dice.target = target;
    state.sourceMap["dice.final_target"] = "derived from dice.base_attribute - dice.difficulty";
    state.sourceMap["dice.target"] = "derived from dice.base_attribute - dice.difficulty";
  }
}

function findNestedPayloads(obj, source, warnings) {
  const payloads = [];
  walkObject(obj, (value, path) => {
    const key = path.split(".").pop();
    if (!NESTED_PAYLOAD_KEYS.includes(key)) return;
    const parsed = deepParseJsonStrings(value, warnings);
    if (parsed && typeof parsed === "object") {
      payloads.push({ value: parsed, source: joinSource(source, path) });
    }
  });
  return payloads;
}

function deepParseJsonStrings(value, warnings, depth = 0) {
  const parsed = parseMaybeJsonString(value, warnings);
  if (depth > 6 || !parsed || typeof parsed !== "object") return parsed;
  if (Array.isArray(parsed)) return parsed.map((item) => deepParseJsonStrings(item, warnings, depth + 1));

  const result = {};
  for (const [key, item] of Object.entries(parsed)) {
    result[key] = deepParseJsonStrings(item, warnings, depth + 1);
  }
  return result;
}

function parseVisibleTextIntoState(target, text) {
  setFieldIfReal(target, "hp", matchLineByLabels(text, ["HP", "生命状态", "生命"]), "answer.visible_text.HP");
  setFieldIfReal(target, "mp", matchLineByLabels(text, ["MP", "当前咒力", "咒力"]), "answer.visible_text.MP");
  setFieldIfReal(
    target,
    "objective",
    matchLineByLabels(text, ["Current Objective", "当前任务", "当前目标", "目标"]),
    "answer.visible_text.objective",
    cleanObjective
  );
  setFieldIfReal(
    target,
    "sessionSummary",
    matchLineByLabels(text, ["Session_Summary", "剧情摘要", "会话摘要", "摘要"]),
    "answer.visible_text.session_summary"
  );

  const visibleDice = normalizeDice(parseDiceText(text));
  mergeDice(target, visibleDice, "answer.visible_text.dice");
}

function parseDiceText(text) {
  return {
    attribute: matchLineByLabels(text, ["判定属性", "属性", "Attribute"]),
    base_attribute: numberOrUndefined(matchLineByLabels(text, ["属性值", "Attribute Value", "Attribute Score"])),
    difficulty: numberOrUndefined(matchLineByLabels(text, ["难度", "Difficulty"])),
    final_target: numberOrUndefined(matchLineByLabels(text, ["最终目标值", "最终目标", "目标值", "Final Target", "Target"])),
    roll: numberOrUndefined(matchLineByLabels(text, ["骰子结果", "骰子", "Roll"])),
    success: parseVisibleSuccess(text),
    critical: matchLineByLabels(text, ["暴击", "Critical"])
  };
}

function matchLineByLabels(text, labels) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`${escaped}\\s*[:：]\\s*([^\\n\\r]+)`, "i");
    const match = text.match(regex);
    if (match) return match[1].trim();
  }
  return undefined;
}

function parseVisibleSuccess(text) {
  const result = matchLineByLabels(text, ["判定结果", "结果", "Result"]);
  return parseResultToSuccess(result);
}

function parseResultToSuccess(value) {
  if (value === true || value === false) return value;
  if (!isRealValue(value)) return undefined;
  if (/success|成功/i.test(String(value))) return true;
  if (/failure|fail|失败/i.test(String(value))) return false;
  return undefined;
}

function normalizeDiceField(field, value) {
  if (["base_attribute", "difficulty", "final_target", "roll"].includes(field)) {
    return numberOrUndefined(value);
  }
  if (["success", "critical_success", "critical_failure"].includes(field)) {
    if (typeof value === "boolean") return value;
    if (/^(true|yes|成功|是)$/i.test(String(value))) return true;
    if (/^(false|no|失败|否)$/i.test(String(value))) return false;
  }
  return value;
}

function numberOrUndefined(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function setFoundValue(target, key, found, normalize = (value) => value) {
  if (!found || !isRealValue(found.value)) return;
  const normalized = normalize(found.value);
  setField(target, key, normalized, found.source);
}

function setFieldIfReal(target, key, value, source, normalize = (item) => item) {
  setField(target, key, normalize(value), source);
}

function setField(target, key, value, source) {
  if (!isRealValue(value)) return;
  target[key] = value;
  target.sourceMap[key] = source;
}

function readPath(obj, path) {
  if (!obj || typeof obj !== "object") return { value: undefined, path };
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return { value: undefined, path };
    }
    current = current[part];
  }
  return { value: current, path };
}

function findDeepByKey(obj, keyNames, prefix = "") {
  if (!obj || typeof obj !== "object") return { value: undefined, path: "" };
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (keyNames.includes(key) && isRealValue(value)) return { value, path };
    if (value && typeof value === "object") {
      const nested = findDeepByKey(value, keyNames, path);
      if (isRealValue(nested.value)) return nested;
    }
  }
  return { value: undefined, path: "" };
}

function walkObject(value, visitor, prefix = "") {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    visitor(item, path);
    if (item && typeof item === "object") walkObject(item, visitor, path);
  }
}

function hasAnyKey(obj, keys) {
  if (!obj || typeof obj !== "object") return false;
  return Object.keys(obj).some((key) => keys.includes(key));
}

function looksJsonLike(text) {
  return (
    text.startsWith("{") ||
    text.startsWith("[") ||
    /^"\s*[{[]/.test(text)
  );
}

function parseLoosePythonLiteral(text) {
  try {
    const normalized = text
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false")
      .replace(/\bNone\b/g, "null")
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, body) => {
        const unescaped = body.replace(/\\'/g, "'");
        return JSON.stringify(unescaped);
      });
    return JSON.parse(normalized);
  } catch (_error) {
    return null;
  }
}

function cleanObjective(value) {
  if (!isRealValue(value)) return value;
  return String(value).replace(/^Current Objective:\s*/i, "").trim();
}

function removeAccidentalPlanningText(text) {
  const sectionIndex = text.search(/^###\s*(?:[\u{1f4c5}\u{1f3ac}\u{1f3b2}\u{1f9ed}]|[📅🎬🎲🧭])/mu);
  if (sectionIndex > 0) {
    const prefix = text.slice(0, sectionIndex);
    if (/need dice|dice check|mechanics|判定/i.test(prefix)) {
      return text.slice(sectionIndex).trim();
    }
  }
  return text;
}

function joinSource(prefix, path) {
  if (!prefix) return path;
  if (!path) return prefix;
  return `${prefix}.${path}`;
}

function isRealValue(value) {
  if (value === undefined || value === null || value === "" || value === UNKNOWN) return false;
  return true;
}

function normalizeWarningList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function mergeWarnings(...warningGroups) {
  const merged = [];
  for (const group of warningGroups) {
    for (const warning of normalizeWarningList(group)) {
      if (warning && !merged.includes(warning)) merged.push(warning);
    }
  }
  return merged;
}

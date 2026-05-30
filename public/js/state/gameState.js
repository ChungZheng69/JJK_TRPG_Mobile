export const UNKNOWN = "Unknown";

let gameState = createInitialGameState();

export function createInitialGameState() {
  return {
    hp: UNKNOWN,
    mp: UNKNOWN,
    objective: UNKNOWN,
    attributes: null,
    inventory: null,
    flags: null,
    sukunaFingers: UNKNOWN,
    gojoAffinity: UNKNOWN,
    nanamiAffinity: UNKNOWN,
    dice: null,
    lastDice: null,
    sessionSummary: UNKNOWN,
    changeLog: [],
    warnings: [],
    sourceMap: {}
  };
}

export function getGameState() {
  return gameState;
}

export function setGameState(nextState) {
  gameState = {
    ...createInitialGameState(),
    ...(nextState || {})
  };
  if (gameState.dice && !gameState.lastDice) gameState.lastDice = gameState.dice;
  if (gameState.lastDice && !gameState.dice) gameState.dice = gameState.lastDice;
  return gameState;
}

export function resetGameState() {
  gameState = createInitialGameState();
  return gameState;
}

export function mergeParsedState(parsed) {
  if (!parsed || typeof parsed !== "object") return gameState;
  const latestWarnings = normalizeWarningList(parsed.warnings);
  const nextState = { ...gameState };

  for (const [key, value] of Object.entries(parsed)) {
    if (key === "warnings") continue;
    if (key === "dice" || key === "lastDice") {
      nextState.dice = mergeObjectValue(nextState.dice, value);
      nextState.lastDice = nextState.dice;
      continue;
    }
    if (key === "sourceMap") {
      nextState.sourceMap = { ...(nextState.sourceMap || {}), ...(value || {}) };
      continue;
    }
    if (isRealValue(value)) nextState[key] = value;
  }

  nextState.warnings = latestWarnings;
  gameState = nextState;
  return gameState;
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

function isRealValue(value) {
  if (value === undefined || value === null || value === "" || value === UNKNOWN) return false;
  return true;
}

function normalizeWarningList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

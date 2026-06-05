export function rollD100Check({ attribute = null, attributeScore = 0, difficulty = 0, rng = Math.random } = {}) {
  const roll = Math.floor(rng() * 100) + 1;
  const baseAttribute = toInteger(attributeScore, 0);
  const difficultyPenalty = toInteger(difficulty, 0);
  const finalTarget = clamp(baseAttribute - difficultyPenalty, 5, 95);
  const criticalSuccess = roll <= 5;
  const criticalFailure = roll >= 96;
  const success = criticalSuccess || (roll <= finalTarget && !criticalFailure);
  const degree = criticalSuccess
    ? "critical_success"
    : criticalFailure
      ? "critical_failure"
      : success ? "success" : "failure";

  return {
    required: true,
    dice_required: true,
    dice: "1d100",
    attribute,
    roll,
    attributeScore: baseAttribute,
    base_attribute: baseAttribute,
    attribute_score: baseAttribute,
    difficulty: difficultyPenalty,
    difficulty_modifier: difficultyPenalty,
    finalTarget,
    final_target: finalTarget,
    target: finalTarget,
    success,
    criticalSuccess,
    criticalFailure,
    critical_success: criticalSuccess,
    critical_failure: criticalFailure,
    degree
  };
}

export function emptyDiceResult() {
  return {
    required: false,
    dice_required: false,
    success: null
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toInteger(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isNaN(number) ? fallback : number;
}

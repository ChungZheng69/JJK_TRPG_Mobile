import { valueOrUnknown } from "./renderStatePanel.js";

export function renderDicePanel(els, dice) {
  const hasDice = dice && Object.keys(dice).length;
  els.diceLast.textContent = hasDice ? (dice.dice || "1d100") : "Unknown";
  els.diceAttribute.textContent = valueOrUnknown(dice?.attribute);
  els.diceAttributeValue.textContent = valueOrUnknown(dice?.attributeScore ?? dice?.base_attribute ?? dice?.attribute_score ?? dice?.attribute_value);
  els.diceDifficulty.textContent = valueOrUnknown(dice?.difficulty ?? dice?.difficulty_modifier);
  els.diceTarget.textContent = valueOrUnknown(dice?.finalTarget ?? dice?.final_target ?? dice?.target);
  els.diceRoll.textContent = valueOrUnknown(dice?.roll ?? dice?.dice_roll);

  const success = dice?.success ?? parseResult(dice?.result);
  els.diceSuccess.textContent = success === undefined || success === null ? "Unknown" : (success ? "成功" : "失败");
  els.diceSuccess.className = success ? "success" : success === false ? "failure" : "";

  const critical = dice?.criticalSuccess || dice?.critical_success
    ? "大成功"
    : dice?.criticalFailure || dice?.critical_failure
      ? "大失败"
      : dice?.critical === true
        ? "是"
        : dice?.critical === false || success !== undefined
          ? "否"
          : dice?.degree || "Unknown";
  els.diceCritical.textContent = valueOrUnknown(critical);
}

function parseResult(value) {
  if (value === true || value === false) return value;
  if (value === undefined || value === null || value === "") return undefined;
  if (/success|成功/i.test(String(value))) return true;
  if (/failure|fail|失败/i.test(String(value))) return false;
  return undefined;
}

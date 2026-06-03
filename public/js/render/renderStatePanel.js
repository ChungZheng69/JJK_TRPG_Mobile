import { UNKNOWN } from "../state/gameState.js";
import { CHARACTER_CONFIG, DEFAULT_ATTRIBUTE_MAX } from "../config/character_config.js";

const ATTRIBUTE_ORDER = ["physique", "technique", "cursed_energy", "mind"];

export function renderStatePanel(els, state) {
  if (els.topStateHp) els.topStateHp.textContent = formatResource(state.hp, state.max_hp ?? state.maxHp);
  if (els.topStateMp) els.topStateMp.textContent = formatResource(state.mp, state.max_mp ?? state.maxMp);
  if (els.topStateObjective) els.topStateObjective.textContent = valueOrUnknown(state.objective);
  els.stateHp.textContent = formatResource(state.hp, state.max_hp ?? state.maxHp);
  els.stateMp.textContent = formatResource(state.mp, state.max_mp ?? state.maxMp);
  els.stateObjective.textContent = valueOrUnknown(state.objective);
  els.stateFingers.textContent = valueOrUnknown(state.sukuna_fingers ?? state.sukunaFingers);
  els.stateGojo.textContent = valueOrUnknown(state.gojo_affinity ?? state.gojoAffinity);
  els.stateNanami.textContent = valueOrUnknown(state.nam_affinity ?? state.nanamiAffinity);
  renderTags(els.stateAttributes, formatAttributes(state));
  renderTags(els.stateInventory, formatInventory(state.inventory));
  renderTags(els.stateFlags, formatFlags(state.flags));
}

export function valueOrUnknown(value) {
  return value === undefined || value === null || value === "" ? UNKNOWN : String(value);
}

function formatResource(value, max) {
  const current = valueOrUnknown(value);
  return isKnown(max) ? `${current} / ${max}` : current;
}

function isKnown(value) {
  return value !== undefined && value !== null && value !== "" && value !== UNKNOWN;
}

function renderTags(container, values) {
  container.innerHTML = "";
  const items = values?.length ? values : [UNKNOWN];
  for (const item of items) {
    const tag = document.createElement("span");
    tag.className = `tag${item === UNKNOWN ? " muted" : ""}`;
    tag.textContent = item;
    container.append(tag);
  }
}

function formatAttributes(gameState) {
  const attrMax = gameState.attribute_max ?? gameState.attributeMax ?? DEFAULT_ATTRIBUTE_MAX;
  const attributes = gameState.attributes || {};
  if (!attributes || attributes === UNKNOWN) return [];
  if (typeof attributes === "string") return [attributes];
  const configAttrs = CHARACTER_CONFIG.starting_attributes || {};
  return ATTRIBUTE_ORDER.map((key) => {
    const value = attributes[key] ?? configAttrs[key] ?? 0;
    return isKnown(attrMax) ? `${key}: ${value} / ${attrMax}` : `${key}: ${value}`;
  });
}

function formatInventory(inventory) {
  if (!inventory || inventory === UNKNOWN) return ["无"];
  if (typeof inventory === "string") return formatLooseStringCollection(inventory);
  if (Array.isArray(inventory)) return inventory.map(String);
  if (Array.isArray(inventory.items)) {
    return inventory.items.length
      ? inventory.items.map((item) => `${item.name || "item"} x${item.quantity || 1}`)
      : ["无"];
  }
  return Object.entries(inventory).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
}

function formatFlags(flags) {
  if (!flags || flags === UNKNOWN) return [];
  if (typeof flags === "string") return formatLooseStringCollection(flags);
  if (Array.isArray(flags)) return flags.map(String);
  return Object.entries(flags)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
}

function formatLooseStringCollection(value) {
  return String(value)
    .replace(/^[{[]|[}\]]$/g, "")
    .split(/,(?=(?:[^']*'[^']*')*[^']*$)/)
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

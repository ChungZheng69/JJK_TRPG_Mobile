import { UNKNOWN } from "../state/gameState.js";

const ATTRIBUTE_ORDER = ["physique", "technique", "cursed_energy", "mind"];

export function renderStatePanel(els, state) {
  if (els.topStateHp) els.topStateHp.textContent = formatResource(state.hp, state.maxHp);
  if (els.topStateMp) els.topStateMp.textContent = formatResource(state.mp, state.maxMp);
  if (els.topStateObjective) els.topStateObjective.textContent = valueOrUnknown(state.objective);
  els.stateHp.textContent = formatResource(state.hp, state.maxHp);
  els.stateMp.textContent = formatResource(state.mp, state.maxMp);
  els.stateObjective.textContent = valueOrUnknown(state.objective);
  els.stateFingers.textContent = valueOrUnknown(state.sukunaFingers);
  els.stateGojo.textContent = valueOrUnknown(state.gojoAffinity);
  els.stateNanami.textContent = valueOrUnknown(state.nanamiAffinity);
  renderTags(els.stateAttributes, formatAttributes(state.attributes, state.attributeMax));
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

function formatAttributes(attributes, attributeMax) {
  if (!attributes || attributes === UNKNOWN) return [];
  if (typeof attributes === "string") return [attributes];
  const keys = [
    ...ATTRIBUTE_ORDER.filter((key) => key in attributes),
    ...Object.keys(attributes).filter((key) => key !== "_exp" && !ATTRIBUTE_ORDER.includes(key))
  ];
  return keys.map((key) => {
    const value = attributes[key];
    return isKnown(attributeMax) ? `${key}: ${value} / ${attributeMax}` : `${key}: ${value}`;
  });
}

function formatInventory(inventory) {
  if (!inventory || inventory === UNKNOWN) return [];
  if (typeof inventory === "string") return formatLooseStringCollection(inventory);
  if (Array.isArray(inventory)) return inventory.map(String);
  if (Array.isArray(inventory.items)) {
    return inventory.items.map((item) => `${item.name || "item"} x${item.quantity || 1}`);
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

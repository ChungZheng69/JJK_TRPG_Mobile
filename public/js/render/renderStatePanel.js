import { UNKNOWN } from "../state/gameState.js";

export function renderStatePanel(els, state) {
  if (els.topStateHp) els.topStateHp.textContent = valueOrUnknown(state.hp);
  if (els.topStateMp) els.topStateMp.textContent = valueOrUnknown(state.mp);
  if (els.topStateObjective) els.topStateObjective.textContent = valueOrUnknown(state.objective);
  els.stateHp.textContent = valueOrUnknown(state.hp);
  els.stateMp.textContent = valueOrUnknown(state.mp);
  els.stateObjective.textContent = valueOrUnknown(state.objective);
  els.stateFingers.textContent = valueOrUnknown(state.sukunaFingers);
  els.stateGojo.textContent = valueOrUnknown(state.gojoAffinity);
  els.stateNanami.textContent = valueOrUnknown(state.nanamiAffinity);
  renderTags(els.stateAttributes, formatAttributes(state.attributes));
  renderTags(els.stateInventory, formatInventory(state.inventory));
  renderTags(els.stateFlags, formatFlags(state.flags));
}

export function valueOrUnknown(value) {
  return value === undefined || value === null || value === "" ? UNKNOWN : String(value);
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

function formatAttributes(attributes) {
  if (!attributes || attributes === UNKNOWN) return [];
  if (typeof attributes === "string") return [attributes];
  return Object.entries(attributes).map(([key, value]) => `${key}: ${value}`);
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

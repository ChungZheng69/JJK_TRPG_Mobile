import { normalizeGameState } from "../state/gameState.js";

const STATUS_COMMANDS = new Set(["\u72b6\u6001", "\u80cc\u56ca", "\u9762\u677f", "/status"]);
const ATTRIBUTE_ORDER = ["physique", "technique", "cursed_energy", "mind"];

export function isLocalStatusCommand(input) {
  const command = String(input || "").trim();
  if (!command) return false;
  return STATUS_COMMANDS.has(command) || command.toLowerCase() === "/status";
}

export function formatLocalStatus(gameState) {
  const state = normalizeGameState(gameState);
  const maxHp = state.max_hp ?? state.maxHp ?? 100;
  const maxMp = state.max_mp ?? state.maxMp ?? 100;
  const attrMax = state.attribute_max ?? state.attributeMax ?? 80;

  return [
    "### \u672c\u5730\u72b6\u6001\u9762\u677f",
    `Character: ${valueOrUnknown(state.character_name ?? state.characterName)}`,
    `HP: ${valueOrUnknown(state.hp)} / ${valueOrUnknown(maxHp)}`,
    `MP: ${valueOrUnknown(state.mp)} / ${valueOrUnknown(maxMp)}`,
    `Objective: ${valueOrUnknown(state.objective)}`,
    "",
    "### Attributes",
    ...formatAttributes(state.attributes, attrMax),
    "",
    "### Inventory",
    ...formatList(formatInventory(state.inventory)),
    "",
    "### Flags",
    ...formatList(formatFlags(state.flags)),
    "",
    "### Affinity",
    `Gojo_Affinity: ${valueOrUnknown(state.gojo_affinity ?? state.gojoAffinity)}`,
    `Nanami_Affinity: ${valueOrUnknown(state.nam_affinity ?? state.nanamiAffinity)}`,
    `sukuna_fingers: ${valueOrUnknown(state.sukuna_fingers ?? state.sukunaFingers)}`
  ].join("\n");
}

function formatAttributes(attributes, attrMax) {
  const source = attributes && typeof attributes === "object" && !Array.isArray(attributes)
    ? attributes
    : {};
  return ATTRIBUTE_ORDER.map((key) => `${key}: ${valueOrUnknown(source[key])} / ${valueOrUnknown(attrMax)}`);
}

function formatInventory(inventory) {
  if (!inventory) return ["\u65e0"];
  if (Array.isArray(inventory)) return inventory.length ? inventory.map(formatInventoryItem) : ["\u65e0"];
  if (typeof inventory === "string") return inventory.trim() ? [inventory] : ["\u65e0"];

  const items = Array.isArray(inventory.items) ? inventory.items.map(formatInventoryItem) : [];
  const extraEntries = Object.entries(inventory)
    .filter(([key]) => key !== "items")
    .map(([key, value]) => `${key}: ${formatValue(value)}`);
  const lines = [...items, ...extraEntries].filter(Boolean);
  return lines.length ? lines : ["\u65e0"];
}

function formatInventoryItem(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return String(item);
  const name = item.name || item.id || "item";
  const quantity = item.quantity ?? item.count ?? 1;
  return `${name} x${quantity}`;
}

function formatFlags(flags) {
  if (!flags || typeof flags !== "object" || Array.isArray(flags)) return ["\u65e0"];
  const entries = Object.entries(flags);
  if (!entries.length) return ["\u65e0"];
  return entries.map(([key, value]) => `${key}: ${formatValue(value)}`);
}

function formatList(values) {
  return (values?.length ? values : ["\u65e0"]).map((item) => `- ${item}`);
}

function formatValue(value) {
  if (value === undefined || value === null || value === "") return "Unknown";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function valueOrUnknown(value) {
  return value === undefined || value === null || value === "" ? "Unknown" : String(value);
}

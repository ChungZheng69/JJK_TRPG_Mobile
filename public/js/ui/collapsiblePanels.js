export const COLLAPSED_PANELS_KEY = "jjk_trpg_ui_collapsed_panels";
export const FOCUS_MODE_KEY = "jjk_trpg_focus_mode";

const DEFAULT_COLLAPSED = {
  characterSheet: false,
  attributes: false,
  inventory: true,
  objective: false,
  questLog: false,
  combatHud: true,
  diceResult: true,
  sessionControls: true,
  flags: true,
  sessionMemory: true,
  changeLog: true,
  debugPanel: true,
  mobileStatus: true,
  mobileInventory: true,
  mobileAttributes: true,
  mobileQuestLog: false,
  mobileCombatHud: true,
  mobileDiceResult: true,
  mobileMemory: true,
  mobileDebug: true,
  mobileSaves: true,
  mobileStateEditor: true
};

export function createCollapsiblePanelController({
  panels = [],
  collapseAllButton = null,
  expandAllButton = null,
  focusModeButton = null,
  getState = () => ({})
} = {}) {
  const saved = loadCollapsedState();
  const hasSavedState = Object.keys(saved).length > 0;
  const collapsedState = { ...DEFAULT_COLLAPSED, ...saved };
  let focusMode = loadFocusMode();
  const registry = new Map();

  for (const config of panels) {
    const entry = createPanelEntry(config, collapsedState, hasSavedState, getState);
    if (entry) registry.set(entry.id, entry);
  }

  function applyAll({ persist = false } = {}) {
    const state = getState() || {};
    for (const entry of registry.values()) {
      applyPanel(entry, Boolean(collapsedState[entry.id]));
    }
    applyAutoBehavior(state);
    document.body.classList.toggle("focus-mode-on", focusMode);
    updateFocusModeButton(focusModeButton, focusMode);
    if (persist) saveCollapsedState(collapsedState);
  }

  function setPanelCollapsed(id, collapsed, { persist = true, log = true } = {}) {
    const entry = registry.get(id);
    if (!entry) return;
    collapsedState[id] = Boolean(collapsed);
    applyPanel(entry, Boolean(collapsed));
    if (persist) saveCollapsedState(collapsedState);
    if (log) console.log(collapsed ? "UI_PANEL_COLLAPSED" : "UI_PANEL_EXPANDED", id);
  }

function collapseAll() {
    for (const id of registry.keys()) setPanelCollapsed(id, true, { persist: false, log: false });
    saveCollapsedState(collapsedState);
    console.log("UI_COLLAPSE_ALL");
    console.log("UI_COLLAPSE_ALL_APPLIED");
    applyAll();
  }

  function expandAll() {
    for (const id of registry.keys()) setPanelCollapsed(id, false, { persist: false, log: false });
    saveCollapsedState(collapsedState);
    console.log("UI_EXPAND_ALL");
    console.log("UI_EXPAND_ALL_APPLIED");
    applyAll();
  }

  function setFocusMode(enabled) {
    focusMode = Boolean(enabled);
    saveFocusMode(focusMode);
    console.log(focusMode ? "UI_FOCUS_MODE_ON" : "UI_FOCUS_MODE_OFF");
    applyAll();
  }

  function applyAutoBehavior(state = {}) {
    const combatActive = Boolean(state.combat?.active);
    const diceActive = Boolean(state.dice?.required || state.dice?.dice_required || state.lastDice?.required || state.lastDice?.dice_required);

    if (focusMode) {
      const keepExpanded = new Set(["combatHud", "mobileCombatHud", "diceResult", "mobileDiceResult"]);
      for (const id of registry.keys()) {
        if (!keepExpanded.has(id)) applyPanel(registry.get(id), true);
      }
    }

    if (combatActive) {
      applyPanelById("combatHud", false);
      applyPanelById("mobileCombatHud", false);
    }
    if (diceActive) {
      applyPanelById("diceResult", false);
      applyPanelById("mobileDiceResult", false);
    }
  }

  collapseAllButton?.addEventListener("click", collapseAll);
  expandAllButton?.addEventListener("click", expandAll);
  focusModeButton?.addEventListener("click", () => setFocusMode(!focusMode));

  function applyPanelById(id, collapsed) {
    const entry = registry.get(id);
    if (entry) applyPanel(entry, collapsed);
  }

  applyAll();

  return {
    apply: applyAll,
    collapseAll,
    expandAll,
    setPanelCollapsed,
    setFocusMode,
    isFocusMode: () => focusMode
  };
}

function createPanelEntry(config, collapsedState, hasSavedState, getState) {
  const { id, element } = config;
  if (!id || !element) return null;
  const entry = {
    id,
    element,
    type: element.tagName === "DETAILS" ? "details" : "panel",
    button: null,
    syncing: false
  };

  if (!hasSavedState && typeof config.defaultCollapsed === "function") {
    collapsedState[id] = Boolean(config.defaultCollapsed(getState() || {}));
  } else if (!hasSavedState && config.defaultCollapsed !== undefined) {
    collapsedState[id] = Boolean(config.defaultCollapsed);
  }

  if (entry.type === "details") {
    entry.heading = element.querySelector("summary");
    if (!entry.heading) return null;
    entry.button = appendToggleButton(entry.heading, id);
    entry.button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextCollapsed = element.open;
      collapsedState[id] = nextCollapsed;
      applyPanel(entry, nextCollapsed);
      saveCollapsedState(collapsedState);
      console.log(nextCollapsed ? "UI_PANEL_COLLAPSED" : "UI_PANEL_EXPANDED", id);
    });
    element.addEventListener("toggle", () => {
      if (entry.syncing) return;
      collapsedState[id] = !element.open;
      updateToggleButton(entry.button, collapsedState[id]);
      saveCollapsedState(collapsedState);
      console.log(collapsedState[id] ? "UI_PANEL_COLLAPSED" : "UI_PANEL_EXPANDED", id);
    });
    return entry;
  }

  entry.heading = element.querySelector(".panel-heading");
  if (!entry.heading) return null;
  entry.body = ensurePanelBody(element, entry.heading);
  console.log("UI_PANEL_BODY_FOUND", id, Boolean(entry.body));
  entry.button = appendToggleButton(entry.heading, id);
  entry.button.addEventListener("click", () => {
    const nextCollapsed = !Boolean(collapsedState[id]);
    collapsedState[id] = nextCollapsed;
    applyPanel(entry, nextCollapsed);
    saveCollapsedState(collapsedState);
    console.log(nextCollapsed ? "UI_PANEL_COLLAPSED" : "UI_PANEL_EXPANDED", id);
  });
  return entry;
}

function ensurePanelBody(panel, heading) {
  const existing = panel.querySelector(":scope > .panel-body");
  if (existing) return existing;
  const body = document.createElement("div");
  body.className = "panel-body";
  const children = Array.from(panel.children).filter((child) => child !== heading);
  for (const child of children) body.append(child);
  panel.append(body);
  return body;
}

function appendToggleButton(heading, id) {
  const existing = heading.querySelector(".panel-collapse-toggle");
  if (existing) return existing;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "panel-collapse-toggle";
  button.setAttribute("aria-label", `Toggle ${id}`);
  heading.append(button);
  return button;
}

function applyPanel(entry, collapsed) {
  if (!entry) return;
  entry.element.classList.toggle("is-collapsed", Boolean(collapsed));
  entry.element.classList.toggle("collapsed", Boolean(collapsed));
  if (entry.type === "details") {
    entry.syncing = true;
    entry.element.open = !collapsed;
    queueMicrotask(() => {
      entry.syncing = false;
    });
  } else if (entry.body) {
    entry.body.hidden = Boolean(collapsed);
    entry.body.style.display = collapsed ? "none" : "";
    entry.body.setAttribute("aria-hidden", String(Boolean(collapsed)));
  }
  updateToggleButton(entry.button, Boolean(collapsed));
  console.log(collapsed ? "UI_PANEL_COLLAPSE_APPLIED" : "UI_PANEL_EXPAND_APPLIED", entry.id);
}

function updateToggleButton(button, collapsed) {
  if (!button) return;
  button.textContent = collapsed ? "+" : "-";
  button.setAttribute("aria-expanded", String(!collapsed));
}

function updateFocusModeButton(button, enabled) {
  if (!button) return;
  button.textContent = enabled ? "Focus On" : "Focus Mode";
  button.setAttribute("aria-pressed", String(enabled));
  button.classList.toggle("active", enabled);
}

function loadCollapsedState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLLAPSED_PANELS_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function saveCollapsedState(state) {
  localStorage.setItem(COLLAPSED_PANELS_KEY, JSON.stringify(state || {}));
}

function loadFocusMode() {
  return localStorage.getItem(FOCUS_MODE_KEY) === "true";
}

function saveFocusMode(enabled) {
  localStorage.setItem(FOCUS_MODE_KEY, String(Boolean(enabled)));
}

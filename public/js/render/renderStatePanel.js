import { UNKNOWN } from "../state/gameState.js";
import { CHARACTER_CONFIG, DEFAULT_ATTRIBUTE_MAX } from "../config/character_config.js";

const ATTRIBUTE_ORDER = ["physique", "technique", "cursed_energy", "mind"];

export function renderStatePanel(els, state) {
  const character = state.character || {};
  const technique = character.technique || {};
  const gojoAffinity = readGojoAffinity(state);
  const nanamiAffinity = readNanamiAffinity(state);
  console.log("AFFINITY_RENDER_VALUES", {
    gojo_affinity: gojoAffinity,
    nam_affinity: nanamiAffinity,
    sourceState: {
      gojo_affinity: state.gojo_affinity,
      Gojo_Affinity: state.Gojo_Affinity,
      gojoAffinity: state.gojoAffinity,
      nam_affinity: state.nam_affinity,
      nanami_affinity: state.nanami_affinity,
      Nanami_Affinity: state.Nanami_Affinity,
      nanamiAffinity: state.nanamiAffinity
    }
  });
  if (els.topStateHp) els.topStateHp.textContent = formatResource(state.hp, state.max_hp ?? state.maxHp);
  if (els.topStateMp) els.topStateMp.textContent = formatResource(state.mp, state.max_mp ?? state.maxMp);
  if (els.topStateObjective) els.topStateObjective.textContent = valueOrUnknown(state.objective);
  document.querySelectorAll("[data-character-name]").forEach((element) => {
    element.textContent = valueOrUnknown(character.name || state.characterName || state.character_name);
  });
  els.stateHp.textContent = formatResource(state.hp, state.max_hp ?? state.maxHp);
  els.stateMp.textContent = formatResource(state.mp, state.max_mp ?? state.maxMp);
  if (els.stateAge) els.stateAge.textContent = valueOrUnknown(character.age ?? state.age);
  if (els.stateRole) els.stateRole.textContent = valueOrUnknown(character.role || state.role);
  if (els.stateRank) els.stateRank.textContent = valueOrUnknown(character.rank || state.rank);
  if (els.stateTechnique) els.stateTechnique.textContent = valueOrUnknown(technique.name || state.techniqueName || state.technique_name);
  els.stateObjective.textContent = valueOrUnknown(state.objective);
  els.stateFingers.textContent = valueOrUnknown(state.sukuna_fingers ?? state.sukunaFingers);
  els.stateGojo.textContent = valueOrUnknown(gojoAffinity);
  els.stateNanami.textContent = valueOrUnknown(nanamiAffinity);
  renderTags(els.stateAttributes, formatAttributes(state));
  renderTags(els.stateInventory, formatInventory(state.inventory));
  renderTags(els.stateFlags, formatFlags(state.flags));
  if (els.stateQuestLog) renderQuestLog(els.stateQuestLog, state.questLog);
  renderCombatHud(els, state);
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

function readGojoAffinity(state) {
  return state.gojo_affinity ?? state.Gojo_Affinity ?? state.gojoAffinity;
}

function readNanamiAffinity(state) {
  return state.nam_affinity ?? state.nanami_affinity ?? state.Nanami_Affinity ?? state.nanamiAffinity;
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

function renderQuestLog(container, questLog) {
  container.innerHTML = "";
  const normalized = normalizeQuestLogForRender(questLog);
  if (!normalized.main && !normalized.active.length && !normalized.completed.length && !normalized.failed.length) {
    container.append(createMutedText("Unknown"));
    return;
  }

  if (normalized.main) {
    container.append(createQuestBlock("Main Quest", normalized.main));
  }

  const activeGroup = document.createElement("div");
  activeGroup.className = "quest-group";
  activeGroup.innerHTML = `<div class="quest-group-title">Active Quests</div>`;
  if (normalized.active.length) {
    for (const quest of normalized.active) activeGroup.append(createQuestBlock("", quest));
  } else {
    activeGroup.append(createMutedText("No active side quests."));
  }
  container.append(activeGroup);

  if (normalized.completed.length || normalized.failed.length) {
    const archive = document.createElement("div");
    archive.className = "quest-archive";
    if (normalized.completed.length) {
      archive.append(createQuestArchiveLine("Completed", normalized.completed));
    }
    if (normalized.failed.length) {
      archive.append(createQuestArchiveLine("Failed", normalized.failed));
    }
    container.append(archive);
  }
}

function renderCombatHud(els, state) {
  if (!els.combatPanel) return;
  const combat = state?.combat;
  const source = combat && typeof combat === "object" && !Array.isArray(combat) ? combat : {};
  const active = Boolean(source.active);
  console.log("FRONTEND_COMBAT_ACTIVE", active);
  console.log("FRONTEND_BATTLE_HUD_ACTIVE", active);
  console.log("FRONTEND_COMBAT_ENEMY_COUNT", Array.isArray(source.enemies) ? source.enemies.length : 0);
  els.combatPanel.hidden = !active;
  if (!active) {
    console.log("FRONTEND_BATTLE_HUD_HIDDEN_COMBAT_ENDED", true);
    els.combatEnemy.textContent = "战斗结束";
    els.combatEnemyHpBar.style.width = "0%";
    els.combatEnemyHpBar.textContent = "";
    els.combatEnemyDetails.textContent = [
      `本回合伤害：${source.lastDamageDealt || 0}`,
      `承受伤害：${source.lastDamageTaken || 0}`
    ].join("\n");
    renderSkillButtons(els.combatSkillButtons, [], state);
    renderCombatLog(els.combatLog, source.combatLog);
    return;
  }
  const enemy = findCurrentEnemy(source);
  if (!enemy) {
    els.combatEnemy.textContent = "Unknown enemy";
    els.combatEnemyHpBar.style.width = "0%";
    els.combatEnemyHpBar.textContent = "";
    els.combatEnemyDetails.textContent = "No active target.";
    renderSkillButtons(els.combatSkillButtons, state.skills, state);
    renderCombatLog(els.combatLog, source.combatLog);
    return;
  }
  const hp = Number(enemy.hp || 0);
  const maxHp = Math.max(1, Number(enemy.maxHp || 1));
  const hpPercent = Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)));
  els.combatEnemy.textContent = `敌人：${enemy.name || "敌人"} Lv.${enemy.level || "?"} ${enemy.rank || ""}`.trim();
  els.combatEnemyHpBar.style.width = `${hpPercent}%`;
  els.combatEnemyHpBar.textContent = `${hp} / ${maxHp}`;
  const statusList = Array.isArray(enemy.status) ? enemy.status : [];
  const status = statusList.length ? statusList.join("，") : "无";
  console.log("BATTLE_HUD_ENEMY_STATUS_RAW", enemy.status);
  console.log("BATTLE_HUD_ENEMY_STATUS_RENDERED", status);
  els.combatEnemyDetails.textContent = [
    `HP: ${hp} / ${maxHp}`,
    `状态：${status}`,
    `意图：${enemy.intent || "不明"}`,
    `本回合伤害：${source.lastDamageDealt || 0}`,
    `承受伤害：${source.lastDamageTaken || 0}`
  ].join("\n");
  renderSkillButtons(els.combatSkillButtons, state.skills, state);
  renderCombatLog(els.combatLog, source.combatLog);
}

function renderSkillButtons(container, skills, state) {
  if (!container) return;
  container.innerHTML = "";
  const list = Array.isArray(skills) ? skills : [];
  if (!list.length) {
    container.append(createMutedText("No skills available."));
    return;
  }
  for (const skill of list) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "skill-button";
    button.dataset.skillId = skill.id;
    button.dataset.skillName = skill.name;
    button.dataset.skillType = skill.type || "";
    const mpCost = Number(skill.mpCost || 0);
    const cooldown = Number(skill.currentCooldown || 0);
    const mpInsufficient = Number(state.mp || 0) < mpCost;
    button.disabled = mpInsufficient || cooldown > 0;
    button.innerHTML = `
      <span>${escapeText(skill.name || skill.id)}</span>
      <small>MP ${mpCost}${cooldown > 0 ? ` · CD ${cooldown}` : ""}</small>
    `;
    button.title = skill.description || "";
    container.append(button);
  }
}

function renderCombatLog(container, combatLog) {
  if (!container) return;
  container.innerHTML = "";
  const entries = Array.isArray(combatLog) ? combatLog.slice(-3) : [];
  if (!entries.length) {
    container.append(createMutedText("No combat log."));
    return;
  }
  for (const entry of entries) {
    const item = document.createElement("div");
    item.className = "log-item";
    item.textContent = entry;
    container.append(item);
  }
}

function findCurrentEnemy(combat) {
  const enemies = Array.isArray(combat.enemies) ? combat.enemies : [];
  return enemies.find((enemy) => enemy.id === combat.currentEnemyId && Number(enemy.hp || 0) > 0 && !enemy.defeated)
    || enemies.find((enemy) => Number(enemy.hp || 0) > 0 && !enemy.defeated)
    || null;
}

function createQuestBlock(label, quest) {
  const block = document.createElement("article");
  block.className = "quest-item";
  const title = quest.title || quest.id || "Quest";
  const progress = isKnown(quest.progress) ? ` · ${quest.progress}%` : "";
  const heading = label ? `${label}: ${title}` : title;
  block.innerHTML = `
    <div class="quest-title">${escapeText(heading)}<span>${escapeText(progress)}</span></div>
    <p>${escapeText(quest.description || "")}</p>
  `;
  if (quest.clues?.length) {
    const list = document.createElement("ul");
    list.className = "quest-clues";
    for (const clue of quest.clues) {
      const item = document.createElement("li");
      item.textContent = clue;
      list.append(item);
    }
    block.append(list);
  }
  return block;
}

function createQuestArchiveLine(label, quests) {
  const line = document.createElement("p");
  line.className = "quest-archive-line";
  line.textContent = `${label}: ${quests.map((quest) => quest.title || quest.id).join(", ")}`;
  return line;
}

function createMutedText(text) {
  const span = document.createElement("span");
  span.className = "muted";
  span.textContent = text;
  return span;
}

function normalizeQuestLogForRender(questLog) {
  const source = questLog && typeof questLog === "object" && !Array.isArray(questLog) ? questLog : {};
  return {
    main: source.main && typeof source.main === "object" ? source.main : null,
    active: Array.isArray(source.active) ? source.active : [],
    completed: Array.isArray(source.completed) ? source.completed : [],
    failed: Array.isArray(source.failed) ? source.failed : []
  };
}

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

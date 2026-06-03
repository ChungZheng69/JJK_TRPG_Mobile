export const CHARACTER_CONFIG = {
  character_name: "雨宫朔",
  age: 17,
  rank: "自由术师",
  background:
    "地方自由术师出身，尚未加入高专。雨宫家曾与禅院家合作负责外围封锁任务，但朔的姐姐在一次禅院相关任务中死亡，责任却被推回雨宫家。此后朔独自行动，暗中调查禅院家相关记录，并怀有冷静的复仇执念。",
  technique_name: "雨债斩",
  technique_description:
    "战斗开始后展开咒雨。敌人在雨中暴露越久，且移动、突进、闪避、挥击越多，就越会累积雨债，动作逐渐变慢。朔可在敌人迟缓后将雨势压缩成雨刃、风刃或切断线，释放高爆发斩击。",

  starting_hp: 100,
  starting_mp: 58,
  starting_attributes: {
    physique: 52,
    technique: 70,
    cursed_energy: 58,
    mind: 55
  },
  starting_inventory: { items: [] },
  starting_flags: {
    FLAG_free_sorcerer: true,
    FLAG_independent_sorcerer: true,
    FLAG_joined_jujutsu_high: false,

    FLAG_zenin_grudge: true,
    FLAG_revenge_target_locked: true,

    FLAG_collect_rain_stance: false,
    FLAG_rain_stage: 0,
    FLAG_fatigue_level: 0,
    FLAG_overload_risk: 0,
    FLAG_weakness_exposed: false
  },
  starting_objective:
    "以自由术师身份独自行动，调查禅院家相关任务记录，并寻找姐姐死亡事件的真相。"
};

export const DEFAULT_MAX_HP = 100;
export const DEFAULT_MAX_MP = 100;
export const DEFAULT_ATTRIBUTE_MAX = 80;

const BASE_ATTRIBUTES = {
  physique: 52,
  technique: 70,
  cursed_energy: 58,
  mind: 55
};

export function getInitialGameStateFromCharacterConfig() {
  return {
    characterName: CHARACTER_CONFIG.character_name,
    age: CHARACTER_CONFIG.age,
    rank: CHARACTER_CONFIG.rank,
    background: CHARACTER_CONFIG.background,
    techniqueName: CHARACTER_CONFIG.technique_name,
    techniqueDescription: CHARACTER_CONFIG.technique_description,
    hp: clampNumber(CHARACTER_CONFIG.starting_hp, 0, DEFAULT_MAX_HP),
    maxHp: DEFAULT_MAX_HP,
    mp: clampNumber(CHARACTER_CONFIG.starting_mp, 0, DEFAULT_MAX_MP),
    maxMp: DEFAULT_MAX_MP,
    objective: CHARACTER_CONFIG.starting_objective,
    attributes: clampAttributes(CHARACTER_CONFIG.starting_attributes),
    attributeMax: DEFAULT_ATTRIBUTE_MAX,
    inventory: clone(CHARACTER_CONFIG.starting_inventory || { items: [] }),
    flags: clone(CHARACTER_CONFIG.starting_flags || {})
  };
}

export function applyCharacterConfigToDocument(root = document) {
  const characterName = CHARACTER_CONFIG.character_name || "Unknown";
  root.querySelectorAll("[data-character-name]").forEach((element) => {
    element.textContent = characterName;
  });
}

function clampAttributes(attributes) {
  const source = attributes && typeof attributes === "object" ? attributes : {};
  return Object.fromEntries(
    ["physique", "technique", "cursed_energy", "mind"].map((key) => [
      key,
      clampNumber(source[key] ?? BASE_ATTRIBUTES[key], 0, DEFAULT_ATTRIBUTE_MAX)
    ])
  );
}

function clampNumber(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}
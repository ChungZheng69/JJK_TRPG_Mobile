export const CHARACTER_CONFIG = {
  character_name: "雨宫朔",
  age: 17,
  rank: "自由术师",
  background:
    "地方自由术师出身，尚未加入高专。雨宫家曾与禅院家合作负责外围封锁任务，但朔的姐姐在一次禅院相关任务中死亡，责任却被推回雨宫家。此后朔独自行动，暗中调查禅院家相关记录，并怀有冷静的复仇执念。",
  technique_name: "雨债斩",
  technique_description:
    "战斗开始后展开咒雨。敌人在雨中暴露越久，且移动、突进、闪避、挥击越多，就越会累积雨债，动作逐渐变慢。朔可在敌人迟缓后将雨势压缩成雨刃、风刃或切断线，释放高爆发斩击。",

  character: {
    name: "\u96e8\u5bab\u6714",
    age: 17,
    gender: "",
    role: "\u81ea\u7531\u672f\u5e08",
    affiliation: "\u672a\u52a0\u5165\u9ad8\u4e13",
    rank: "\u51c6\u4e00\u7ea7\u5019\u8865",
    appearance: "",
    personality: "",
    background:
      "\u5730\u65b9\u81ea\u7531\u672f\u5e08\u51fa\u8eab\uff0c\u5c1a\u672a\u52a0\u5165\u9ad8\u4e13\u3002\u96e8\u5bab\u5bb6\u66fe\u4e0e\u7985\u9662\u5bb6\u5408\u4f5c\u8d1f\u8d23\u5916\u56f4\u5c01\u9501\u4efb\u52a1\uff0c\u4f46\u6714\u7684\u59d0\u59d0\u5728\u4e00\u6b21\u7985\u9662\u76f8\u5173\u4efb\u52a1\u4e2d\u6b7b\u4ea1\uff0c\u8d23\u4efb\u5374\u88ab\u63a8\u56de\u96e8\u5bab\u5bb6\u3002\u6b64\u540e\u6714\u72ec\u81ea\u884c\u52a8\uff0c\u6697\u4e2d\u8c03\u67e5\u7985\u9662\u5bb6\u76f8\u5173\u8bb0\u5f55\uff0c\u5e76\u6000\u6709\u51b7\u9759\u7684\u590d\u4ec7\u6267\u5ff5\u3002",
    coreMotivation: "\u8c03\u67e5\u59d0\u59d0\u96e8\u5bab\u6faa\u6b7b\u4ea1\u4e8b\u4ef6\u7684\u771f\u76f8\uff0c\u5e76\u67e5\u6e05\u7985\u9662\u5bb6\u4efb\u52a1\u8bb0\u5f55\u4e2d\u7684\u9690\u7792\u3002",
    technique: {
      name: "\u96e8\u503a\u65a9",
      description:
        "\u6218\u6597\u5f00\u59cb\u540e\u5c55\u5f00\u5492\u96e8\u3002\u654c\u4eba\u5728\u96e8\u4e2d\u66b4\u9732\u8d8a\u4e45\uff0c\u4e14\u79fb\u52a8\u3001\u7a81\u8fdb\u3001\u95ea\u907f\u3001\u6325\u51fb\u8d8a\u591a\uff0c\u5c31\u8d8a\u4f1a\u7d2f\u79ef\u96e8\u503a\uff0c\u52a8\u4f5c\u9010\u6e10\u53d8\u6162\u3002\u6714\u53ef\u5728\u654c\u4eba\u8fdf\u7f13\u540e\u5c06\u96e8\u52bf\u538b\u7f29\u6210\u96e8\u5203\u3001\u98ce\u5203\u6216\u5207\u65ad\u7ebf\uff0c\u91ca\u653e\u9ad8\u7206\u53d1\u65a9\u51fb\u3002",
      strengths: ["\u6301\u7eed\u538b\u5236", "\u9650\u5236\u9ad8\u901f\u79fb\u52a8", "\u540e\u671f\u7206\u53d1\u65a9\u51fb"],
      weaknesses: ["\u9700\u8981\u96e8\u52bf\u94fa\u573a", "\u5bf9\u5feb\u901f\u8131\u79bb\u6216\u5f3a\u884c\u53cd\u5236\u8f83\u654f\u611f"],
      stages: []
    }
  },

  starting_hp: 100,
  starting_mp: 100,
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
    "以自由术师身份独自行动，调查禅院家相关任务记录，并寻找姐姐死亡事件的真相。",
  starting_quest_log: {
    main: {
      id: "main_001",
      title: "调查姐姐死亡真相",
      description: "以自由术师身份调查雨宫澪死亡事件与禅院家任务记录。",
      status: "active",
      progress: 0
    },
    active: [
      {
        id: "quest_001",
        title: "调查旧商业街铁门",
        description: "确认铁门后的咒力残秽来源，并判断是否与禅院家封锁痕迹有关。",
        status: "active",
        progress: 0,
        clues: []
      }
    ],
    completed: [],
    failed: []
  },
  starting_timeline: {
    turn: 1,
    day: "第1天",
    timeOfDay: "傍晚",
    location: "未确定地点",
    scene: "开场"
  },
  starting_combat: {
    active: false,
    round: 0,
    enemies: [],
    currentEnemyId: null,
    playerStance: "neutral",
    lastDamageDealt: 0,
    lastDamageTaken: 0,
    combatLog: []
  },
  starting_skills: [
    {
      id: "rain_field",
      name: "咒雨展开",
      type: "setup",
      mpCost: 6,
      attribute: "cursed_energy",
      damageType: "none",
      basePower: 0,
      cooldown: 0,
      currentCooldown: 0,
      description: "展开咒雨领域雏形，为敌人累积雨债。",
      requirements: [],
      effects: {
        applyStatusToEnemy: "雨债Lv1",
        setFlag: "FLAG_rain_field_active"
      }
    },
    {
      id: "rain_blade",
      name: "雨刃",
      type: "attack",
      mpCost: 8,
      attribute: "technique",
      damageType: "technique",
      basePower: 1.0,
      cooldown: 0,
      currentCooldown: 0,
      description: "将雨势压缩成锋利斩击，对单体敌人造成术式伤害。",
      requirements: []
    },
    {
      id: "debt_execution",
      name: "讨雨斩",
      type: "finisher",
      mpCost: 18,
      attribute: "technique",
      damageType: "technique",
      basePower: 1.8,
      cooldown: 2,
      currentCooldown: 0,
      description: "引爆敌人累积的雨债，造成高额伤害。",
      requirements: [{ targetStatusIncludes: "雨债" }]
    },
    {
      id: "rain_guard",
      name: "雨幕防御",
      type: "defense",
      mpCost: 7,
      attribute: "cursed_energy",
      damageType: "none",
      basePower: 0,
      cooldown: 1,
      currentCooldown: 0,
      description: "以咒雨干扰敌人攻势，降低本回合承受伤害。",
      requirements: []
    }
  ]
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
  const character = clone(CHARACTER_CONFIG.character || {});
  return {
    character,
    character_name: character.name || CHARACTER_CONFIG.character_name,
    characterName: character.name || CHARACTER_CONFIG.character_name,
    age: CHARACTER_CONFIG.age,
    rank: character.rank || CHARACTER_CONFIG.rank,
    background: character.background || CHARACTER_CONFIG.background,
    technique_name: character.technique?.name || CHARACTER_CONFIG.technique_name,
    techniqueName: character.technique?.name || CHARACTER_CONFIG.technique_name,
    technique_description: character.technique?.description || CHARACTER_CONFIG.technique_description,
    techniqueDescription: character.technique?.description || CHARACTER_CONFIG.technique_description,
    hp: clampNumber(CHARACTER_CONFIG.starting_hp, 0, DEFAULT_MAX_HP),
    maxHp: DEFAULT_MAX_HP,
    mp: clampNumber(CHARACTER_CONFIG.starting_mp, 0, DEFAULT_MAX_MP),
    maxMp: DEFAULT_MAX_MP,
    objective: CHARACTER_CONFIG.starting_objective,
    attributes: clampAttributes(CHARACTER_CONFIG.starting_attributes),
    attributeMax: DEFAULT_ATTRIBUTE_MAX,
    inventory: clone(CHARACTER_CONFIG.starting_inventory || { items: [] }),
    flags: clone(CHARACTER_CONFIG.starting_flags || {}),
    questLog: clone(CHARACTER_CONFIG.starting_quest_log || {}),
    timeline: clone(CHARACTER_CONFIG.starting_timeline || {}),
    combat: clone(CHARACTER_CONFIG.starting_combat || {}),
    skills: clone(CHARACTER_CONFIG.starting_skills || [])
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

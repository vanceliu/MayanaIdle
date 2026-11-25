import type { Skill } from './skill';
import type { ClassName } from './character';

export interface ClassSkillDef {
  id: string;
  name: string;
  className: ClassName;
  classLevel: number;
  requiredLevel: number;
  /** 技能書的 `ITEM_DEFINITIONS` id。背包比對一律用 id（§ 99.1），名稱由 id 反查 */
  bookItemId: number;
  skill: Omit<Skill, 'lastUsedAt'>;
}

export const CLASS_SKILLS: ClassSkillDef[] = [
  { id: 'shield-bash', name: '盾擊', className: 'knight', classLevel: 1, requiredLevel: 10, bookItemId: 102,
    skill: { id: 'shield-bash', name: '盾擊', level: 1, element: 'none', type: 'attack', target: 'single', power: 32, physicalSnapshot: true, mpCost: 15, cooldown: 10000, range: 1.5, applyDebuff: { category: 'stun', name: '暈眩', description: '無法行動', duration: 1500, shieldDuration: 3000, stun: true, tags: ['stunned'] } } },
  { id: 'rend', name: '裂傷斬', className: 'knight', classLevel: 2, requiredLevel: 20, bookItemId: 103,
    skill: { id: 'rend', name: '裂傷斬', level: 2, element: 'none', type: 'attack', target: 'single', power: 50, physicalSnapshot: true, mpCost: 20, cooldown: 8000, range: 1.5, applyDebuff: { category: 'bleeding', name: '流血', description: '每秒 70% 物理傷害（雙手武器 85%）', dotDamagePercent: 0.7, twoHandedDotDamagePercent: 0.85, dotInterval: 1000, dotDuration: 5000, dotElement: 'none', tags: ['bleeding'] } } },
  { id: 'iron-shield', name: '鋼鐵護盾', className: 'knight', classLevel: 3, requiredLevel: 30, bookItemId: 104,
    skill: { id: 'iron-shield', name: '鋼鐵護盾', level: 3, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 30, cooldown: 30000, range: 0, buffEffect: '減傷40%', buffDuration: 15000, buffModifiers: [{ stat: 'damageReduction', value: 40, isPercent: true }], buffCategory: 'defense-buff' } },
  { id: 'taunt', name: '挑釁怒吼', className: 'knight', classLevel: 4, requiredLevel: 40, bookItemId: 105,
    skill: { id: 'taunt', name: '挑釁怒吼', level: 4, element: 'none', type: 'attack', target: 'single', power: 65, physicalSnapshot: true, mpCost: 25, cooldown: 20000, range: 3, applyDebuff: { category: 'atk-down', name: '挑釁', description: '攻擊力降低20%', duration: 10000, modifiers: [{ stat: 'attack', value: -20, isPercent: true }], tags: ['taunt'] } } },
  { id: 'charge', name: '衝鋒突進', className: 'knight', classLevel: 5, requiredLevel: 50, bookItemId: 163,
    skill: { id: 'charge', name: '衝鋒突進', level: 5, element: 'none', type: 'attack', target: 'single', power: 40, physicalSnapshot: true, mpCost: 15, cooldown: 10000, range: 8, dash: true,
      description: '突進至目標相鄰格後造成物理傷害' } },
  { id: 'blood-curse', name: '血濺咒殺', className: 'knight', classLevel: 6, requiredLevel: 60, bookItemId: 164,
    skill: { id: 'blood-curse', name: '血濺咒殺', level: 6, element: 'dark', type: 'attack', target: 'aoe', power: 40, mpCost: 0, cooldown: 12000, range: 4,
      aoeCenter: 'self', aoeRadius: 4, randomHits: 4, selfHpCostPercent: 15,
      description: '扣自身最大 HP 15%，對 4 格內隨機打 4 下（可重複命中）',
      applyDebuff: { category: 'slow', name: '減速', description: '攻擊速度降低10%', duration: 5000, modifiers: [{ stat: 'attack_speed', value: -10, isPercent: true }], tags: ['slowed'] } } },
  { id: 'vengeance', name: '復仇之刃', className: 'knight', classLevel: 7, requiredLevel: 70, bookItemId: 106,
    skill: { id: 'vengeance', name: '復仇之刃', level: 7, element: 'none', type: 'attack', target: 'single', power: 36, physicalSnapshot: true, mpCost: 50, cooldown: 25000, range: 1.5,
      selfBuff: { category: 'vengeance', name: '復仇', description: '依已損失血量提升攻擊力，最高 +50%',
        duration: 10000, scaleByMissingHp: { stat: 'attack_power', maxPercent: 50 } } } },

  { id: 'precise-shot', name: '精準射擊', className: 'elf', classLevel: 1, requiredLevel: 10, bookItemId: 107,
    skill: { id: 'precise-shot', name: '精準射擊', level: 1, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 15, cooldown: 3000, range: 0, buffEffect: '命中+3', buffDuration: 300000, buffModifiers: [{ stat: 'hit', value: 3, isPercent: false }], buffCategory: 'accuracy' } },
  { id: 'fire-arrow', name: '火矢附魔', className: 'elf', classLevel: 2, requiredLevel: 20, bookItemId: 108,
    skill: { id: 'fire-arrow', name: '火矢附魔', level: 2, element: 'fire', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 3000, range: 0, buffEffect: '攻擊附加火屬性，弓額外 +15 火傷害', buffDuration: 300000, buffModifiers: [{ stat: 'fire_damage', value: 15, isPercent: false }], buffCategory: 'fire-enchant' } },
  { id: 'triple-shot', name: '三連射', className: 'elf', classLevel: 3, requiredLevel: 30, bookItemId: 109,
    skill: { id: 'triple-shot', name: '三連射', level: 3, element: 'none', type: 'attack', target: 'single', power: 0, mpCost: 25, cooldown: 10000, range: 10, hits: 3, requiredWeaponType: 'bow', description: '每箭各自判定命中，傷害同普攻' } },
  { id: 'hawk-eye', name: '鷹眼', className: 'elf', classLevel: 4, requiredLevel: 40, bookItemId: 110,
    skill: { id: 'hawk-eye', name: '鷹眼', level: 4, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 30, cooldown: 3000, range: 0, buffEffect: '命中+5,遠攻+3', buffDuration: 300000, buffModifiers: [{ stat: 'hit', value: 5, isPercent: false }, { stat: 'ranged_attack', value: 3, isPercent: false }], buffCategory: 'accuracy' } },
  { id: 'binding-arrow', name: '束縛箭', className: 'elf', classLevel: 5, requiredLevel: 50, bookItemId: 165,
    skill: { id: 'binding-arrow', name: '束縛箭', level: 5, element: 'none', type: 'attack', target: 'single', power: 20, physicalSnapshot: true, mpCost: 20, cooldown: 10000, range: 10, requiredWeaponType: 'bow',
      applyDebuff: { category: 'root', name: '定身', description: '無法移動', duration: 5000, root: true, tags: ['rooted'] } } },
  { id: 'leap-shot', name: '後躍射擊', className: 'elf', classLevel: 6, requiredLevel: 60, bookItemId: 166,
    skill: { id: 'leap-shot', name: '後躍射擊', level: 6, element: 'none', type: 'attack', target: 'single', power: 40, physicalSnapshot: true, mpCost: 30, cooldown: 12000, range: 8, requiredWeaponType: 'bow', retreat: 2,
      description: '後退 2 格再射擊' } },
  { id: 'arrow-rain', name: '穿透箭雨', className: 'elf', classLevel: 7, requiredLevel: 70, bookItemId: 111,
    skill: { id: 'arrow-rain', name: '穿透箭雨', level: 7, element: 'none', type: 'attack', target: 'aoe', power: 37, mpCost: 55, cooldown: 15000, range: 10, aoeCenter: 'target', aoeRadius: 6, maxTargets: 6, requiredWeaponType: 'bow', ignoreDefensePercent: 50, description: '無視目標 50% 防禦' } },

  { id: 'cd-reduce', name: '冷卻縮減', className: 'elementalist', classLevel: 1, requiredLevel: 10, bookItemId: 112,
    skill: { id: 'cd-reduce', name: '冷卻縮減', level: 1, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 60000, range: 0, buffEffect: '冷卻-30%', buffDuration: 30000, buffModifiers: [{ stat: 'cooldown_reduction', value: 30, isPercent: true }], buffCategory: 'cd-reduction' } },
  { id: 'mana-drain', name: '魔力奪取', className: 'elementalist', classLevel: 2, requiredLevel: 20, bookItemId: 113,
    skill: { id: 'mana-drain', name: '魔力奪取', level: 2, element: 'none', type: 'attack', target: 'single', power: 30, mpDrainRatio: 1, mpCost: 0, cooldown: 6000, range: 8, description: '造成傷害，回復等同傷害的 MP' } },
  { id: 'element-boost', name: '元素增幅', className: 'elementalist', classLevel: 3, requiredLevel: 30, bookItemId: 114,
    skill: { id: 'element-boost', name: '元素增幅', level: 3, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 35, cooldown: 60000, range: 0, buffEffect: '元素傷害+25%', buffDuration: 30000, buffModifiers: [{ stat: 'skill_elemental', value: 25, isPercent: true }], buffCategory: 'element-boost' } },
  { id: 'greater-cd-reduce', name: '魔法節約', className: 'elementalist', classLevel: 4, requiredLevel: 40, bookItemId: 115,
    skill: { id: 'greater-cd-reduce', name: '魔法節約', level: 4, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 40, cooldown: 60000, range: 0, buffEffect: '魔法消耗-30%', buffDuration: 30000, buffModifiers: [{ stat: 'mp_cost_reduction', value: 30, isPercent: true }], buffCategory: 'mana-saving' } },
  { id: 'mana-shield', name: '魔力護盾', className: 'elementalist', classLevel: 5, requiredLevel: 50, bookItemId: 167,
    skill: { id: 'mana-shield', name: '魔力護盾', level: 5, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 0, cooldown: 30000, range: 0,
      buffEffect: '減傷最高 20%，依目前 MP 比例', buffDuration: 20000,
      buffModifiers: [{ stat: 'mana_shield', value: 20, isPercent: true }], buffCategory: 'mana-shield' } },
  { id: 'mana-spring', name: '魔力湧泉', className: 'elementalist', classLevel: 6, requiredLevel: 60, bookItemId: 168,
    skill: { id: 'mana-spring', name: '魔力湧泉', level: 6, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 0, selfHpCostPercent: 10, cooldown: 30000, range: 0,
      buffEffect: '每次回魔另加最大 MP 8%，施放扣最大 HP 10%', buffDuration: 60000,
      buffModifiers: [{ stat: 'mp_regen_max_percent', value: 8, isPercent: true }], buffCategory: 'mana-spring' } },
  { id: 'element-storm', name: '元素風暴', className: 'elementalist', classLevel: 7, requiredLevel: 70, bookItemId: 116,
    skill: { id: 'element-storm', name: '元素風暴', level: 7, element: 'fire', type: 'attack', target: 'aoe', power: 55, mpCost: 80, cooldown: 20000, range: 12, aoeCenter: 'target', aoeRadius: 10, maxTargets: 10 } },

  { id: 'holy-shield', name: '聖光護盾', className: 'priest', classLevel: 1, requiredLevel: 10, bookItemId: 117,
    skill: { id: 'holy-shield', name: '聖光護盾', level: 1, element: 'light', type: 'buff', target: 'single', power: 0, mpCost: 25, cooldown: 30000, range: 0, buffEffect: '吸收 100＋技能攻擊力 10 的傷害', buffDuration: 20000, buffModifiers: [{ stat: 'shield_absorb', value: 100, isPercent: false }], shieldPower: 10, buffCategory: 'holy-shield' } },
  // 內部 id 沿用取代前的 `high-heal`：已學會者、快捷列、技能書自動轉為精神匯聚（`23-class-magic.md` § 23.6）
  { id: 'high-heal', name: '精神匯聚', className: 'priest', classLevel: 2, requiredLevel: 20, bookItemId: 118,
    skill: { id: 'high-heal', name: '精神匯聚', level: 2, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 10, cooldown: 60000, range: 0,
      buffEffect: '每次回魔另加最大 MP 5%，冷卻 -20%', buffDuration: 300000,
      buffModifiers: [{ stat: 'mp_regen_max_percent', value: 5, isPercent: true }, { stat: 'cooldown_reduction', value: 20, isPercent: true }], buffCategory: 'spirit-gathering' } },
  { id: 'group-heal', name: '群體治癒', className: 'priest', classLevel: 3, requiredLevel: 30, bookItemId: 119,
    skill: { id: 'group-heal', name: '群體治癒', level: 3, element: 'none', type: 'heal', target: 'aoe', power: 53, mpCost: 60, cooldown: 15000, range: 0 } },
  { id: 'holy-judgment', name: '聖光審判', className: 'priest', classLevel: 4, requiredLevel: 40, bookItemId: 120,
    skill: { id: 'holy-judgment', name: '聖光審判', level: 4, element: 'light', type: 'attack', target: 'aoe', power: 45, mpCost: 60, cooldown: 15000, range: 10, aoeCenter: 'target', aoeRadius: 6, maxTargets: 6 } },
  { id: 'blood-mana', name: '血魔轉換', className: 'priest', classLevel: 5, requiredLevel: 50, bookItemId: 169,
    skill: { id: 'blood-mana', name: '血魔轉換', level: 5, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 0, cooldown: 10000, range: 0,
      selfHpCostPercent: 20, mpRestorePercent: 20,
      description: '扣最大 HP 20%，回復最大 MP 20%' } },
  { id: 'holy-smite', name: '神聖懲擊', className: 'priest', classLevel: 6, requiredLevel: 60, bookItemId: 170,
    skill: { id: 'holy-smite', name: '神聖懲擊', level: 6, element: 'light', type: 'attack', target: 'single', power: 53, mpCost: 30, cooldown: 10000, range: 10,
      lifestealPercent: 10, description: '光屬性傷害，回復傷害 10% 的 HP' } },
  { id: 'holy-domain', name: '神聖領域', className: 'priest', classLevel: 7, requiredLevel: 70, bookItemId: 121,
    skill: { id: 'holy-domain', name: '神聖領域', level: 7, element: 'light', type: 'buff', target: 'aoe', power: 0, mpCost: 90, cooldown: 90000, range: 0, buffEffect: '減傷30%+免疫負面', buffDuration: 10000, buffModifiers: [{ stat: 'damageReduction', value: 30, isPercent: true }], buffCategory: 'sanctuary', immuneDebuff: true } },

  { id: 'envenom', name: '淬毒', className: 'thief', classLevel: 1, requiredLevel: 10, bookItemId: 122,
    skill: { id: 'envenom', name: '淬毒', level: 1, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 15, cooldown: 3000, range: 0, buffEffect: '普攻附毒，物理傷害30%每秒持續5s', buffDuration: 300000, buffCategory: 'poison-enchant', onHitDebuff: { category: 'poisoned', name: '中毒', description: '每秒 30% 物理傷害', dotDamagePercent: 0.3, dotInterval: 1000, dotDuration: 5000, dotElement: 'none', tags: ['poisoned'] } } },
  { id: 'deadly-strike', name: '致命一擊', className: 'thief', classLevel: 2, requiredLevel: 20, bookItemId: 123,
    skill: { id: 'deadly-strike', name: '致命一擊', level: 2, element: 'none', type: 'attack', target: 'single', power: 50, physicalSnapshot: true, guaranteedCrit: true, mpCost: 20, cooldown: 10000, description: '必定爆擊' } },
  { id: 'smoke-bomb', name: '煙霧彈', className: 'thief', classLevel: 3, requiredLevel: 30, bookItemId: 124,
    skill: { id: 'smoke-bomb', name: '煙霧彈', level: 3, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 20000, range: 0, buffEffect: '絕對迴避怪物攻擊 1 次', buffDuration: 10000, evadeCharges: 1, buffCategory: 'evasion' } },
  { id: 'precision-strike', name: '精準打擊', className: 'thief', classLevel: 4, requiredLevel: 40, bookItemId: 125,
    skill: { id: 'precision-strike', name: '精準打擊', level: 4, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 25, cooldown: 3000, range: 0, buffEffect: '命中+10,爆擊+10%', buffDuration: 300000, buffModifiers: [{ stat: 'hit', value: 10, isPercent: false }, { stat: 'crit_rate', value: 10, isPercent: true }], buffCategory: 'accuracy' } },
  { id: 'backstab', name: '背刺', className: 'thief', classLevel: 5, requiredLevel: 50, bookItemId: 126,
    skill: { id: 'backstab', name: '背刺', level: 5, element: 'none', type: 'attack', target: 'single', power: 69, physicalSnapshot: true, mpCost: 50, cooldown: 20000, range: 8, dash: true,
      selfBuff: { category: 'backstab', name: '背刺', description: '攻擊力 +50%',
        duration: 5000, modifiers: [{ stat: 'attack_power', value: 50, isPercent: true }] } } },
  { id: 'poison-mist', name: '冰霧', className: 'thief', classLevel: 6, requiredLevel: 60, bookItemId: 171,
    skill: { id: 'poison-mist', name: '冰霧', level: 6, element: 'ice', type: 'attack', target: 'aoe', power: 0, mpCost: 30, cooldown: 30000, range: 5,
      aoeCenter: 'self', aoeRadius: 5, dotOnly: true, description: '自身 5 格內的怪物凍傷',
      applyDebuff: { category: 'frostbite', name: '凍傷', description: '攻速 -30%，每秒 70% 物理傷害', dotDamagePercent: 0.7, dotInterval: 1000, dotDuration: 10000, dotElement: 'ice', modifiers: [{ stat: 'attack_speed', value: -30, isPercent: true }], tags: ['frostbite', 'slowed'] } } },
  { id: 'dodge-counter', name: '閃避反擊', className: 'thief', classLevel: 7, requiredLevel: 70, bookItemId: 172,
    skill: { id: 'dodge-counter', name: '閃避反擊', level: 7, element: 'none', type: 'passive', target: 'single', power: 0, mpCost: 0, cooldown: 0, range: 0,
      counterOnDodge: true, description: '閃避近戰攻擊時，若在武器射程內反擊一次普攻' } },
];

const CLASS_SKILL_IDS = new Set(CLASS_SKILLS.map(s => s.id));

/** 這個技能 id 是不是職業魔法（`23-class-magic.md`）。基礎魔法一律 false */
export function isClassMagic(skillId: string | undefined): boolean {
  return !!skillId && CLASS_SKILL_IDS.has(skillId);
}

/**
 * 同職業同級數已學會的職業魔法（`23-class-magic.md` § 23.1 每級限學 1 個）。回 null ＝ 不衝突。
 * 只比對 `CLASS_SKILLS`，基礎魔法不在此限。
 */
export function findLearnedSameTierClassSkill(
  def: ClassSkillDef,
  learnedSkillIds: readonly string[],
  defs: readonly ClassSkillDef[] = CLASS_SKILLS,
): ClassSkillDef | null {
  return defs.find(d => d.id !== def.id
    && d.className === def.className
    && d.classLevel === def.classLevel
    && learnedSkillIds.includes(d.id)) ?? null;
}

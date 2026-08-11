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
    skill: { id: 'shield-bash', name: '盾擊', level: 1, element: 'none', type: 'attack', target: 'single', power: 32, physicalSnapshot: true, mpCost: 15, cooldown: 10000, range: 1.5, applyDebuff: { category: 'stun', name: '暈眩', description: '無法行動，攻擊計時器暫停', duration: 2000, stun: true, tags: ['stunned'] } } },
  { id: 'rend', name: '裂傷斬', className: 'knight', classLevel: 2, requiredLevel: 20, bookItemId: 103,
    skill: { id: 'rend', name: '裂傷斬', level: 2, element: 'none', type: 'attack', target: 'single', power: 81, physicalSnapshot: true, mpCost: 20, cooldown: 8000, range: 1.5, applyDebuff: { category: 'bleeding', name: '流血', description: '每秒 50% 物理傷害', dotDamagePercent: 0.5, dotInterval: 1000, dotDuration: 5000, dotElement: 'none', tags: ['bleeding'] } } },
  { id: 'iron-shield', name: '鋼鐵護盾', className: 'knight', classLevel: 3, requiredLevel: 30, bookItemId: 104,
    skill: { id: 'iron-shield', name: '鋼鐵護盾', level: 3, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 30, cooldown: 30000, range: 0, buffEffect: '減傷20%', buffDuration: 15000, buffModifiers: [{ stat: 'damageReduction', value: 20, isPercent: true }], buffCategory: 'defense-buff' } },
  { id: 'taunt', name: '挑釁怒吼', className: 'knight', classLevel: 4, requiredLevel: 40, bookItemId: 105,
    skill: { id: 'taunt', name: '挑釁怒吼', level: 4, element: 'none', type: 'attack', target: 'single', power: 65, physicalSnapshot: true, mpCost: 25, cooldown: 20000, range: 3, applyDebuff: { category: 'atk-down', name: '挑釁', description: '攻擊力降低20%', duration: 10000, modifiers: [{ stat: 'attack', value: -20, isPercent: true }], tags: ['taunt'] } } },
  { id: 'vengeance', name: '復仇之刃', className: 'knight', classLevel: 5, requiredLevel: 50, bookItemId: 106,
    skill: { id: 'vengeance', name: '復仇之刃', level: 5, element: 'none', type: 'attack', target: 'single', power: 84, mpCost: 50, cooldown: 25000, range: 1.5,
      selfBuff: { category: 'vengeance', name: '復仇', description: '依已損失血量提升攻擊力，最高 +50%',
        duration: 10000, scaleByMissingHp: { stat: 'attack_power', maxPercent: 50 } } } },

  { id: 'precise-shot', name: '精準射擊', className: 'elf', classLevel: 1, requiredLevel: 10, bookItemId: 107,
    skill: { id: 'precise-shot', name: '精準射擊', level: 1, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 15, cooldown: 3000, range: 0, buffEffect: '命中+3', buffDuration: 300000, buffModifiers: [{ stat: 'hit', value: 3, isPercent: false }], buffCategory: 'accuracy' } },
  { id: 'fire-arrow', name: '火矢附魔', className: 'elf', classLevel: 2, requiredLevel: 20, bookItemId: 108,
    skill: { id: 'fire-arrow', name: '火矢附魔', level: 2, element: 'fire', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 3000, range: 0, buffEffect: '攻擊附加火屬性，弓額外+15火傷害，持續300s', buffDuration: 300000, buffModifiers: [{ stat: 'fire_damage', value: 15, isPercent: false }], buffCategory: 'fire-enchant' } },
  { id: 'triple-shot', name: '三連射', className: 'elf', classLevel: 3, requiredLevel: 30, bookItemId: 109,
    skill: { id: 'triple-shot', name: '三連射', level: 3, element: 'none', type: 'attack', target: 'single', power: 0, mpCost: 25, cooldown: 8000, range: 15, hits: 3, requiredWeaponType: 'bow', description: '每箭獨立判定命中，傷害走物理普攻公式' } },
  { id: 'hawk-eye', name: '鷹眼', className: 'elf', classLevel: 4, requiredLevel: 40, bookItemId: 110,
    skill: { id: 'hawk-eye', name: '鷹眼', level: 4, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 30, cooldown: 3000, range: 0, buffEffect: '命中+5,遠攻+3', buffDuration: 300000, buffModifiers: [{ stat: 'hit', value: 5, isPercent: false }, { stat: 'ranged_attack', value: 3, isPercent: false }], buffCategory: 'accuracy' } },
  { id: 'arrow-rain', name: '穿透箭雨', className: 'elf', classLevel: 5, requiredLevel: 50, bookItemId: 111,
    skill: { id: 'arrow-rain', name: '穿透箭雨', level: 5, element: 'none', type: 'attack', target: 'aoe', power: 37, mpCost: 55, cooldown: 15000, range: 15, aoeCenter: 'target', aoeRadius: 6, maxTargets: 6, requiredWeaponType: 'bow', ignoreDefensePercent: 50, description: '無視目標 50% 防禦' } },

  { id: 'cd-reduce', name: '冷卻縮減', className: 'elementalist', classLevel: 1, requiredLevel: 10, bookItemId: 112,
    skill: { id: 'cd-reduce', name: '冷卻縮減', level: 1, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 60000, range: 0, buffEffect: '冷卻-20%', buffDuration: 30000, buffModifiers: [{ stat: 'cooldown_reduction', value: 20, isPercent: true }], buffCategory: 'cd-reduction' } },
  { id: 'mana-drain', name: '魔力奪取', className: 'elementalist', classLevel: 2, requiredLevel: 20, bookItemId: 113,
    skill: { id: 'mana-drain', name: '魔力奪取', level: 2, element: 'none', type: 'attack', target: 'single', power: 13, mpDrainRatio: 1, mpCost: 0, cooldown: 12000, range: 8, description: '造成傷害，並回復等同最終傷害的MP' } },
  { id: 'element-boost', name: '元素增幅', className: 'elementalist', classLevel: 3, requiredLevel: 30, bookItemId: 114,
    skill: { id: 'element-boost', name: '元素增幅', level: 3, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 35, cooldown: 60000, range: 0, buffEffect: '元素傷害+25%', buffDuration: 30000, buffModifiers: [{ stat: 'skill_elemental', value: 25, isPercent: true }], buffCategory: 'element-boost' } },
  { id: 'greater-cd-reduce', name: '強化冷卻縮減', className: 'elementalist', classLevel: 4, requiredLevel: 40, bookItemId: 115,
    skill: { id: 'greater-cd-reduce', name: '強化冷卻縮減', level: 4, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 40, cooldown: 90000, range: 0, buffEffect: '冷卻-40%', buffDuration: 30000, buffModifiers: [{ stat: 'cooldown_reduction', value: 40, isPercent: true }], buffCategory: 'cd-reduction' } },
  { id: 'element-storm', name: '元素風暴', className: 'elementalist', classLevel: 5, requiredLevel: 50, bookItemId: 116,
    skill: { id: 'element-storm', name: '元素風暴', level: 5, element: 'fire', type: 'attack', target: 'aoe', power: 53, mpCost: 80, cooldown: 20000, range: 12, aoeCenter: 'target', aoeRadius: 10, maxTargets: 10 } },

  { id: 'holy-shield', name: '聖光護盾', className: 'priest', classLevel: 1, requiredLevel: 10, bookItemId: 117,
    skill: { id: 'holy-shield', name: '聖光護盾', level: 1, element: 'light', type: 'buff', target: 'single', power: 0, mpCost: 25, cooldown: 30000, range: 0, buffEffect: '吸收100傷害', buffDuration: 20000, buffModifiers: [{ stat: 'shield_absorb', value: 100, isPercent: false }], buffCategory: 'holy-shield' } },
  { id: 'high-heal', name: '高階治癒', className: 'priest', classLevel: 2, requiredLevel: 20, bookItemId: 118,
    skill: { id: 'high-heal', name: '高階治癒', level: 2, element: 'none', type: 'heal', target: 'single', power: 216, mpCost: 40, cooldown: 10000, range: 0 } },
  { id: 'group-heal', name: '群體治癒', className: 'priest', classLevel: 3, requiredLevel: 30, bookItemId: 119,
    skill: { id: 'group-heal', name: '群體治癒', level: 3, element: 'none', type: 'heal', target: 'aoe', power: 108, mpCost: 60, cooldown: 15000, range: 0 } },
  { id: 'holy-judgment', name: '聖光審判', className: 'priest', classLevel: 4, requiredLevel: 40, bookItemId: 120,
    skill: { id: 'holy-judgment', name: '聖光審判', level: 4, element: 'light', type: 'attack', target: 'aoe', power: 37, mpCost: 60, cooldown: 15000, range: 10, aoeCenter: 'target', aoeRadius: 6, maxTargets: 6 } },
  { id: 'holy-domain', name: '神聖領域', className: 'priest', classLevel: 5, requiredLevel: 50, bookItemId: 121,
    skill: { id: 'holy-domain', name: '神聖領域', level: 5, element: 'light', type: 'buff', target: 'aoe', power: 0, mpCost: 90, cooldown: 90000, range: 0, buffEffect: '減傷30%+免疫負面', buffDuration: 10000, buffModifiers: [{ stat: 'damageReduction', value: 30, isPercent: true }], buffCategory: 'sanctuary', immuneDebuff: true } },

  { id: 'envenom', name: '淬毒', className: 'thief', classLevel: 1, requiredLevel: 10, bookItemId: 122,
    skill: { id: 'envenom', name: '淬毒', level: 1, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 15, cooldown: 3000, range: 0, buffEffect: '普攻附毒，物理傷害30%每秒持續5s', buffDuration: 300000, buffCategory: 'poison-enchant', onHitDebuff: { category: 'poisoned', name: '中毒', description: '每秒 30% 物理傷害', dotDamagePercent: 0.3, dotInterval: 1000, dotDuration: 5000, dotElement: 'none', tags: ['poisoned'] } } },
  { id: 'deadly-strike', name: '致命一擊', className: 'thief', classLevel: 2, requiredLevel: 20, bookItemId: 123,
    skill: { id: 'deadly-strike', name: '致命一擊', level: 2, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 25, cooldown: 30000, range: 0, buffEffect: '爆傷+50%', buffDuration: 15000, buffModifiers: [{ stat: 'crit_damage', value: 50, isPercent: true }], buffCategory: 'crit-buff' } },
  { id: 'smoke-bomb', name: '煙霧彈', className: 'thief', classLevel: 3, requiredLevel: 30, bookItemId: 124,
    skill: { id: 'smoke-bomb', name: '煙霧彈', level: 3, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 20000, range: 0, buffEffect: '迴避+15%', buffDuration: 10000, buffModifiers: [{ stat: 'evasion', value: 15, isPercent: true }], buffCategory: 'evasion' } },
  { id: 'precision-strike', name: '精準打擊', className: 'thief', classLevel: 4, requiredLevel: 40, bookItemId: 125,
    skill: { id: 'precision-strike', name: '精準打擊', level: 4, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 25, cooldown: 3000, range: 0, buffEffect: '命中+10,爆擊+10%', buffDuration: 300000, buffModifiers: [{ stat: 'hit', value: 10, isPercent: false }, { stat: 'crit_rate', value: 10, isPercent: true }], buffCategory: 'accuracy' } },
  { id: 'backstab', name: '背刺', className: 'thief', classLevel: 5, requiredLevel: 50, bookItemId: 126,
    skill: { id: 'backstab', name: '背刺', level: 5, element: 'none', type: 'attack', target: 'single', power: 104, mpCost: 50, cooldown: 20000, range: 1.5,
      selfBuff: { category: 'backstab', name: '背刺', description: '攻擊力 +50%（×1.5）',
        duration: 5000, modifiers: [{ stat: 'attack_power', value: 50, isPercent: true }] } } },
];

import type { StatModifier } from './effect';

export type SkillTarget = 'single' | 'aoe';
export type SkillType = 'attack' | 'heal' | 'buff' | 'move';
export type SkillElement = 'fire' | 'ice' | 'wind' | 'earth' | 'light' | 'dark' | 'none';

export interface SkillDebuffDef {
  category: string;
  name: string;
  description: string;
  dotDamagePercent?: number;
  dotDamage?: number;
  dotInterval?: number;
  dotDuration?: number;
  dotElement?: string;
  duration?: number;
  modifiers?: { stat: string; value: number; isPercent: boolean }[];
  stun?: boolean;
  tags: string[];
}

export interface Skill {
  id: string;
  name: string;
  level: number; // magic level (1~10)
  element: SkillElement;
  type: SkillType;
  target: SkillTarget;
  power: number;
  healAmount?: number;
  mpCost: number;
  cooldown: number; // ms
  lastUsedAt: number;
  range?: number; // 施放距離（格數）。0=對自身、1.5=近戰、>1.5=遠程
  aoeMin?: number;
  aoeMax?: number;
  description?: string;
  buffEffect?: string;
  buffDuration?: number; // ms
  buffModifiers?: StatModifier[];
  buffCategory?: string;
  cleanse?: boolean;
  hits?: number; // multi-hit: uses physical attack formula per hit
  hotAmount?: number; // heal over time per second
  invincible?: boolean;
  requiredWeaponType?: string;
  applyDebuff?: SkillDebuffDef;
  onHitDebuff?: SkillDebuffDef;
}

export const SKILL_CATALOG: Omit<Skill, 'lastUsedAt'>[] = [
  // Level 1
  { id: 'wind-blade', name: '風刃', level: 1, element: 'wind', type: 'attack', target: 'single', power: 10, mpCost: 5, cooldown: 3000, range: 10 },
  { id: 'bless-weapon', name: '祝福武器', level: 1, element: 'light', type: 'buff', target: 'single', power: 0, mpCost: 10, cooldown: 3000, range: 0, buffEffect: '對不死系命中+5', buffDuration: 600000, buffModifiers: [{ stat: 'hit_undead', value: 5, isPercent: false }] },
  { id: 'ice-bolt', name: '冰彈', level: 1, element: 'ice', type: 'attack', target: 'single', power: 10, mpCost: 5, cooldown: 3000, range: 10 },
  { id: 'heal', name: '治癒', level: 1, element: 'none', type: 'heal', target: 'single', power: 0, healAmount: 35, mpCost: 15, cooldown: 6000, range: 0 },
  { id: 'teleport', name: '傳送術', level: 1, element: 'none', type: 'move', target: 'single', power: 0, mpCost: 10, cooldown: 3000, range: 0 },
  // Level 2
  { id: 'thunder-strike', name: '風雷擊', level: 2, element: 'wind', type: 'attack', target: 'single', power: 18, mpCost: 9, cooldown: 4000, range: 10 },
  { id: 'flame-arrow', name: '火焰箭', level: 2, element: 'fire', type: 'attack', target: 'single', power: 20, mpCost: 10, cooldown: 4000, range: 12 },
  { id: 'frost', name: '寒霜', level: 2, element: 'ice', type: 'attack', target: 'single', power: 18, mpCost: 9, cooldown: 4000, range: 10 },
  { id: 'shadow-ball', name: '暗影球', level: 2, element: 'dark', type: 'attack', target: 'single', power: 20, mpCost: 10, cooldown: 4000, range: 10 },
  { id: 'holy-bolt', name: '聖光彈', level: 2, element: 'light', type: 'attack', target: 'single', power: 20, mpCost: 10, cooldown: 4000, range: 10 },
  // Level 3
  { id: 'rock-fall', name: '落石', level: 3, element: 'earth', type: 'attack', target: 'single', power: 25, mpCost: 15, cooldown: 6000, range: 12 },
  { id: 'fireball', name: '火球', level: 3, element: 'fire', type: 'attack', target: 'aoe', power: 25, mpCost: 15, cooldown: 6000, range: 12, aoeMin: 2, aoeMax: 3 },
  { id: 'ice-fog', name: '冰霧', level: 3, element: 'ice', type: 'attack', target: 'aoe', power: 15, mpCost: 14, cooldown: 6000, range: 12, aoeMin: 2, aoeMax: 3 },
  { id: 'mid-heal', name: '中治癒', level: 3, element: 'none', type: 'heal', target: 'single', power: 0, healAmount: 70, mpCost: 25, cooldown: 8000, range: 0 },
  { id: 'magic-armor', name: '魔法盔甲', level: 3, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 3000, range: 0, buffEffect: '防禦+5', buffDuration: 600000, buffModifiers: [{ stat: 'defense', value: 5, isPercent: false }] },
  // Level 4
  { id: 'storm', name: '風暴', level: 4, element: 'wind', type: 'attack', target: 'aoe', power: 35, mpCost: 20, cooldown: 5000, range: 12, aoeMin: 3, aoeMax: 4 },
  { id: 'inferno', name: '炎爆', level: 4, element: 'fire', type: 'attack', target: 'aoe', power: 30, mpCost: 22, cooldown: 7000, range: 12, aoeMin: 3, aoeMax: 4 },
  { id: 'ice-lance', name: '冰槍', level: 4, element: 'ice', type: 'attack', target: 'single', power: 38, mpCost: 20, cooldown: 5000, range: 12 },
  { id: 'agility-boost', name: '敏捷提升', level: 4, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 30, cooldown: 3000, range: 0, buffEffect: '敏捷+5', buffDuration: 600000, buffModifiers: [{ stat: 'agility', value: 5, isPercent: false }] },
  { id: 'vampire-kiss', name: '吸血鬼之吻', level: 4, element: 'none', type: 'attack', target: 'single', power: 30, mpCost: 20, cooldown: 3000, range: 1.5, healAmount: 30 },
  // Level 5
  { id: 'gale-storm', name: '狂風暴', level: 5, element: 'wind', type: 'attack', target: 'aoe', power: 35, mpCost: 30, cooldown: 8000, range: 12, aoeMin: 3, aoeMax: 5 },
  { id: 'hellfire', name: '業火', level: 5, element: 'fire', type: 'attack', target: 'aoe', power: 40, mpCost: 35, cooldown: 8000, range: 12, aoeMin: 3, aoeMax: 5 },
  { id: 'ice-ring', name: '冰環', level: 5, element: 'ice', type: 'attack', target: 'aoe', power: 35, mpCost: 30, cooldown: 8000, range: 12, aoeMin: 3, aoeMax: 5 },
  { id: 'great-heal', name: '大治癒', level: 5, element: 'none', type: 'heal', target: 'single', power: 0, healAmount: 150, mpCost: 40, cooldown: 10000, range: 0 },
  { id: 'holy-light', name: '聖光術', level: 5, element: 'light', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 3000, range: 0, buffEffect: '淨化負面狀態', buffDuration: 0, cleanse: true },
  // Level 6
  { id: 'strength-boost', name: '力量提升', level: 6, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 40, cooldown: 3000, range: 0, buffEffect: '力量+5', buffDuration: 600000, buffModifiers: [{ stat: 'str', value: 5, isPercent: false }] },
  { id: 'flame-pillar', name: '炎柱', level: 6, element: 'fire', type: 'attack', target: 'single', power: 55, mpCost: 35, cooldown: 6000, range: 12 },
  { id: 'earth-rend', name: '地裂術', level: 6, element: 'earth', type: 'attack', target: 'single', power: 50, mpCost: 35, cooldown: 6000, range: 12 },
  { id: 'haste', name: '加速術', level: 6, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 30000, range: 0, buffEffect: '攻速+33%', buffDuration: 600000, buffModifiers: [{ stat: 'attack_speed', value: 33, isPercent: true }], buffCategory: 'speed' },
  { id: 'curse', name: '詛咒', level: 6, element: 'dark', type: 'attack', target: 'single', power: 0, mpCost: 35, cooldown: 30000, range: 10, applyDebuff: { category: 'atk-down', name: '詛咒', description: '攻擊力降低15%', duration: 10000, modifiers: [{ stat: 'attack', value: -15, isPercent: true }], tags: ['curse'] } },
  // Level 7
  { id: 'tornado', name: '龍捲風', level: 7, element: 'wind', type: 'attack', target: 'aoe', power: 55, mpCost: 45, cooldown: 10000, range: 12, aoeMin: 4, aoeMax: 6 },
  { id: 'meteor-shot', name: '隕石彈', level: 7, element: 'fire', type: 'attack', target: 'aoe', power: 60, mpCost: 50, cooldown: 10000, range: 12, aoeMin: 4, aoeMax: 6 },
  { id: 'recovery', name: '體力回復術', level: 7, element: 'none', type: 'heal', target: 'single', power: 0, healAmount: 300, mpCost: 60, cooldown: 12000, range: 0 },
  { id: 'armor-break', name: '護甲崩壞', level: 7, element: 'earth', type: 'attack', target: 'single', power: 0, mpCost: 40, cooldown: 20000, range: 10, applyDebuff: { category: 'defense-down', name: '護甲崩壞', description: '防禦值降低15%', duration: 15000, modifiers: [{ stat: 'defense', value: -15, isPercent: true }], tags: ['armor-break'] } },
  { id: 'shadow-burst', name: '暗影爆發', level: 7, element: 'dark', type: 'attack', target: 'aoe', power: 60, mpCost: 50, cooldown: 10000, range: 12, aoeMin: 4, aoeMax: 6 },
  // Level 8
  { id: 'chain-lightning', name: '閃電鎖鏈', level: 8, element: 'wind', type: 'attack', target: 'aoe', power: 50, mpCost: 55, cooldown: 10000, range: 12, aoeMin: 5, aoeMax: 7 },
  { id: 'purgatory', name: '煉獄火', level: 8, element: 'fire', type: 'attack', target: 'aoe', power: 70, mpCost: 60, cooldown: 12000, range: 12, aoeMin: 5, aoeMax: 7 },
  { id: 'blizzard', name: '冰暴', level: 8, element: 'ice', type: 'attack', target: 'aoe', power: 55, mpCost: 45, cooldown: 10000, range: 12, aoeMin: 4, aoeMax: 6 },
  { id: 'full-heal', name: '完全治癒', level: 8, element: 'none', type: 'heal', target: 'single', power: 0, healAmount: 500, mpCost: 80, cooldown: 15000, range: 0 },
  { id: 'greater-haste', name: '強化加速術', level: 8, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 60, cooldown: 100000, range: 0, buffEffect: '攻速+40%', buffDuration: 600000, buffModifiers: [{ stat: 'attack_speed', value: 40, isPercent: true }], buffCategory: 'speed' },
  // Level 9
  { id: 'mass-teleport', name: '集體傳送術', level: 9, element: 'none', type: 'move', target: 'single', power: 0, mpCost: 70, cooldown: 12000, range: 0 },
  { id: 'meteor-shower', name: '流星雨', level: 9, element: 'fire', type: 'attack', target: 'aoe', power: 85, mpCost: 75, cooldown: 14000, range: 15, aoeMin: 6, aoeMax: 8 },
  { id: 'blizzard-storm', name: '暴風雪', level: 9, element: 'ice', type: 'attack', target: 'aoe', power: 80, mpCost: 70, cooldown: 12000, range: 12, aoeMin: 6, aoeMax: 8 },
  { id: 'sanctuary', name: '聖域', level: 9, element: 'light', type: 'buff', target: 'single', power: 0, mpCost: 90, cooldown: 90000, range: 0, buffEffect: '減傷25%+每秒回血20', buffDuration: 10000, buffModifiers: [{ stat: 'defense', value: 25, isPercent: true }], buffCategory: 'sanctuary', hotAmount: 20 },
  { id: 'earth-shatter', name: '震裂術', level: 9, element: 'earth', type: 'attack', target: 'aoe', power: 85, mpCost: 75, cooldown: 14000, range: 15, aoeMin: 6, aoeMax: 8 },
  // Level 10
  { id: 'divine-thunder', name: '天雷', level: 10, element: 'wind', type: 'attack', target: 'aoe', power: 100, mpCost: 90, cooldown: 15000, range: 15, aoeMin: 1, aoeMax: 10 },
  { id: 'apocalypse-flame', name: '末日烈焰', level: 10, element: 'fire', type: 'attack', target: 'aoe', power: 100, mpCost: 90, cooldown: 15000, range: 15, aoeMin: 1, aoeMax: 10 },
  { id: 'absolute-zero', name: '極冰封印', level: 10, element: 'ice', type: 'attack', target: 'aoe', power: 70, mpCost: 85, cooldown: 45000, range: 15, aoeMin: 6, aoeMax: 10 },
  { id: 'ultimate-ray', name: '究極光裂術', level: 10, element: 'none', type: 'attack', target: 'single', power: 110, mpCost: 100, cooldown: 10000, range: 15 },
  { id: 'absolute-barrier', name: '絕對屏障', level: 10, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 100, cooldown: 120000, range: 0, buffEffect: '無敵10s', buffDuration: 10000, buffModifiers: [], buffCategory: 'invincible', invincible: true },
];

export const SKILL_WIND_BLADE: Skill = {
  ...SKILL_CATALOG.find(s => s.id === 'wind-blade')!,
  lastUsedAt: 0,
};

export function isSkillReady(skill: Skill, now: number, cooldownReductionPercent: number = 0): boolean {
  const effectiveCooldown = Math.floor(skill.cooldown * (1 - Math.min(cooldownReductionPercent, 50) / 100));
  return now - skill.lastUsedAt >= effectiveCooldown;
}

export function canUseSkill(skill: Skill, mp: number, now: number, cooldownReductionPercent: number = 0): boolean {
  return mp >= skill.mpCost && isSkillReady(skill, now, cooldownReductionPercent);
}

export function instantiateSkill(id: string): Skill | null {
  const template = SKILL_CATALOG.find(s => s.id === id);
  if (!template) return null;
  return { ...template, lastUsedAt: 0 };
}

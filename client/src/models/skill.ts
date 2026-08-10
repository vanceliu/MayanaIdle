import type { StatModifier } from './effect';

export type SkillTarget = 'single' | 'aoe';
export type SkillType = 'attack' | 'heal' | 'buff';
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

/**
 * 攻擊技能附帶的「對自身 buff」。
 * 於傷害結算前施加，因此本次攻擊也吃得到加成。
 */
export interface SkillSelfBuff {
  category: string;
  name: string;
  description: string;
  /** 持續時間（ms） */
  duration: number;
  /** 固定加成 */
  modifiers?: StatModifier[];
  /**
   * 依施放當下的「已損失血量比率」動態決定加成（§ 23.3 復仇之刃）。
   * 加成% = min(maxPercent, (1 - hp/maxHp) × 100)
   */
  scaleByMissingHp?: { stat: string; maxPercent: number };
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
  lifestealPercent?: number; // Restore HP from final damage dealt (100 = 100%)
  mpDrainRatio?: number; // Restore MP from final damage dealt (1 = 100%)
  mpCost: number;
  cooldown: number; // ms
  lastUsedAt: number;
  range?: number; // 施放距離（格數）。0=對自身、1.5=近戰、>1.5=遠程
  /** AOE 圓心模式（41-arpg-combat.md § 3.4）。target=以主目標為圓心，self=以角色為圓心 */
  aoeCenter?: 'target' | 'self';
  /** AOE 搜索半徑（格數）。undefined = 單體 */
  aoeRadius?: number;
  /** AOE 最大目標數（含主目標）。self 模式無上限，此欄留空 */
  maxTargets?: number;
  description?: string;
  buffEffect?: string;
  buffDuration?: number; // ms
  buffModifiers?: StatModifier[];
  buffCategory?: string;
  cleanse?: boolean;
  hits?: number; // multi-hit: uses physical attack formula per hit
  /**
   * 走「技能攻擊力 + 當下基礎物理傷害」結算（`21-combat-formula.md` § 21.4a）。
   * `power` 是技能攻擊力，物理部分取 `calculateBasePhysicalDamage()`。
   * 仍然必定命中，不做命中判定。目前只有盾擊／裂傷斬／挑釁怒吼。
   */
  physicalSnapshot?: boolean;
  hotAmount?: number; // heal over time per second
  ignoreDefensePercent?: number; // 無視目標防禦的百分比（0~100）
  invincible?: boolean;
  /** buff 生效期間免疫所有負面狀態（§ 23.6 神聖領域） */
  immuneDebuff?: boolean;
  requiredWeaponType?: string;
  applyDebuff?: SkillDebuffDef;
  onHitDebuff?: SkillDebuffDef;
  selfBuff?: SkillSelfBuff;
}

export const WEAPON_TYPE_LABELS: Record<string, string> = {
  bow: '弓',
  sword: '劍',
  dagger: '匕首',
  axe: '斧',
  staff: '杖',
};

export const SKILL_CATALOG: Omit<Skill, 'lastUsedAt'>[] = [
  // Level 1
  { id: 'wind-blade', name: '風刃', level: 1, element: 'wind', type: 'attack', target: 'single', power: 10, mpCost: 5, cooldown: 3000, range: 10 },
  { id: 'bless-weapon', name: '祝福武器', level: 1, element: 'light', type: 'buff', target: 'single', power: 0, mpCost: 10, cooldown: 3000, range: 0, buffEffect: '對不死系命中+5', buffDuration: 600000, buffModifiers: [{ stat: 'hit_undead', value: 5, isPercent: false }], buffCategory: 'weapon-bless' },
  { id: 'ice-bolt', name: '冰彈', level: 1, element: 'ice', type: 'attack', target: 'single', power: 10, mpCost: 5, cooldown: 3000, range: 10 },
  { id: 'heal', name: '治癒', level: 1, element: 'none', type: 'heal', target: 'single', power: 0, healAmount: 35, mpCost: 15, cooldown: 6000, range: 0 },
  { id: 'protect-shield', name: '保護罩', level: 1, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 10, cooldown: 3000, range: 0, buffEffect: '防禦+2', buffDuration: 600000, buffModifiers: [{ stat: 'defense', value: 2, isPercent: false }], buffCategory: 'protect-shield' },
  // Level 2
  { id: 'thunder-strike', name: '風雷擊', level: 2, element: 'wind', type: 'attack', target: 'single', power: 18, mpCost: 9, cooldown: 4000, range: 10 },
  { id: 'flame-arrow', name: '火焰箭', level: 2, element: 'fire', type: 'attack', target: 'single', power: 20, mpCost: 10, cooldown: 4000, range: 12 },
  { id: 'frost', name: '寒霜', level: 2, element: 'ice', type: 'attack', target: 'single', power: 18, mpCost: 9, cooldown: 4000, range: 10, applyDebuff: { category: 'slow', name: '減速', description: '攻擊速度降低30%', duration: 6000, modifiers: [{ stat: 'attack_speed', value: -30, isPercent: true }], tags: ['slowed'] } },
  { id: 'shadow-ball', name: '暗影球', level: 2, element: 'dark', type: 'attack', target: 'single', power: 20, mpCost: 10, cooldown: 4000, range: 10 },
  { id: 'holy-bolt', name: '聖光彈', level: 2, element: 'light', type: 'attack', target: 'single', power: 20, mpCost: 10, cooldown: 4000, range: 10 },
  // Level 3
  { id: 'rock-fall', name: '落石', level: 3, element: 'earth', type: 'attack', target: 'single', power: 25, mpCost: 15, cooldown: 6000, range: 12 },
  { id: 'fireball', name: '火球', level: 3, element: 'fire', type: 'attack', target: 'aoe', power: 25, mpCost: 15, cooldown: 6000, range: 12, aoeCenter: 'target', aoeRadius: 3, maxTargets: 3 },
  { id: 'ice-fog', name: '冰霧', level: 3, element: 'ice', type: 'attack', target: 'aoe', power: 15, mpCost: 14, cooldown: 6000, range: 12, aoeCenter: 'target', aoeRadius: 3, maxTargets: 3, applyDebuff: { category: 'slow', name: '減速', description: '攻擊速度降低30%', duration: 6000, modifiers: [{ stat: 'attack_speed', value: -30, isPercent: true }], tags: ['slowed'] } },
  { id: 'mid-heal', name: '中治癒', level: 3, element: 'none', type: 'heal', target: 'single', power: 0, healAmount: 70, mpCost: 25, cooldown: 8000, range: 0 },
  { id: 'magic-armor', name: '魔法盔甲', level: 3, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 3000, range: 0, buffEffect: '防禦+5', buffDuration: 600000, buffModifiers: [{ stat: 'defense', value: 5, isPercent: false }], buffCategory: 'defense-buff' },
  // Level 4
  { id: 'storm', name: '風暴', level: 4, element: 'wind', type: 'attack', target: 'aoe', power: 35, mpCost: 20, cooldown: 5000, range: 12, aoeCenter: 'target', aoeRadius: 4, maxTargets: 4 },
  { id: 'inferno', name: '炎爆', level: 4, element: 'fire', type: 'attack', target: 'aoe', power: 30, mpCost: 22, cooldown: 7000, range: 12, aoeCenter: 'target', aoeRadius: 4, maxTargets: 4 },
  { id: 'ice-lance', name: '冰槍', level: 4, element: 'ice', type: 'attack', target: 'single', power: 38, mpCost: 20, cooldown: 5000, range: 12 },
  { id: 'agility-boost', name: '敏捷提升', level: 4, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 30, cooldown: 3000, range: 0, buffEffect: '敏捷+5', buffDuration: 600000, buffModifiers: [{ stat: 'agility', value: 5, isPercent: false }] },
  { id: 'vampire-kiss', name: '吸血鬼之吻', level: 4, element: 'dark', type: 'attack', target: 'single', power: 30, mpCost: 20, cooldown: 3000, range: 1.5, lifestealPercent: 100, description: '造成傷害，並回復等同最終傷害的HP' },
  // Level 5
  { id: 'gale-storm', name: '狂風暴', level: 5, element: 'wind', type: 'attack', target: 'aoe', power: 24, mpCost: 30, cooldown: 8000, range: 12, aoeCenter: 'target', aoeRadius: 5, maxTargets: 5 },
  { id: 'hellfire', name: '業火', level: 5, element: 'fire', type: 'attack', target: 'aoe', power: 28, mpCost: 35, cooldown: 8000, range: 12, aoeCenter: 'target', aoeRadius: 5, maxTargets: 5 },
  { id: 'ice-ring', name: '冰環', level: 5, element: 'ice', type: 'attack', target: 'aoe', power: 24, mpCost: 30, cooldown: 8000, range: 12, aoeCenter: 'target', aoeRadius: 5, maxTargets: 5, applyDebuff: { category: 'slow', name: '減速', description: '攻擊速度降低30%', duration: 6000, modifiers: [{ stat: 'attack_speed', value: -30, isPercent: true }], tags: ['slowed'] } },
  { id: 'great-heal', name: '大治癒', level: 5, element: 'none', type: 'heal', target: 'single', power: 0, healAmount: 150, mpCost: 40, cooldown: 10000, range: 0 },
  { id: 'holy-light', name: '聖光術', level: 5, element: 'light', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 3000, range: 0, buffEffect: '淨化負面狀態', buffDuration: 0, cleanse: true },
  // Level 6
  { id: 'strength-boost', name: '力量提升', level: 6, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 40, cooldown: 3000, range: 0, buffEffect: '力量+5', buffDuration: 600000, buffModifiers: [{ stat: 'str', value: 5, isPercent: false }] },
  { id: 'flame-pillar', name: '炎柱', level: 6, element: 'fire', type: 'attack', target: 'single', power: 38, mpCost: 35, cooldown: 6000, range: 12 },
  { id: 'earth-rend', name: '地裂術', level: 6, element: 'earth', type: 'attack', target: 'single', power: 35, mpCost: 35, cooldown: 6000, range: 12 },
  { id: 'haste', name: '加速術', level: 6, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 20, cooldown: 30000, range: 0, buffEffect: '攻速+33%', buffDuration: 600000, buffModifiers: [{ stat: 'attack_speed', value: 33, isPercent: true }], buffCategory: 'speed' },
  { id: 'bless-magic-weapon', name: '祝福魔法武器', level: 6, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 40, cooldown: 12000, range: 0, buffEffect: '命中+10，額外攻擊+5', buffDuration: 600000, buffModifiers: [{ stat: 'hit', value: 10, isPercent: false }, { stat: 'extra_attack', value: 5, isPercent: false }], buffCategory: 'weapon-bless' },
  // Level 7
  { id: 'tornado', name: '龍捲風', level: 7, element: 'wind', type: 'attack', target: 'aoe', power: 38, mpCost: 45, cooldown: 10000, range: 12, aoeCenter: 'target', aoeRadius: 4, maxTargets: 6 },
  { id: 'meteor-shot', name: '隕石彈', level: 7, element: 'fire', type: 'attack', target: 'aoe', power: 42, mpCost: 50, cooldown: 10000, range: 12, aoeCenter: 'target', aoeRadius: 6, maxTargets: 6 },
  { id: 'curse', name: '詛咒', level: 7, element: 'dark', type: 'attack', target: 'single', power: 0, mpCost: 35, cooldown: 30000, range: 10, applyDebuff: { category: 'curse', name: '詛咒', description: '防禦力降低20%', duration: 10000, modifiers: [{ stat: 'defense', value: -20, isPercent: true }], tags: ['cursed'] } },
  { id: 'armor-break', name: '護甲崩壞', level: 7, element: 'earth', type: 'attack', target: 'single', power: 0, mpCost: 40, cooldown: 20000, range: 10, applyDebuff: { category: 'defense-down', name: '護甲崩壞', description: '防禦值降低15%', duration: 15000, modifiers: [{ stat: 'defense', value: -15, isPercent: true }], tags: ['armor-break'] } },
  { id: 'shadow-burst', name: '暗影爆發', level: 7, element: 'dark', type: 'attack', target: 'aoe', power: 42, mpCost: 50, cooldown: 10000, range: 12, aoeCenter: 'target', aoeRadius: 6, maxTargets: 6 },
  // Level 8
  { id: 'chain-lightning', name: '閃電鎖鏈', level: 8, element: 'wind', type: 'attack', target: 'aoe', power: 35, mpCost: 55, cooldown: 10000, range: 12, aoeCenter: 'target', aoeRadius: 7, maxTargets: 7 },
  { id: 'purgatory', name: '煉獄火', level: 8, element: 'fire', type: 'attack', target: 'aoe', power: 49, mpCost: 60, cooldown: 12000, range: 12, aoeCenter: 'target', aoeRadius: 7, maxTargets: 7 },
  { id: 'blizzard', name: '冰暴', level: 8, element: 'ice', type: 'attack', target: 'aoe', power: 38, mpCost: 45, cooldown: 10000, range: 12, aoeCenter: 'target', aoeRadius: 6, maxTargets: 6, applyDebuff: { category: 'slow', name: '減速', description: '攻擊速度降低30%', duration: 6000, modifiers: [{ stat: 'attack_speed', value: -30, isPercent: true }], tags: ['slowed'] } },
  { id: 'full-heal', name: '完全治癒', level: 8, element: 'none', type: 'heal', target: 'single', power: 0, healAmount: 500, mpCost: 80, cooldown: 15000, range: 0 },
  { id: 'greater-haste', name: '強化加速術', level: 8, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 60, cooldown: 100000, range: 0, buffEffect: '攻速+40%', buffDuration: 600000, buffModifiers: [{ stat: 'attack_speed', value: 40, isPercent: true }], buffCategory: 'speed' },
  // Level 9
  { id: 'greater-magic-armor', name: '高級魔法盔甲', level: 9, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 70, cooldown: 12000, range: 0, buffEffect: '防禦+10', buffDuration: 600000, buffModifiers: [{ stat: 'defense', value: 10, isPercent: false }], buffCategory: 'defense-buff' },
  { id: 'meteor-shower', name: '流星雨', level: 9, element: 'fire', type: 'attack', target: 'aoe', power: 59, mpCost: 75, cooldown: 14000, range: 15, aoeCenter: 'target', aoeRadius: 8, maxTargets: 8 },
  { id: 'blizzard-storm', name: '暴風雪', level: 9, element: 'ice', type: 'attack', target: 'aoe', power: 56, mpCost: 70, cooldown: 12000, range: 12, aoeCenter: 'target', aoeRadius: 8, maxTargets: 8, applyDebuff: { category: 'slow', name: '減速', description: '攻擊速度降低30%', duration: 6000, modifiers: [{ stat: 'attack_speed', value: -30, isPercent: true }], tags: ['slowed'] } },
  { id: 'sanctuary', name: '聖域', level: 9, element: 'light', type: 'buff', target: 'single', power: 0, mpCost: 90, cooldown: 90000, range: 0, buffEffect: '減傷25%+每秒回血20', buffDuration: 10000, buffModifiers: [{ stat: 'damageReduction', value: 25, isPercent: true }], buffCategory: 'sanctuary', hotAmount: 20 },
  { id: 'earth-shatter', name: '震裂術', level: 9, element: 'earth', type: 'attack', target: 'aoe', power: 59, mpCost: 75, cooldown: 14000, range: 15, aoeCenter: 'target', aoeRadius: 8, maxTargets: 8 },
  // Level 10
  { id: 'divine-thunder', name: '天雷', level: 10, element: 'wind', type: 'attack', target: 'aoe', power: 70, mpCost: 90, cooldown: 15000, range: 15, aoeCenter: 'self', aoeRadius: 10 },
  { id: 'apocalypse-flame', name: '末日烈焰', level: 10, element: 'fire', type: 'attack', target: 'aoe', power: 70, mpCost: 90, cooldown: 15000, range: 15, aoeCenter: 'self', aoeRadius: 10 },
  { id: 'absolute-zero', name: '極冰封印', level: 10, element: 'ice', type: 'attack', target: 'aoe', power: 49, mpCost: 85, cooldown: 45000, range: 15, aoeCenter: 'target', aoeRadius: 10, maxTargets: 10, applyDebuff: { category: 'defense-down', name: '防禦下降', description: '防禦力降低20%', duration: 10000, modifiers: [{ stat: 'defense', value: -20, isPercent: true }], tags: ['defense-down'] } },
  { id: 'ultimate-ray', name: '究極光裂術', level: 10, element: 'none', type: 'attack', target: 'single', power: 77, mpCost: 100, cooldown: 10000, range: 15 },
  { id: 'absolute-barrier', name: '絕對屏障', level: 10, element: 'none', type: 'buff', target: 'single', power: 0, mpCost: 100, cooldown: 120000, range: 0, buffEffect: '無敵10s', buffDuration: 10000, buffModifiers: [], buffCategory: 'invincible', invincible: true },
];

export const SKILL_WIND_BLADE: Skill = {
  ...SKILL_CATALOG.find(s => s.id === 'wind-blade')!,
  lastUsedAt: 0,
};

/**
 * 技能射程的顯示字串。攻擊技能才有意義，buff／heal 一律回空字串。
 *
 * - `range: 0` 是「對自己施放」，不做距離判定（`41-arpg-combat.md` § 3.1）
 * - 近身（1.5）直接寫「近身」，寫成「1.5 格」對玩家沒有資訊量
 * - 用詞固定為**射程**：介面上的「範圍」已經被 AOE 半徑佔用，兩者不可混用
 *
 * 顯示位置：技能面板 tooltip、Wiki 技能表、魔法學院、職業工會 —— 共用這一個函式，
 * 避免四個地方各寫一套而說法不一致。
 */
export function formatSkillRange(skill: Pick<Skill, 'type' | 'range'>): string {
  if (skill.type !== 'attack') return '';
  const range = skill.range;
  if (range == null || range <= 0) return '';
  return range <= 1.5 ? '近身' : `${range} 格`;
}

/**
 * Buff 持續時間的顯示字串。只有 `type: 'buff'` 且真的有持續時間才回值。
 *
 * - `heal` 沒有持續時間
 * - 聖光術是 `buffDuration: 0` + `cleanse: true`（瞬發淨化），不是漏填，故不顯示
 * - 60 秒以上改用分鐘：現有值是 300s／600s，寫「5 分鐘」比「300 秒」好判斷
 *
 * 攻擊技能附加的 debuff 早就有顯示持續時間，buff 自己的卻沒有 ——
 * 同一份 tooltip 看得到自己造成的減速幾秒、看不到自己身上的增益幾秒，說不過去。
 */
export function formatBuffDuration(
  skill: Pick<Skill, 'type' | 'buffDuration'>,
): string {
  if (skill.type !== 'buff') return '';
  const ms = skill.buffDuration;
  if (!ms || ms <= 0) return '';
  const seconds = ms / 1000;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} 分鐘`;
  return `${seconds} 秒`;
}

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

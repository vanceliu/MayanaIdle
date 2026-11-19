/**
 * 星盤技能等級與強化對技能數值的轉換（`56-star-chart.md` § 56.5）。
 *
 * 順序：表列冷卻 × 冷卻倍率 → 隨機技能（`abilitySkill.ts`）→ 依等級乘數值（只有職業技能有等級）。
 * 施放當下轉換，存回 store 的仍是原技能。
 */
import type { Character } from './character';
import type { Skill, SkillDebuffDef, SkillSelfBuff } from './skill';
import type { ActiveEffect, StatModifier } from './effect';
import { gameNow } from '../core/clock';
import { CLASS_SKILLS, isClassMagic } from './classSkills';
import type { ClassName } from './character';
import { NO_STAR_NODE_SKILLS, STAR_POINT_VALUE, starSkillLevel, starTotalsOf } from './starChart';
import { applyAbilityToSkill } from './abilitySkill';

type StarOwner = Pick<Character, 'className' | 'starChart'>;
type GearLike = Parameters<typeof applyAbilityToSkill>[1];

/** 職業技能 I／II／III 的倍率 */
export const CLASS_SKILL_LEVEL_SCALE = [0.7, 0.85, 1] as const;
/** 職業技能等級倍率的職業例外（`56-star-chart.md` § 56.5） */
export const CLASS_SKILL_LEVEL_SCALE_BY_CLASS: Partial<Record<ClassName, readonly [number, number, number]>> = {
  thief: [0.3, 0.6, 1],
  elementalist: [0.3, 0.6, 1],
  priest: [0.3, 0.6, 1],
};
export const classSkillLevelScale = (cls: ClassName | undefined): readonly number[] =>
  (cls && CLASS_SKILL_LEVEL_SCALE_BY_CLASS[cls]) ?? CLASS_SKILL_LEVEL_SCALE;
/** 基礎冷卻＝表列 ÷ 0.8；每個強化節點 −10%（以基礎冷卻計） */
const CD_BASE_DIVISOR = 0.8;

/** 四捨五入的效果數值（其餘無條件捨去） */
const ROUNDED_STATS: Record<string, ReadonlySet<string>> = {
  'precise-shot': new Set(['hit']),
  'hawk-eye': new Set(['ranged_attack']),
};
/** 打折持續時間而非數值的技能 */
const DURATION_SCALED = new Set(['smoke-bomb']);

/** 依絕對值無條件捨去（負值效果不放大） */
const scaleDown = (value: number, f: number) => Math.sign(value) * Math.floor(Math.abs(value) * f);
const scaleRound = (value: number, f: number) => Math.sign(value) * Math.round(Math.abs(value) * f);
/** 百分比小數（0.7＝70%）以整數 % 捨去 */
const scaleRatio = (ratio: number, f: number) => Math.floor(Math.round(ratio * 100) * f) / 100;

/**
 * 說明文字裡的數字跟著改：依序在文字中尋找每個舊值（絕對值）並換成新值，
 * 從上一個替換處往後找，同一句裡相同的數字不會被重複替換。
 */
function rewriteNumbers(text: string | undefined, pairs: [number, number][]): string | undefined {
  if (!text) return text;
  let out = text;
  let cursor = 0;
  for (const [from, to] of pairs) {
    const re = new RegExp(`(?<![\\d.])${Math.abs(from)}(?![\\d.])`, 'g');
    re.lastIndex = cursor;
    const m = re.exec(out);
    if (!m) continue;
    const next = from === to ? m[0] : String(Math.abs(to));
    out = out.slice(0, m.index) + next + out.slice(m.index + m[0].length);
    cursor = m.index + next.length;
  }
  return out;
}

const modifierPairs = (from?: StatModifier[], to?: StatModifier[]): [number, number][] =>
  (from ?? []).map((m, i) => [m.value, to?.[i]?.value ?? m.value]);
const ratioPercent = (r: number | undefined) => Math.round((r ?? 0) * 100);

function scaleModifiers(mods: StatModifier[] | undefined, f: number, rounded?: ReadonlySet<string>): StatModifier[] | undefined {
  return mods?.map(m => ({ ...m, value: rounded?.has(m.stat) ? scaleRound(m.value, f) : scaleDown(m.value, f) }));
}

function scaleDebuff(def: SkillDebuffDef | undefined, f: number): SkillDebuffDef | undefined {
  if (!def) return def;
  const next: SkillDebuffDef = {
    ...def,
    ...(def.modifiers ? { modifiers: scaleModifiers(def.modifiers, f) } : {}),
    ...(def.dotDamagePercent !== undefined ? { dotDamagePercent: scaleRatio(def.dotDamagePercent, f) } : {}),
    ...(def.twoHandedDotDamagePercent !== undefined ? { twoHandedDotDamagePercent: scaleRatio(def.twoHandedDotDamagePercent, f) } : {}),
    ...(def.dotDamage !== undefined ? { dotDamage: scaleDown(def.dotDamage, f) } : {}),
  };
  return { ...next, description: rewriteNumbers(def.description, debuffPairs(def, next)) ?? def.description };
}

function debuffPairs(from: SkillDebuffDef, to: SkillDebuffDef): [number, number][] {
  return [
    ...modifierPairs(from.modifiers, to.modifiers),
    [ratioPercent(from.dotDamagePercent), ratioPercent(to.dotDamagePercent)],
    [ratioPercent(from.twoHandedDotDamagePercent), ratioPercent(to.twoHandedDotDamagePercent)],
    [from.dotDamage ?? 0, to.dotDamage ?? 0],
  ];
}

function scaleSelfBuff(buff: SkillSelfBuff | undefined, f: number): SkillSelfBuff | undefined {
  if (!buff) return buff;
  const next: SkillSelfBuff = {
    ...buff,
    ...(buff.modifiers ? { modifiers: scaleModifiers(buff.modifiers, f) } : {}),
    ...(buff.scaleByMissingHp ? { scaleByMissingHp: { ...buff.scaleByMissingHp, maxPercent: scaleDown(buff.scaleByMissingHp.maxPercent, f) } } : {}),
  };
  const pairs: [number, number][] = [
    ...modifierPairs(buff.modifiers, next.modifiers),
    [buff.scaleByMissingHp?.maxPercent ?? 0, next.scaleByMissingHp?.maxPercent ?? 0],
  ];
  return { ...next, description: rewriteNumbers(buff.description, pairs) ?? buff.description };
}

/** 職業技能依等級倍率轉換：傷害、治癒、護盾、輔助效果、攻擊技附帶效果；時間與代價不變 */
function scaleClassSkill(skill: Skill, f: number): Skill {
  if (f === 1) return skill;
  const rounded = ROUNDED_STATS[skill.id];
  const next: Skill = {
    ...skill,
    power: skill.physicalSnapshot ? skill.power : scaleDown(skill.power, f),
    physicalScale: (skill.physicalScale ?? 1) * f,
    ...(skill.shieldPower !== undefined ? { shieldPower: scaleDown(skill.shieldPower, f) } : {}),
    ...(skill.mpRestorePercent !== undefined ? { mpRestorePercent: scaleDown(skill.mpRestorePercent, f) } : {}),
    ...(DURATION_SCALED.has(skill.id) && skill.buffDuration !== undefined
      ? { buffDuration: Math.floor(skill.buffDuration * f) }
      : { buffModifiers: scaleModifiers(skill.buffModifiers, f, rounded) }),
    applyDebuff: scaleDebuff(skill.applyDebuff, f),
    onHitDebuff: scaleDebuff(skill.onHitDebuff, f),
    selfBuff: scaleSelfBuff(skill.selfBuff, f),
  };
  // 說明文字：增益效果（含淬毒的附毒％、聖光護盾的技能攻擊力）、回魔％
  const buffPairs: [number, number][] = [
    ...modifierPairs(skill.buffModifiers, next.buffModifiers),
    [skill.shieldPower ?? 0, next.shieldPower ?? 0],
    [ratioPercent(skill.onHitDebuff?.dotDamagePercent), ratioPercent(next.onHitDebuff?.dotDamagePercent)],
  ];
  return {
    ...next,
    buffEffect: rewriteNumbers(skill.buffEffect, buffPairs),
    description: skill.mpRestorePercent !== undefined && skill.selfHpCostPercent !== undefined
      ? `扣最大 HP ${skill.selfHpCostPercent}%，回復最大 MP ${next.mpRestorePercent}%`
      : skill.description,
  };
}

/** 基礎魔法分類（技能 tooltip）：攻擊、回復、護盾增益；聖光術不屬任何一類 */
export type BasicMagicCategory = 'attack' | 'heal' | 'shield';
export const BASIC_MAGIC_CATEGORY_LABEL: Record<BasicMagicCategory, string> = {
  attack: '基礎攻擊魔法', heal: '基礎回復魔法', shield: '基礎護盾增益魔法',
};
const UNCATEGORIZED_MAGIC = new Set(['holy-light']);

export function basicMagicCategoryOf(skill: Pick<Skill, 'id' | 'type'>): BasicMagicCategory | null {
  if (isClassMagic(skill.id) || UNCATEGORIZED_MAGIC.has(skill.id)) return null;
  if (skill.type === 'attack') return 'attack';
  if (skill.type === 'heal') return 'heal';
  return skill.type === 'buff' ? 'shield' : null;
}

/** 有星盤冷卻節點的技能（職業技能，閃避反擊、冷卻縮減除外） */
export const hasStarCooldown = (skill: Pick<Skill, 'id' | 'cooldown'>): boolean =>
  isClassMagic(skill.id) && !NO_STAR_NODE_SKILLS.has(skill.id) && skill.cooldown > 0;

/** 點了 n 個強化節點的冷卻（ms）：表列 ÷ 0.8 × (1 − 10% × n)，四捨五入到 0.1 秒 */
export function starCooldownAt(cooldown: number, nodes: number): number {
  return Math.round((cooldown / CD_BASE_DIVISOR) * (1 - nodes * 0.1) / 100) * 100;
}

export function applyStarCooldown(skill: Skill, owner: StarOwner): Skill {
  if (!hasStarCooldown(skill)) return skill;
  const totals = starTotalsOf(owner.starChart, owner.className).totals;
  const cooldown = starCooldownAt(skill.cooldown, -(totals.get(`skill:${skill.id}:cd`) ?? 0) / STAR_POINT_VALUE.skillCd);
  return cooldown === skill.cooldown ? skill : { ...skill, cooldown };
}

/** 指定等級（I～III）的職業技能數值；沒有等級的技能原樣回傳 */
export function skillAtStarLevel(skill: Skill, level: number): Skill {
  if (!isClassMagic(skill.id) || NO_STAR_NODE_SKILLS.has(skill.id)) return skill;
  const cls = CLASS_SKILLS.find(c => c.id === skill.id)?.className;
  return scaleClassSkill(skill, classSkillLevelScale(cls)[level - 1]);
}

/** 依星盤等級乘數值（職業技能 I～III；基礎魔法沒有等級） */
export function applyStarLevel(skill: Skill, owner: StarOwner): Skill {
  const level = skillStarLevel(skill, owner);
  return level === null ? skill : skillAtStarLevel(skill, level);
}

/** 血契之星：技能耗魔改扣等量 HP（`56-star-chart.md` § 56.6） */
function applyBloodPact(skill: Skill, owner: StarOwner): Skill {
  if (skill.mpCost <= 0 || !starTotalsOf(owner.starChart, owner.className).flags.has('bloodPact')) return skill;
  return { ...skill, hpCost: (skill.hpCost ?? 0) + skill.mpCost, mpCost: 0 };
}

/** 燃魔之星：技能耗魔 ×2，在血契之前套用（`56-star-chart.md` § 56.6） */
function applyManaBurn(skill: Skill, owner: StarOwner): Skill {
  if (skill.mpCost <= 0 || !starTotalsOf(owner.starChart, owner.className).flags.has('manaBurn')) return skill;
  return { ...skill, mpCost: skill.mpCost * 2 };
}

/** 魔法節約等 buff 的耗魔減免 stat（`23-class-magic.md` § 23.5） */
export const MP_COST_REDUCTION_STAT = 'mp_cost_reduction';

/** 生效中的耗魔減免 %，上限 100 */
export function mpCostReductionPercent(activeEffects: readonly ActiveEffect[] | undefined, now: number = gameNow()): number {
  if (!activeEffects) return 0;
  let pct = 0;
  for (const e of activeEffects) {
    if (e.type !== 'buff' || e.target !== 'player' || now >= e.startTime + e.duration) continue;
    for (const m of e.modifiers ?? []) if (m.stat === MP_COST_REDUCTION_STAT) pct += m.value;
  }
  return Math.min(100, pct);
}

function applyMpCostReduction(skill: Skill, activeEffects: readonly ActiveEffect[] | undefined): Skill {
  const pct = mpCostReductionPercent(activeEffects);
  if (pct <= 0 || skill.mpCost <= 0) return skill;
  return { ...skill, mpCost: Math.floor(skill.mpCost * (100 - pct) / 100) };
}

/** 施放當下的技能：星盤冷卻 → 隨機技能 → 星盤等級 → 燃魔 → 耗魔減免 → 血契 */
export function resolveSkill(skill: Skill, gear: GearLike, owner: StarOwner, activeEffects?: readonly ActiveEffect[]): Skill {
  const leveled = applyManaBurn(applyStarLevel(applyAbilityToSkill(applyStarCooldown(skill, owner), gear, owner.className), owner), owner);
  return applyBloodPact(applyMpCostReduction(leveled, activeEffects), owner);
}

export function resolveSkills(skills: Skill[], gear: GearLike, owner: StarOwner, activeEffects?: readonly ActiveEffect[]): Skill[] {
  return skills.map(s => resolveSkill(s, gear, owner, activeEffects));
}

/** 技能目前的星盤等級（I～III）；沒有節點的技能回 null */
export function skillStarLevel(skill: Pick<Skill, 'id' | 'type'>, owner: StarOwner): number | null {
  if (!isClassMagic(skill.id) || NO_STAR_NODE_SKILLS.has(skill.id)) return null;
  return starSkillLevel(starTotalsOf(owner.starChart, owner.className).totals, skill.id);
}

const ROMAN = ['I', 'II', 'III'];

/** 技能等級的羅馬數字（`56-star-chart.md` § 56.5）：II、III；I 與沒有等級的技能為空字串 */
export function starLevelRoman(skill: Pick<Skill, 'id' | 'type'>, owner: StarOwner): string {
  const level = skillStarLevel(skill, owner);
  return level && level > 1 ? ROMAN[level - 1] : '';
}

/** 技能名稱後的等級後綴：`(II)`，I 與沒有等級的技能為空字串 */
export function starLevelSuffix(skill: Pick<Skill, 'id' | 'type'>, owner: StarOwner): string {
  const roman = starLevelRoman(skill, owner);
  return roman ? `(${roman})` : '';
}

/** 技能分類（技能 tooltip）：職業技能、基礎魔法三類；不屬任何一類的基礎魔法為「基礎魔法」 */
export function skillCategoryLabel(skill: Pick<Skill, 'id' | 'type'>): string {
  if (isClassMagic(skill.id)) return '職業技能';
  const category = basicMagicCategoryOf(skill);
  return category ? BASIC_MAGIC_CATEGORY_LABEL[category] : '基礎魔法';
}

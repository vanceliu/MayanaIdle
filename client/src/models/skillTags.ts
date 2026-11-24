/**
 * 技能標籤（`05-skill.md` § 5.5）：詞綴、隨機技能、buff 的適用對象一律看標籤。
 * 隨機技能職業池改寫後的技能（`models/abilitySkill.ts`）傳進來即依改寫後判定。
 */
import type { Skill, SkillDebuffDef } from './skill';
import { ELEMENT_LABELS, type ElementType } from './monster';

export type ElementTag = Exclude<ElementType, 'none'>;

export type SkillTag =
  | 'basic_attack'
  | 'single_basic_attack'
  | 'skill'
  | 'single_skill'
  | 'skill_elemental'
  | 'physical'
  | 'magic'
  | ElementTag
  | 'dot'
  | 'bow';

export const SKILL_TAG_LABELS: Record<SkillTag, string> = {
  basic_attack: '普攻',
  single_basic_attack: '單體普攻',
  skill: '技能',
  single_skill: '單體技能',
  skill_elemental: '技能元素',
  physical: '物理',
  magic: '魔法',
  fire: ELEMENT_LABELS.fire,
  ice: ELEMENT_LABELS.ice,
  wind: ELEMENT_LABELS.wind,
  earth: ELEMENT_LABELS.earth,
  light: ELEMENT_LABELS.light,
  dark: ELEMENT_LABELS.dark,
  dot: '持續傷害',
  bow: '弓',
};

type TagSource = Pick<Skill,
  'type' | 'target' | 'power' | 'element' | 'hits' | 'physicalSnapshot' | 'dotOnly'
  | 'instantDotTicks' | 'counterOnDodge' | 'requiredWeaponType' | 'applyDebuff' | 'onHitDebuff'>;

/** 普通攻擊；元素為武器元素，依裝備另外決定 */
export const NORMAL_ATTACK_TAGS: readonly SkillTag[] = ['basic_attack', 'single_basic_attack', 'physical'];

const elementTag = (element: string | undefined): ElementTag[] =>
  element && element !== 'none' && element in ELEMENT_LABELS ? [element as ElementTag] : [];

/** 技能本身的標籤；【普攻】的元素為武器元素，不在此列 */
export function skillTags(skill: TagSource): SkillTag[] {
  const weapon: SkillTag[] = skill.requiredWeaponType === 'bow' ? ['bow'] : [];
  if (skill.counterOnDodge) return [...NORMAL_ATTACK_TAGS, ...weapon];
  if (skill.type !== 'attack' || skill.dotOnly) return weapon;
  if (skill.hits) {
    return ['basic_attack', ...(skill.target === 'single' ? ['single_basic_attack' as const] : []), 'physical', ...weapon];
  }
  const physical = !!skill.physicalSnapshot || !!skill.instantDotTicks;
  if (skill.power <= 0 && !physical) return weapon;
  const elements = elementTag(skill.element);
  return [
    'skill',
    ...(skill.target === 'single' ? ['single_skill' as const] : []),
    ...(elements.length > 0 ? ['skill_elemental' as const] : []),
    ...(physical ? ['physical' as const] : []),
    ...(skill.power > 0 ? ['magic' as const] : []),
    ...elements,
    ...weapon,
  ];
}

/** 技能施加的持續傷害（流血、中毒、凍傷）的標籤；沒有持續傷害時為空 */
export function dotTags(skill: TagSource, debuff: SkillDebuffDef | undefined): SkillTag[] {
  if (!debuff?.dotDamagePercent || (debuff === skill.applyDebuff && skill.instantDotTicks)) return [];
  return ['dot', 'physical', ...elementTag(debuff.dotElement ?? skill.element)];
}

/** 【普攻】的標籤補上攻擊元素（武器刻印 → 火矢附魔，`combat.ts` 的 `getBasicAttackElement()`），排在【弓】之前 */
export function withBasicAttackElement(tags: readonly SkillTag[], element: ElementTag | undefined): SkillTag[] {
  if (!element || !tags.includes('basic_attack')) return [...tags];
  const bow = tags.indexOf('bow');
  return bow < 0 ? [...tags, element] : [...tags.slice(0, bow), element, ...tags.slice(bow)];
}

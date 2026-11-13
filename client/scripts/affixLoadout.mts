/**
 * 模擬腳本共用的詞綴配裝規則（`44-dps-prediction.md` § 44.2）。
 *
 * - 每件依所屬分類詞綴池（`07-affix.md` § 7.6），數值取該分類階級表在該 Tier 的上限
 * - 武器的攻擊詞綴由呼叫端窮舉；其他部位固定 2 條攻擊 ＋ 2 條生存，
 *   攻擊依職業的邊際輸出排序，池內攻擊詞綴不足時以生存補滿
 * - T7 獨有詞綴依部位分池（`07-affix-tier7.md` § 7T.5）
 */
import {
  AFFIX_POOLS,
  BONUS_ATTRIBUTE_VALUE,
  getAffixCategoryOf,
  getAffixTierTable,
  isElementAffixType,
  type Affix,
  type AffixCategory,
  type AffixType,
  type BrandElement,
} from '../src/models/affix';
import { UNIQUE_AFFIX_POOLS, type UniqueAffixType } from '../src/models/uniqueAffix';
import type { Attributes, ClassName } from '../src/models/character';

/** 非武器部位的詞綴條數與其中攻擊詞綴的條數 */
export const ARMOR_AFFIX_SLOTS = 4;
export const ARMOR_OFFENSE_SLOTS = 2;

/** 武器池裡有輸出價值的攻擊詞綴（命中下降、普攻回血、技能回血不增加輸出，不列入） */
const WEAPON_NON_OFFENSE = new Set<AffixType>(['hit_down', 'attack_lifesteal', 'skill_lifesteal']);
export const WEAPON_OFFENSE_AFFIXES: AffixType[] = (Object.keys(AFFIX_POOLS.weapon) as AffixType[])
  .filter(t => !WEAPON_NON_OFFENSE.has(t));

/** 非武器部位可能帶的攻擊詞綴；額外屬性一律加在主攻屬性 */
export const ARMOR_OFFENSE_AFFIXES: AffixType[] = [
  'attack_splash', 'skill_elemental', 'crit_rate', 'crit_damage', 'attack_speed', 'cooldown_reduction', 'bonus_attribute',
];

/** 生存詞綴的優先順序，依職業定位（`44-dps-prediction.md` § 44.2） */
export const SURVIVAL_PRIORITY: Record<ClassName, AffixType[]> = {
  knight: ['defense', 'potion_effect', 'mp_regen', 'on_hit_hp', 'max_hp', 'block_rate', 'magic_resist', 'evasion', 'hp_regen', 'thorns', 'max_mp'],
  elf: ['evasion', 'potion_effect', 'on_hit_hp', 'defense', 'max_hp', 'magic_resist', 'hp_regen', 'block_rate', 'thorns', 'max_mp'],
  thief: ['evasion', 'potion_effect', 'on_hit_hp', 'defense', 'max_hp', 'magic_resist', 'hp_regen', 'block_rate', 'thorns', 'max_mp'],
  elementalist: ['max_hp', 'defense', 'magic_resist', 'max_mp', 'potion_effect', 'evasion', 'on_hit_hp', 'mp_regen', 'hp_regen', 'block_rate'],
  priest: ['max_hp', 'max_mp', 'potion_effect', 'heal_effect', 'defense', 'magic_resist', 'evasion', 'on_hit_hp', 'mp_regen', 'hp_regen', 'block_rate'],
};

/** T7 防具的獨有詞綴：生存型分類取生存詞綴；手套由呼叫端從手套池擇優 */
export const ARMOR_UNIQUE: Partial<Record<AffixCategory, UniqueAffixType>> = {
  helmChest: 'extra_defense',
  shirtCloak: 'evasion',
  boots: 'evasion',
  necklace: 'all_attributes',
  ring: 'all_attributes',
};

/** 手套的 T7 獨有詞綴候選（與武器池同類，同類去重見 § 7T.3） */
export const GLOVES_UNIQUE_OPTIONS: UniqueAffixType[] = UNIQUE_AFFIX_POOLS.gloves;

export function inPool(type: AffixType, category: AffixCategory): boolean {
  return type in AFFIX_POOLS[category];
}

/** 該分類階級表在 `tier` 的上限；額外屬性固定 +1 */
export function affixMaxValue(type: AffixType, category: AffixCategory, tier: number): number {
  if (type === 'bonus_attribute') return BONUS_ATTRIBUTE_VALUE;
  return getAffixTierTable(type, category)[tier - 1].max;
}

/** 某種攻擊詞綴在非武器部位能拿到的最高 T7 值（邊際輸出排序用） */
export function armorOffenseProbeValue(type: AffixType, tier = 7): number {
  const values = (Object.keys(AFFIX_POOLS) as AffixCategory[])
    .filter(c => c !== 'weapon' && inPool(type, c))
    .map(c => affixMaxValue(type, c, tier));
  return values.length ? Math.max(...values) : 0;
}

/** 非武器部位的詞綴：池內排名前 2 的攻擊詞綴 ＋ 生存詞綴補滿 4 條 */
export function armorAffixTypes(category: AffixCategory, offenseRanking: AffixType[], cn: ClassName): AffixType[] {
  const offense = offenseRanking.filter(t => inPool(t, category)).slice(0, ARMOR_OFFENSE_SLOTS);
  const survival = SURVIVAL_PRIORITY[cn].filter(t => inPool(t, category) && !offense.includes(t));
  return [...offense, ...survival].slice(0, ARMOR_AFFIX_SLOTS);
}

export interface AffixBuildContext {
  /** 元素刻印、元素侵蝕、元素下降共用的元素 */
  element: BrandElement;
  /** 元素侵蝕的每跳傷害 */
  erosionDamage?: number;
  /** 額外屬性加在哪個屬性 */
  mainStat: keyof Attributes;
  /** 封印詞綴的索引（武器 T7 配裝為第 5 條） */
  sealedIndex?: number;
}

/** 依所屬分類的階級表建立詞綴實例 */
export function buildAffixes(
  tpl: { slot: string; type: string },
  types: AffixType[],
  tier: number,
  ctx: AffixBuildContext,
): Affix[] {
  const category = getAffixCategoryOf(tpl);
  return types.map((type, i) => ({
    type,
    tier: type === 'bonus_attribute' ? 0 : tier,
    value: affixMaxValue(type, category, tier),
    ...(isElementAffixType(type) ? { element: ctx.element } : {}),
    ...(type === 'element_erosion' && ctx.erosionDamage ? { dotDamage: ctx.erosionDamage } : {}),
    ...(type === 'bonus_attribute' ? { attribute: ctx.mainStat } : {}),
    ...(i === ctx.sealedIndex ? { sealed: true as const } : {}),
  }));
}

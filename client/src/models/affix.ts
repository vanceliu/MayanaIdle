import type { Attributes } from './attributes';
import { ATTRIBUTE_KEYS, ATTRIBUTE_NAMES_ZH } from './attributes';
import { random } from '../core/rng';

/** 詞綴分類（`07-affix.md` § 7.5）。每類有自己的詞綴池與階級表（§ 7.6） */
export type AffixCategory =
  | 'weapon' | 'helmChest' | 'shirtCloak' | 'gloves' | 'boots' | 'belt' | 'offhand' | 'necklace' | 'ring';

/** § 7.5 分類的顯示名稱與部位；順序即 Wiki 分頁順序 */
export const AFFIX_CATEGORIES: { key: AffixCategory; name: string; parts: string }[] = [
  { key: 'weapon', name: '武器', parts: '右手武器；左手持武器時同' },
  { key: 'helmChest', name: '頭盔·胸甲', parts: '頭盔、胸甲' },
  { key: 'shirtCloak', name: '上衣·斗篷', parts: '上衣、斗篷' },
  { key: 'gloves', name: '手套', parts: '手套' },
  { key: 'boots', name: '鞋子', parts: '鞋子' },
  { key: 'belt', name: '腰帶', parts: '腰帶' },
  { key: 'offhand', name: '副手', parts: '盾牌、魔導書、臂甲' },
  { key: 'necklace', name: '項鍊', parts: '項鍊' },
  { key: 'ring', name: '戒指', parts: '戒指 ×2' },
];

export function getAffixCategoryName(category: AffixCategory): string {
  return AFFIX_CATEGORIES.find(c => c.key === category)!.name;
}

export type AffixType =
  | 'attack_power'
  | 'element_brand'
  | 'element_erosion'
  | 'skill_elemental'
  | 'crit_rate'
  | 'crit_damage'
  | 'attack_speed'
  | 'cooldown_reduction'
  | 'hit_down'
  | 'defense_down'
  | 'defense'
  | 'max_hp'
  | 'max_mp'
  | 'heal_effect'
  | 'potion_effect'
  | 'drop_rate'
  | 'gold_rate'
  | 'block_rate'
  | 'magic_resist'
  | 'on_hit_hp'
  | 'on_hit_mp'
  | 'hp_regen'
  | 'mp_regen'
  | 'bonus_attribute'
  | 'evasion'
  | 'attack_splash'
  | 'thorns'
  | 'move_speed'
  | 'element_down'
  | 'attack_lifesteal'
  | 'skill_lifesteal';

/**
 * 特殊詞綴（免疫詞綴）— docs/design/07-affix.md § 7.10
 * 無 Tier 分級、不可強化、佔用一般詞綴欄位、同件裝備不可重複
 */
export type SpecialAffixType =
  | 'immune_poison'
  | 'immune_bleed'
  | 'resist_stun';

export type AnyAffixType = AffixType | SpecialAffixType;

export interface SpecialAffixDefinition {
  type: SpecialAffixType;
  name: string;
  description: string;
  category: AffixCategory[];
  /** 最低可掉落區域等級（§ 7.10.1） */
  minAreaLevel: number;
}

/**
 * § 7.10.1 特殊詞綴清單。
 * 只涵蓋**魔法抗性擋不住**的 debuff：中毒／流血（物理 DoT）與暈眩。
 * 詛咒／虛弱／減速／沉默改由魔抗機率抵抗（§ 24.4.2），刻意不設免疫詞綴。
 */
export const SPECIAL_AFFIX_DEFINITIONS: SpecialAffixDefinition[] = [
  { type: 'immune_poison', name: '毒免疫', description: '免疫中毒（100%）', category: ['shirtCloak', 'belt'], minAreaLevel: 31 },
  { type: 'immune_bleed', name: '流血免疫', description: '免疫流血（100%）', category: ['shirtCloak', 'belt'], minAreaLevel: 31 },
  { type: 'resist_stun', name: '暈眩抵抗', description: '暈眩時間 -50%', category: ['shirtCloak', 'belt'], minAreaLevel: 41 },
];

const SPECIAL_AFFIX_TYPE_SET = new Set<string>(SPECIAL_AFFIX_DEFINITIONS.map(d => d.type));

export function isSpecialAffixType(type: AnyAffixType): type is SpecialAffixType {
  return SPECIAL_AFFIX_TYPE_SET.has(type);
}

export function getSpecialAffixDefinition(type: AnyAffixType): SpecialAffixDefinition | undefined {
  return SPECIAL_AFFIX_DEFINITIONS.find(d => d.type === type);
}

export function getSpecialAffixPoolForSlot(category: AffixCategory, areaLevel: number): SpecialAffixDefinition[] {
  return SPECIAL_AFFIX_DEFINITIONS.filter(d => d.category.includes(category) && areaLevel >= d.minAreaLevel);
}

/** § 7.10.3 特殊詞綴出現機率（每個詞綴欄位），Boss ×2 */
export function getSpecialAffixChance(areaLevel: number, isBoss: boolean = false): number {
  let chance = 0;
  if (areaLevel >= 51) chance = 8;
  else if (areaLevel >= 41) chance = 5;
  else if (areaLevel >= 31) chance = 3;
  return isBoss ? chance * 2 : chance;
}

export interface AffixTier {
  tier: number; // 1~7
  /** 百分比詞綴以 0.1 為單位（§ 7.3）；固定值與迴避值為整數 */
  min: number;
  max: number;
}

/** § 7.3.3 舊通用階級表：只用於不在所屬分類池內的舊詞綴（顯示與滿值判定） */
export const LEGACY_GENERAL_TIERS: AffixTier[] = [
  { tier: 1, min: 3.1, max: 5 },
  { tier: 2, min: 5.1, max: 8 },
  { tier: 3, min: 8.1, max: 11 },
  { tier: 4, min: 11.1, max: 13 },
  { tier: 5, min: 13.1, max: 15 },
  { tier: 6, min: 15.1, max: 18 },
  { tier: 7, min: 18.1, max: 20 },
];

/** § 7.4 的詞綴分類小標。順序即 `AFFIX_DEFINITIONS` 的排列順序。 */
export type AffixGroup = '攻擊類' | '防禦類' | '補給類' | '掉落類' | '移動類';

export interface AffixDefinition {
  type: AffixType;
  name: string;
  /** § 7.4 的分類小標，Wiki 用來分組 */
  group: AffixGroup;
  /** § 7.4 的效果敘述，X 代表詞綴滾出的數值 */
  description: string;
}

/** 受擊回復的回復比例範圍（§ 7.9）：回血 2.0~4.0%、回魔 2.0~5.0%，依觸發率換算 */
export const ON_HIT_RESTORE_PERCENT: Record<'on_hit_hp' | 'on_hit_mp', [number, number]> = {
  on_hit_hp: [2, 4],
  on_hit_mp: [2, 5],
};

/** 命中下降／防禦下降的觸發率與持續（§ 7.9）。X% 是效果強度，觸發率固定 */
export const AFFIX_DEBUFF_CHANCE = 10;
export const AFFIX_DEBUFF_DURATION_MS = 3000;
/** 普攻擴散的範圍：主目標周圍格數（§ 7.9） */
export const ATTACK_SPLASH_RADIUS = 3;
/** 怪物身上的 category（`24-buff-debuff.md` § 24.4.3） */
export const HIT_DOWN_CATEGORY = 'affix-hit-down';
export const DEFENSE_DOWN_CATEGORY = 'affix-def-down';
/** 怪物 debuff 的 stat 鍵：命中下降以負值存，戰鬥端轉成角色迴避加成 */
export const HIT_DOWN_STAT = 'monster_hit';
/** 元素下降的 stat 鍵（§ 7.9）：正值，加算進同元素攻擊的元素乘區 */
export const ELEMENT_DOWN_STAT = 'element_down';

/** 元素下降在怪物身上的 category，依元素各一（`24-buff-debuff.md` § 24.4.3） */
export function elementDownCategory(element: string): string {
  return `${ELEMENT_DOWN_CATEGORY_PREFIX}${element}`;
}

const ELEMENT_DOWN_CATEGORY_PREFIX = 'affix-element-down-';

export function isElementDownCategory(category: string | undefined): boolean {
  return !!category?.startsWith(ELEMENT_DOWN_CATEGORY_PREFIX);
}

/** 武器詞綴施加在怪物身上、全隊共用的 debuff：命中下降、防禦下降、元素下降（§ 7.9）。同 category 以最後施放為準 */
export function isPartySharedAffixDebuff(category: string | undefined): boolean {
  return category === HIT_DOWN_CATEGORY || category === DEFENSE_DOWN_CATEGORY || isElementDownCategory(category);
}

const restoreRange = (type: 'on_hit_hp' | 'on_hit_mp') =>
  `${ON_HIT_RESTORE_PERCENT[type][0].toFixed(1)}~${ON_HIT_RESTORE_PERCENT[type][1].toFixed(1)}%（觸發率越高越多）`;

/** § 7.4 詞綴種類；順序即各分組內的顯示順序 */
export const AFFIX_DEFINITIONS: AffixDefinition[] = [
  { type: 'attack_power', name: '攻擊力', group: '攻擊類', description: '攻擊力 +X%' },
  { type: 'element_brand', name: '元素刻印', group: '攻擊類', description: '賦予武器一個元素（火／冰／風／地／光／暗），並使普攻傷害 +X%' },
  { type: 'element_erosion', name: '元素侵蝕', group: '攻擊類', description: 'X% 是觸發率：命中後有 X% 機率讓目標中侵蝕，每秒固定傷害、持續 5 秒' },
  { type: 'attack_splash', name: '普攻擴散', group: '攻擊類', description: `普攻命中時，主目標 ${ATTACK_SPLASH_RADIUS} 格內的其他怪受到主目標該下傷害 × X%` },
  { type: 'skill_elemental', name: '技能元素傷害', group: '攻擊類', description: '施放技能時元素傷害（火、冰、風、地、光、暗）+X%' },
  { type: 'crit_rate', name: '爆擊率', group: '攻擊類', description: '爆擊率 +X%' },
  { type: 'crit_damage', name: '爆擊傷害', group: '攻擊類', description: '爆擊傷害 +X%' },
  { type: 'attack_speed', name: '攻擊速度', group: '攻擊類', description: '攻擊速度 +X%' },
  { type: 'cooldown_reduction', name: '減少冷卻時間', group: '攻擊類', description: '技能冷卻時間 -X%' },
  { type: 'hit_down', name: '命中下降', group: '攻擊類', description: `命中後 ${AFFIX_DEBUFF_CHANCE}% 機率使敵方命中下降 X%，持續 ${AFFIX_DEBUFF_DURATION_MS / 1000} 秒` },
  { type: 'defense_down', name: '防禦下降', group: '攻擊類', description: `命中後 ${AFFIX_DEBUFF_CHANCE}% 機率使敵方防禦下降 X%，持續 ${AFFIX_DEBUFF_DURATION_MS / 1000} 秒` },
  { type: 'element_down', name: '元素下降', group: '攻擊類', description: `命中後 ${AFFIX_DEBUFF_CHANCE}% 機率使敵方的一種元素下降 ${AFFIX_DEBUFF_DURATION_MS / 1000} 秒：該元素的攻擊對牠的元素乘區 +X%` },
  { type: 'attack_lifesteal', name: '普攻回血', group: '攻擊類', description: '普攻每下命中回復該下最終傷害 × X% 的 HP' },
  { type: 'skill_lifesteal', name: '技能回血', group: '攻擊類', description: '技能每下命中回復該下最終傷害 × X% 的 HP' },
  { type: 'defense', name: '防禦力', group: '防禦類', description: '防禦力 +X%' },
  { type: 'max_hp', name: '最大 HP', group: '防禦類', description: '最大 HP +X（固定值）' },
  { type: 'max_mp', name: '最大 MP', group: '防禦類', description: '最大 MP +X（固定值）' },
  { type: 'hp_regen', name: '回血', group: '防禦類', description: '每次自然回血 +X（固定值）' },
  { type: 'mp_regen', name: '回魔', group: '防禦類', description: '每次自然回魔 +X（固定值）' },
  { type: 'bonus_attribute', name: '額外屬性', group: '防禦類', description: '六大屬性之一 +1，roll 時均等決定是哪一個。無 Tier' },
  { type: 'evasion', name: '迴避', group: '防禦類', description: '迴避值 +X' },
  { type: 'on_hit_hp', name: '受擊回血', group: '防禦類', description: `受到傷害時 X% 機率回復最大 HP 的 ${restoreRange('on_hit_hp')}` },
  { type: 'on_hit_mp', name: '受擊回魔', group: '防禦類', description: `受到傷害時 X% 機率回復最大 MP 的 ${restoreRange('on_hit_mp')}` },
  { type: 'block_rate', name: '格擋率', group: '防禦類', description: '格擋率 +X%' },
  { type: 'magic_resist', name: '魔法抗性', group: '防禦類', description: '魔法抗性 +X%，並降低怪物施加詛咒／虛弱／減速／沉默的機率' },
  { type: 'thorns', name: '荊棘傷害', group: '防禦類', description: '被命中時，對攻擊者造成實際受到的傷害 × X%' },
  { type: 'heal_effect', name: '補血效果', group: '補給類', description: '技能補血效果 +X%' },
  { type: 'potion_effect', name: '藥水效果', group: '補給類', description: '藥水效果 +X%' },
  { type: 'drop_rate', name: '掉寶率', group: '掉落類', description: '掉寶率 +X%（影響一般怪與 Boss 主掉落表、3~5 級職業技能書；工會任務收集物不受影響）' },
  { type: 'gold_rate', name: '金幣獲得率', group: '掉落類', description: '金幣獲得率 +X%' },
  { type: 'move_speed', name: '跑速', group: '移動類', description: '移動速度 +X%' },
];

export interface Affix {
  type: AnyAffixType;
  /** 一般詞綴 1~7；特殊詞綴固定 0（無 Tier 分級） */
  tier: number;
  value: number; // rolled percentage value
  /**
   * 元素刻印賦予武器的元素、或元素侵蝕造成的 DoT 元素（§ 7.4）。
   * 抽到當下決定，之後不變；兩條詞綴各自獨立抽，不會互相對齊。
   * 其他詞綴一律 undefined。
   */
  element?: BrandElement;
  /**
   * 元素侵蝕每跳的固定傷害（§ 7.4）。抽到當下由 `武器平均基傷的一半 ~ 武器平均基傷` 決定，
   * **之後不再隨機**：同一把武器每次觸發都是這個數字。其他詞綴一律 undefined。
   */
  dotDamage?: number;
  /**
   * 額外屬性詞綴（§ 7.3.1）加到哪個屬性。抽到當下六種均等決定，之後不變。
   * 其他詞綴一律 undefined。
   */
  attribute?: keyof Attributes;
  /** 封印詞綴（§ 7.11.1）：任何印記都不能變更，吃品質。一件最多 1 條 */
  sealed?: true;
}

/** 每件裝備的詞綴洞數（§ 7.1）。實例的 `affixSlots` 未設時即此值 */
export const AFFIX_SOCKETS = 4;

/**
 * 佔洞的詞綴條數（§ 7.1）。封印詞綴移出洞外（§ 7.11.1），不算。
 * `affixes` 的排列：佔洞的在前，封印詞綴在最後。
 */
export function countSocketedAffixes(affixes: readonly Affix[] | undefined): number {
  return (affixes ?? []).filter(a => !a.sealed).length;
}

/** 這件裝備目前可用的洞數（封印印記失敗會讓它減少，§ 7.1） */
export function getAffixSockets(item: { affixSlots?: number }): number {
  return item.affixSlots ?? AFFIX_SOCKETS;
}

/** 掉落裝備的詞綴條數（§ 7.1）：1~4 條均等 */
export function rollDropAffixCount(): number {
  return 1 + Math.floor(random() * AFFIX_SOCKETS);
}

/**
 * 固定值型詞綴（§ 7.1）：數值不是百分比，走各自的階級表。迴避為迴避值（§ 7.3.1）。
 * 額外屬性不在此列 —— 它無 Tier 也無數值區間，固定 +1。
 */
export const FLAT_AFFIX_TYPES = new Set<AnyAffixType>(['max_hp', 'max_mp', 'hp_regen', 'mp_regen', 'evasion']);

export function isFlatAffixType(type: AnyAffixType): boolean {
  return FLAT_AFFIX_TYPES.has(type);
}

/** 額外屬性詞綴（§ 7.3.1）：無 Tier、無數值、固定 +1，印記只能重骰不能升階 */
export function isAttributeAffixType(type: AnyAffixType): type is 'bonus_attribute' {
  return type === 'bonus_attribute';
}

/** 這條詞綴是否**沒有 Tier**（特殊詞綴與額外屬性）。印記的升階／重刻一律不受理 */
export function isTierlessAffixType(type: AnyAffixType): type is SpecialAffixType | 'bonus_attribute' {
  return isSpecialAffixType(type) || isAttributeAffixType(type);
}

/** 額外屬性詞綴固定給 +1（§ 7.3.1），不受品質放大 */
export const BONUS_ATTRIBUTE_VALUE = 1;

type OnHitRestoreType = 'on_hit_hp' | 'on_hit_mp';

const isOnHitRestoreType = (type: AnyAffixType): type is OnHitRestoreType =>
  type === 'on_hit_hp' || type === 'on_hit_mp';

/**
 * 受擊回復比例（未吃品質，§ 7.9）：觸發率在階級表 T1 下限～T7 上限間的位置，
 * 線性換算到 `ON_HIT_RESTORE_PERCENT`，取到小數一位。
 */
export function getRestorePercent(type: OnHitRestoreType, chance: number): number {
  const table = ON_HIT_TIERS;
  const lo = table[0].min;
  const hi = table[table.length - 1].max;
  const [min, max] = ON_HIT_RESTORE_PERCENT[type];
  const ratio = Math.min(1, Math.max(0, (chance - lo) / (hi - lo)));
  return roundAffixTenth(min + ratio * (max - min));
}

/** 回復比例套上裝備品質（§ 7.3 小數規則，單位為百分比） */
function restoreWithQuality(percent: number, quality: number): number {
  return Math.floor(toTenths(percent) * (100 + quality) / 100) / 10;
}

/** 這條受擊回復詞綴的實際回復比例（單位為百分比） */
export function restorePercentWithQuality(affix: Affix, quality: number): number {
  if (!isOnHitRestoreType(affix.type)) return 0;
  return restoreWithQuality(getRestorePercent(affix.type, affix.value), quality);
}

/**
 * 受擊回血／回魔的觸發率與回復比例（§ 7.4）。觸發率與比例都吃裝備品質。
 * 同一條詞綴可出現在多個部位，因此回傳陣列，由呼叫端逐條判定。
 */
export function getOnHitRestore(
  gear: (({ affixes?: Affix[]; quality?: number } | null)[]) | undefined,
  type: 'on_hit_hp' | 'on_hit_mp',
): { chance: number; percent: number }[] {
  const out: { chance: number; percent: number }[] = [];
  for (const g of gear ?? []) {
    for (const a of g?.affixes ?? []) {
      if (a.type !== type) continue;
      const q = g?.quality ?? 0;
      out.push({ chance: getEffectiveAffixValue(a, q), percent: restorePercentWithQuality(a, q) });
    }
  }
  return out;
}

/** 元素刻印可賦予的六種元素（§ 42.1，不含「無」） */
export type BrandElement = 'fire' | 'ice' | 'wind' | 'earth' | 'light' | 'dark';
export const BRAND_ELEMENTS: BrandElement[] = ['fire', 'ice', 'wind', 'earth', 'light', 'dark'];
export const BRAND_ELEMENT_ZH: Record<BrandElement, string> = {
  fire: '火', ice: '冰', wind: '風', earth: '地', light: '光', dark: '暗',
};

/**
 * 一件裝備的元素刻印所賦予的元素。沒有刻印時回 undefined。
 * 武器的元素**只有這一個來源**（§ 7.4）——`EquipmentInstance.element` 已無寫入端。
 */
export function getBrandElement(affixes: Affix[] | undefined): BrandElement | undefined {
  return affixes?.find(a => a.type === 'element_brand')?.element;
}

/**
 * 元素侵蝕的觸發率與每跳傷害（§ 7.4）。沒有這條詞綴時回 undefined。
 * **觸發率與每跳傷害都吃裝備品質**（同 `getEffectiveAffixValue` 的 `floor(值 × (1 + 品質%))`）。
 */
export function getErosion(
  affixes: Affix[] | undefined,
  quality: number = 0,
): { chance: number; damage: number; element: BrandElement } | undefined {
  const a = affixes?.find(x => x.type === 'element_erosion');
  if (!a || !a.element || !a.dotDamage) return undefined;
  return {
    chance: getEffectiveAffixValue(a, quality),
    damage: Math.max(1, Math.floor(a.dotDamage * (1 + quality / 100))),
    element: a.element,
  };
}

/** 抽到當下要決定元素的詞綴：元素刻印、元素侵蝕、元素下降（§ 7.9） */
export function isElementAffixType(type: AnyAffixType): type is 'element_brand' | 'element_erosion' | 'element_down' {
  return type === 'element_brand' || type === 'element_erosion' || type === 'element_down';
}

export type WeaponDebuffAffixType = 'hit_down' | 'defense_down' | 'element_down';

/**
 * 武器上的命中下降／防禦下降／元素下降（§ 7.9），X 吃品質。沒有時回空陣列。
 * 觸發率固定 `AFFIX_DEBUFF_CHANCE`，由呼叫端逐下判定。元素下降另帶元素。
 */
export function getWeaponDebuffAffixes(
  affixes: Affix[] | undefined,
  quality: number = 0,
): { type: WeaponDebuffAffixType; value: number; element?: BrandElement }[] {
  const out: { type: WeaponDebuffAffixType; value: number; element?: BrandElement }[] = [];
  for (const a of affixes ?? []) {
    if (a.type === 'hit_down' || a.type === 'defense_down') {
      out.push({ type: a.type, value: getEffectiveAffixValue(a, quality) });
    } else if (a.type === 'element_down' && a.element) {
      out.push({ type: a.type, value: getEffectiveAffixValue(a, quality), element: a.element });
    }
  }
  return out;
}

/**
 * 元素侵蝕的每跳傷害（§ 7.4）：`武器平均基傷的一半 ~ 武器平均基傷` 之間隨機，
 * 抽到當下決定，之後固定。下緣為平均基傷的一半，不可低於此。
 */
export function rollErosionDamage(weaponBaseDamage: number): number {
  const max = Math.max(1, Math.floor(weaponBaseDamage));
  const min = Math.max(1, Math.floor(max / 2));
  return min + Math.floor(random() * (max - min + 1));
}

/** 元素侵蝕的傷害上限＝武器小怪／大怪基傷的平均（抽詞綴時強化必為 0，故不含強化） */
export function getWeaponBaseDamage(
  tpl: { smallMonsterDamage?: number | null; largeMonsterDamage?: number | null },
): number {
  const s = tpl.smallMonsterDamage ?? 0;
  const l = tpl.largeMonsterDamage ?? 0;
  return Math.max(1, Math.round((s + l) / 2));
}

/** 依裝備部位與類型決定詞綴分類（§ 7.5）。魔導書、臂甲佔左手但不是武器，走副手 */
export function getAffixCategoryForSlot(
  slot: string,
  type: string,
): AffixCategory {
  if (type === 'shield' || type === 'magicBook' || type === 'armGuard') return 'offhand';
  if (slot === 'rightHand' || slot === 'leftHand') return 'weapon';
  if (slot === 'helmet' || slot === 'chest') return 'helmChest';
  if (slot === 'shirt' || slot === 'cloak') return 'shirtCloak';
  if (slot === 'gloves') return 'gloves';
  if (slot === 'boots') return 'boots';
  if (slot === 'belt') return 'belt';
  if (slot === 'necklace') return 'necklace';
  return 'ring';
}

/** 實例或模板的詞綴分類 */
export function getAffixCategoryOf(item: { slot: string; type: string }): AffixCategory {
  return getAffixCategoryForSlot(item.slot, item.type);
}

/** 這個分類的詞綴池（§ 7.6），依 `AFFIX_DEFINITIONS` 順序 */
export function getAffixPoolForSlot(category: AffixCategory): AffixDefinition[] {
  return AFFIX_DEFINITIONS.filter(d => d.type in AFFIX_POOLS[category]);
}

/** 這種詞綴是否在該分類的詞綴池內（§ 7.6；特殊詞綴看 § 7.10.1） */
export function isAffixInPool(type: AnyAffixType, category: AffixCategory): boolean {
  if (isSpecialAffixType(type)) return getSpecialAffixDefinition(type)!.category.includes(category);
  return type in AFFIX_POOLS[category];
}

/**
 * § 7.7 掉落時每條詞綴的 Tier 機率（T1~T7）。
 * T6／T7 欄是**整件至少一條**的機率：每條機率 = 1 − (1 − 整件機率)^(1 ÷ 有 Tier 的條數)；
 * T1~T5 依權重分配其餘機率。
 */
export function getDropTierProbabilities(areaLevel: number, isBoss: boolean, tieredCount: number): number[] {
  const weights = isBoss ? getBossTierWeights(areaLevel) : getTierWeights(areaLevel);
  const total = weights.reduce((s, w) => s + w, 0);
  const count = Math.max(1, tieredCount);
  const perSlot = (itemChance: number) => (itemChance <= 0 ? 0 : 1 - Math.pow(1 - itemChance, 1 / count));
  const t6 = perSlot(weights[5] / total);
  const t7 = perSlot(weights[6] / total);
  const low = weights.slice(0, 5);
  const lowTotal = low.reduce((s, w) => s + w, 0);
  const rest = 1 - t6 - t7;
  return [...low.map(w => (rest * w) / lowTotal), t6, t7];
}

export function rollAffixTier(areaLevel: number, isBoss: boolean = false, tieredCount: number = 1): number {
  const probabilities = getDropTierProbabilities(areaLevel, isBoss, tieredCount);
  let roll = random();
  for (let i = 0; i < probabilities.length; i++) {
    roll -= probabilities[i];
    if (roll < 0) return i + 1;
  }
  return probabilities.findLastIndex(p => p > 0) + 1;
}

/** § 7.7 一般怪物掉落的 Tier 權重（wiki 直接引用，避免另抄一份） */
export function getTierWeights(level: number): number[] {
  if (level <= 10) return [50, 30, 15, 4, 1, 0, 0];
  if (level <= 20) return [30, 35, 20, 10, 5, 0, 0];
  if (level <= 30) return [10, 25, 30, 20, 15, 0, 0];
  if (level <= 40) return [5, 10, 20, 30, 30, 5, 0];
  if (level <= 50) return [3, 7, 15, 25, 35, 15, 0];
  return [2, 5, 10, 20, 35, 28, 0];
}

/** § 7.7 Boss 掉落的 Tier 權重 */
export function getBossTierWeights(level: number): number[] {
  if (level <= 20) return [10, 25, 30, 20, 15, 0, 0];
  if (level <= 30) return [5, 10, 20, 30, 25, 10, 0];
  if (level <= 40) return [3, 5, 15, 25, 30, 17, 5];
  if (level <= 50) return [2, 3, 10, 20, 30, 25, 10];
  return [1, 2, 5, 15, 30, 32, 15];
}

/** 受擊回血／受擊回魔觸發率的專屬階級表（§ 7.3.1，0.1 單位） */
export const ON_HIT_TIERS: AffixTier[] = [
  { tier: 1, min: 1, max: 1.4 },
  { tier: 2, min: 1.5, max: 2.3 },
  { tier: 3, min: 2.4, max: 3.5 },
  { tier: 4, min: 3.6, max: 4.4 },
  { tier: 5, min: 4.5, max: 5.3 },
  { tier: 6, min: 5.4, max: 6.1 },
  { tier: 7, min: 6.2, max: 7 },
];

/**
 * 最大 HP／最大 MP 的固定值階級表（§ 7.3.1）。單位是點數，不是百分比。
 *
 * 固定值不隨等級成長：T7 的 100 在 Lv50（約 594 HP）相當於 17%，
 * 在 Lv100（約 1168 HP）只剩 8.6%。後期血量由等級本身承擔。
 */
export const FLAT_HP_MP_TIERS: AffixTier[] = [
  { tier: 1, min: 15, max: 20 },
  { tier: 2, min: 25, max: 32 },
  { tier: 3, min: 38, max: 46 },
  { tier: 4, min: 50, max: 58 },
  { tier: 5, min: 62, max: 70 },
  { tier: 6, min: 75, max: 84 },
  { tier: 7, min: 90, max: 100 },
];

/** 迴避的專屬階級表（§ 7.3.1），單位為迴避值 */
export const EVASION_TIERS: AffixTier[] = [
  { tier: 1, min: 1, max: 39 },
  { tier: 2, min: 40, max: 78 },
  { tier: 3, min: 79, max: 117 },
  { tier: 4, min: 118, max: 156 },
  { tier: 5, min: 157, max: 195 },
  { tier: 6, min: 196, max: 234 },
  { tier: 7, min: 235, max: 273 },
];

/** § 7.3.1 迴避值換算：100 迴避值 = 1% 迴避率 */
export const EVASION_POINTS_PER_PERCENT = 100;

/** § 7.3 等寬表：每階寬 `width`，`Tn = (n − 1) × width + unit ~ n × width` */
function equalWidthTiers(width: number, unit: number): AffixTier[] {
  return Array.from({ length: 7 }, (_, i) => ({
    tier: i + 1,
    min: roundAffixTenth(i * width + unit),
    max: roundAffixTenth((i + 1) * width),
  }));
}

/** § 7.3／§ 7.3.1 階級表代號 */
export type AffixTierTableKey = 'P1' | 'P2' | 'P3' | 'P5' | 'P6' | 'P7' | 'N2' | 'onHit' | 'evasion' | 'hpMp';

export const AFFIX_TIER_TABLES: Record<AffixTierTableKey, AffixTier[]> = {
  P1: equalWidthTiers(1, 0.1),
  P2: equalWidthTiers(2, 0.1),
  P3: equalWidthTiers(3, 0.1),
  P5: equalWidthTiers(5, 0.1),
  P6: equalWidthTiers(6, 0.1),
  P7: equalWidthTiers(7, 0.1),
  N2: equalWidthTiers(2, 1),
  onHit: ON_HIT_TIERS,
  evasion: EVASION_TIERS,
  hpMp: FLAT_HP_MP_TIERS,
};

/** 詞綴池的一格：階級表代號；額外屬性無 Tier 為 null */
type PoolEntries = Partial<Record<AffixType, AffixTierTableKey | null>>;

/** § 7.6 武器以外各分類共用的詞綴 */
const SHARED_POOL: PoolEntries = {
  max_hp: 'hpMp', max_mp: 'hpMp', hp_regen: 'N2', mp_regen: 'N2',
  heal_effect: 'P2', potion_effect: 'P2', drop_rate: 'P3', gold_rate: 'P3',
};

export const SHARED_AFFIX_TYPES = Object.keys(SHARED_POOL) as AffixType[];

/** § 7.6 詞綴池：分類 → 詞綴 → 階級表 */
export const AFFIX_POOLS: Record<AffixCategory, PoolEntries> = {
  weapon: {
    attack_power: 'P3', element_brand: 'P3', element_erosion: 'P3', hit_down: 'P3', defense_down: 'P3', element_down: 'P3',
    attack_splash: 'P5', crit_damage: 'P5', attack_speed: 'P1', attack_lifesteal: 'P6', skill_lifesteal: 'P2',
  },
  helmChest: { defense: 'P1', on_hit_hp: 'onHit', on_hit_mp: 'onHit', evasion: 'evasion', bonus_attribute: null, ...SHARED_POOL },
  shirtCloak: { defense: 'P1', evasion: 'evasion', bonus_attribute: null, ...SHARED_POOL },
  gloves: {
    attack_splash: 'P2', crit_rate: 'P2', crit_damage: 'P2', attack_speed: 'P1',
    skill_elemental: 'P2', cooldown_reduction: 'P2', ...SHARED_POOL,
  },
  boots: { move_speed: 'P2', evasion: 'evasion', cooldown_reduction: 'P2', defense: 'P1', ...SHARED_POOL },
  belt: { bonus_attribute: null, evasion: 'evasion', cooldown_reduction: 'P1', crit_damage: 'P2', ...SHARED_POOL },
  offhand: {
    block_rate: 'P3', skill_elemental: 'P1', defense: 'P1', thorns: 'P7',
    on_hit_hp: 'onHit', on_hit_mp: 'onHit', magic_resist: 'P3', ...SHARED_POOL,
  },
  necklace: {
    magic_resist: 'P3', cooldown_reduction: 'P1', evasion: 'evasion', bonus_attribute: null,
    crit_rate: 'P1', crit_damage: 'P2', skill_elemental: 'P2', ...SHARED_POOL,
  },
  ring: {
    magic_resist: 'P3', evasion: 'evasion', bonus_attribute: null,
    crit_rate: 'P1', crit_damage: 'P2', skill_elemental: 'P2', ...SHARED_POOL,
  },
};

/** § 7.3.3 舊防禦力階級表：只用於不在所屬分類池內的舊詞綴 */
export const LEGACY_DEFENSE_TIERS: AffixTier[] = [
  { tier: 1, min: 0.1, max: 0.5 },
  { tier: 2, min: 0.6, max: 1 },
  { tier: 3, min: 1.1, max: 1.5 },
  { tier: 4, min: 1.6, max: 2 },
  { tier: 5, min: 2.1, max: 2.5 },
  { tier: 6, min: 2.6, max: 3.5 },
  { tier: 7, min: 3.6, max: 5 },
];

/** § 7.3.3 不在所屬分類池內的舊詞綴；未列出的走舊通用表 */
const LEGACY_TIER_TABLES: Partial<Record<AffixType, AffixTier[]>> = {
  defense: LEGACY_DEFENSE_TIERS,
  on_hit_hp: ON_HIT_TIERS,
  on_hit_mp: ON_HIT_TIERS,
  evasion: EVASION_TIERS,
  max_hp: FLAT_HP_MP_TIERS,
  max_mp: FLAT_HP_MP_TIERS,
};

/** 這種詞綴在該分類的階級表（§ 7.6）；不在池內的舊詞綴走 § 7.3.3 */
export function getAffixTierTable(type: AffixType, category: AffixCategory): AffixTier[] {
  const key = AFFIX_POOLS[category][type];
  if (key) return AFFIX_TIER_TABLES[key];
  return LEGACY_TIER_TABLES[type] ?? LEGACY_GENERAL_TIERS;
}

/** § 7.3 百分比詞綴的數值單位是 0.1%；固定值型、迴避值、額外屬性、特殊詞綴為整數 */
export function isDecimalAffixType(type: AnyAffixType): boolean {
  return !isFlatAffixType(type) && !isTierlessAffixType(type);
}

const toTenths = (v: number) => Math.round(v * 10);

/** 四捨五入到小數一位（§ 7.3 加總規則） */
export function roundAffixTenth(v: number): number {
  return Math.round(v * 10) / 10;
}

export function rollAffixValue(tier: number, type: AffixType, category: AffixCategory): number {
  const t = getAffixTierTable(type, category)[tier - 1];
  if (!isDecimalAffixType(type)) return Math.floor(random() * (t.max - t.min + 1)) + t.min;
  const lo = toTenths(t.min);
  return (lo + Math.floor(random() * (toTenths(t.max) - lo + 1))) / 10;
}

/** 這條詞綴所屬 Tier 的區間（依所屬分類，§ 7.6）；無 Tier 的詞綴回 null */
export function getAffixTierRange(affix: Affix, category: AffixCategory): AffixTier | null {
  if (isTierlessAffixType(affix.type)) return null;
  return getAffixTierTable(affix.type as AffixType, category)[affix.tier - 1] ?? null;
}

/** 區間端點的顯示字串：百分比詞綴帶一位小數，不帶單位 */
export function formatAffixBound(type: AnyAffixType, value: number): string {
  return isDecimalAffixType(type) ? value.toFixed(1) : String(value);
}

/** 該分類階級表在 `fromTier`～`toTier` 的區間文字：`4.1~6.0%`、`15~100`；額外屬性為 `+1` */
export function formatAffixTierSpan(type: AffixType, category: AffixCategory, fromTier: number = 1, toTier: number = 7): string {
  if (isAttributeAffixType(type)) return `+${BONUS_ATTRIBUTE_VALUE}`;
  const t = getAffixTierTable(type, category);
  const unit = isFlatAffixType(type) ? '' : '%';
  return `${formatAffixBound(type, t[fromTier - 1].min)}~${formatAffixBound(type, t[toTier - 1].max)}${unit}`;
}

/** § 7.3 數值夾回所屬 Tier 的區間（舊存檔遷移用） */
export function clampAffixValueToTier(affix: Affix, category: AffixCategory): number {
  const t = getAffixTierTable(affix.type as AffixType, category)[affix.tier - 1];
  if (!t || isTierlessAffixType(affix.type)) return affix.value;
  return Math.min(t.max, Math.max(t.min, affix.value));
}

/**
 * 商店購買的裝備：詞綴 Tier 硬上限（`06-equipment-acquire.md` § 6A.6）。
 * 生成時只會滾到 T3，且鐵匠鋪的詞綴強化也升不過 T3。
 */
export const SHOP_MAX_AFFIX_TIER = 3;

/** 一般裝備的精鍊印記升階上限（`07-affix.md` § 7.2）。 */
export const DEFAULT_MAX_AFFIX_TIER = 5;
/** 鐵匠製作品的詞綴 Tier 範圍，依裝備階級（§ 6A.6）。範圍含 T6 時每條 T6 機率 `CRAFT_AFFIX_T6_RATE`，其餘階級均分 */
export const CRAFT_AFFIX_TIER_RANGE: Readonly<Record<number, { min: number; max: number }>> = {
  4: { min: 1, max: 5 },
  5: { min: 2, max: 6 },
  6: { min: 3, max: 6 },
};

/** 製作品每條詞綴出 T6 的機率（§ 6A.6） */
export const CRAFT_AFFIX_T6_RATE = 0.1;

/** 製作品的 Tier 相對權重：其他階級各 1，T6 的權重使其佔 `CRAFT_AFFIX_T6_RATE` */
export function getCraftAffixTierWeights(range: { min: number; max: number }): Record<number, number> {
  if (range.max < 6 || range.min > 6) return {};
  const others = range.max - range.min;
  return { 6: (others * CRAFT_AFFIX_T6_RATE) / (1 - CRAFT_AFFIX_T6_RATE) };
}

/** 製作詞綴範圍的顯示文字，如「T4 製作品 T1~T5、T5 製作品 T2~T6」 */
export function formatCraftAffixTierRanges(): string {
  return Object.entries(CRAFT_AFFIX_TIER_RANGE)
    .map(([tier, r]) => `T${tier} 製作品 T${r.min}~T${r.max}`)
    .join('、');
}

/** 製作詞綴機率的顯示文字，如「每條 T6 機率 10%，其餘階級均分」 */
export function formatCraftAffixTierWeights(): string {
  return `每條 T6 機率 ${Math.round(CRAFT_AFFIX_T6_RATE * 100)}%，其餘階級均分`;
}

/** 在 `floor`~`cap` 間依相對權重抽 Tier，未列的階級＝1 */
function rollRangeTier(floor: number, cap: number, weights: Readonly<Record<number, number>>): number {
  const weightOf = (tier: number) => weights[tier] ?? 1;
  let total = 0;
  for (let t = floor; t <= cap; t++) total += weightOf(t);
  let roll = random() * total;
  for (let t = floor; t <= cap; t++) {
    roll -= weightOf(t);
    if (roll < 0) return t;
  }
  return cap;
}

export interface GenerateAffixOptions {
  /** Tier 硬上限。商店裝傳 `SHOP_MAX_AFFIX_TIER`；掉落／製作不傳。 */
  maxTier?: number;
  /** 均等隨機時的 Tier 下限，未給＝1。製作品用（§ 6A.6） */
  minTier?: number;
  /** 均等隨機 Tier（不查區域權重表）。商店與製作品用，掉落品不用。 */
  uniformTier?: boolean;
  /** `uniformTier` 時各 Tier 的相對權重，未列＝1。製作品用（§ 6A.6） */
  tierWeights?: Readonly<Record<number, number>>;
  /**
   * 禁止特殊詞綴（免疫類）。§ 6A.6：商店品與製作品都不會出現特殊詞綴，
   * 只有掉落品依 § 7.10.3 的機率生成。
   */
  noSpecialAffix?: boolean;
  /**
   * 元素侵蝕的傷害上限（§ 7.4）——武器平均基傷。生成武器詞綴時必填；
   * 未給時侵蝕的每跳傷害會退化成 1。
   */
  weaponBaseDamage?: number;
  /** 不可抽到的種類 —— 同件已有的詞綴（新增印記、混沌保留的封印詞綴，§ 7.6 不可重複） */
  excludeTypes?: AnyAffixType[];
}

export function generateAffixes(
  category: AffixCategory,
  areaLevel: number,
  slotCount: number = 4,
  isBoss: boolean = false,
  options: GenerateAffixOptions = {},
): Affix[] {
  const excluded = new Set<AnyAffixType>(options.excludeTypes ?? []);
  const available = getAffixPoolForSlot(category).filter(d => !excluded.has(d.type));
  // § 6A.6：商店品與製作品不會出現特殊詞綴，只有掉落品會
  const specialAvailable = options.noSpecialAffix
    ? []
    : getSpecialAffixPoolForSlot(category, areaLevel).filter(d => !excluded.has(d.type));
  const specialChance = getSpecialAffixChance(areaLevel, isBoss);
  const affixes: Affix[] = [];

  // 先決定每格的種類：§ 7.7 每條 Tier 機率依「有 Tier 的條數」而定，要先知道有幾條
  const actualSlots = Math.min(slotCount, available.length);
  const picks: (Affix | AffixDefinition)[] = [];
  for (let i = 0; i < actualSlots; i++) {
    // § 7.10.3 特殊詞綴取代一個一般詞綴位置
    if (specialAvailable.length > 0 && random() * 100 < specialChance) {
      const sIdx = Math.floor(random() * specialAvailable.length);
      const sDef = specialAvailable.splice(sIdx, 1)[0];
      picks.push({ type: sDef.type, tier: 0, value: 0 });
      continue;
    }
    const idx = Math.floor(random() * available.length);
    const def = available.splice(idx, 1)[0];
    // § 7.3.1 額外屬性：無 Tier、無數值區間，固定 +1，只決定加在哪個屬性
    if (def.type === 'bonus_attribute') {
      picks.push({
        type: def.type, tier: 0, value: BONUS_ATTRIBUTE_VALUE,
        attribute: ATTRIBUTE_KEYS[Math.floor(random() * ATTRIBUTE_KEYS.length)],
      });
      continue;
    }
    picks.push(def);
  }
  const tieredCount = picks.filter(p => !('tier' in p)).length;

  for (const pick of picks) {
    if ('tier' in pick) {
      affixes.push(pick);
      continue;
    }
    const def = pick;
    const cap = options.maxTier ?? 7;
    const floor = options.minTier ?? 1;
    const tier = options.uniformTier
      ? rollRangeTier(floor, cap, options.tierWeights ?? {})
      : Math.min(cap, rollAffixTier(areaLevel, isBoss, tieredCount));
    const value = rollAffixValue(tier, def.type, category);
    // § 7.9 元素刻印／元素侵蝕／元素下降：抽到當下才決定屬性，六種均等隨機，各自獨立抽
    const needsElement = isElementAffixType(def.type);
    const element = needsElement
      ? BRAND_ELEMENTS[Math.floor(random() * BRAND_ELEMENTS.length)]
      : undefined;
    // § 7.4 元素侵蝕：每跳傷害在抽到當下由 `武器平均基傷的一半 ~ 武器平均基傷` 決定，之後固定不變
    const dotDamage = def.type === 'element_erosion'
      ? rollErosionDamage(options.weaponBaseDamage ?? 1)
      : undefined;
    affixes.push({
      type: def.type, tier, value,
      ...(element ? { element } : {}),
      ...(dotDamage ? { dotDamage } : {}),
    });
  }

  return affixes;
}

export function getEffectiveAffixValue(affix: Affix, quality: number): number {
  // § 7.3.1 額外屬性固定 +1，不受品質放大（否則會突破「額外屬性最多 +2」）
  if (isAttributeAffixType(affix.type)) return affix.value;
  // § 7.3 百分比詞綴取到小數一位
  if (isDecimalAffixType(affix.type)) return Math.floor(toTenths(affix.value) * (100 + quality) / 100) / 10;
  return Math.floor(affix.value * (1 + quality / 100));
}

/** 詞綴有效數值的顯示字串（不含正負號與單位）：百分比詞綴帶一位小數 */
function formatEffectiveValue(affix: Affix, quality: number): string {
  const v = getEffectiveAffixValue(affix, quality);
  return isDecimalAffixType(affix.type) ? v.toFixed(1) : String(v);
}

/**
 * 這條詞綴是否滾到所屬 Tier 的**上限值**（§ 7.3.2，UI 以粗體標示）。
 *
 * 判定用未吃品質的原始 `value` —— 品質是裝備屬性、對每條詞綴等比放大，
 * 不影響「這次 roll 在該 Tier 內是否完美」這件事。
 * 特殊詞綴與額外屬性無 Tier 也無數值，一律 false —— 它們改由 `shouldBoldAffix()` 一律粗體。
 */
export function isMaxRollAffix(affix: Affix, category: AffixCategory): boolean {
  if (isTierlessAffixType(affix.type)) return false;
  const t = getAffixTierTable(affix.type, category)[affix.tier - 1];
  return !!t && affix.value === t.max;
}

/**
 * UI 是否以粗體顯示這條詞綴（§ 7.3.2）：滾到 Tier 上限的一般詞綴，
 * 加上無 Tier 的特殊詞綴與額外屬性（兩者一律粗體）。
 */
export function shouldBoldAffix(affix: Affix, category: AffixCategory): boolean {
  return isTierlessAffixType(affix.type) || isMaxRollAffix(affix, category);
}

/**
 * 詞綴的顯示文字（一般：`攻擊力 +12% (T4)`；特殊：`[特殊] 毒免疫`，見 § 7.10.5）。
 *
 * `Affix` 只存 `{ type, tier, value }`，文字是衍生資料，不進 DB。
 * 遺產快照是唯一例外：封存當下就把這段文字寫死，日後 `AFFIX_DEFINITIONS`
 * 改名或刪詞綴時，舊紀錄仍顯示封存當時的正確名稱（§ 45.1）。
 */
export function formatAffixName(affix: Affix): string {
  // § 7.11.1 封印詞綴：名稱前加 (封)
  return affix.sealed ? `(封) ${formatBaseAffixName(affix)}` : formatBaseAffixName(affix);
}

function formatBaseAffixName(affix: Affix): string {
  if (isSpecialAffixType(affix.type)) {
    const def = getSpecialAffixDefinition(affix.type);
    return `[特殊] ${def?.name ?? affix.type}`;
  }
  // § 7.3.1 額外屬性：無 Tier，名稱就是屬性本身
  if (isAttributeAffixType(affix.type)) {
    return affix.attribute ? ATTRIBUTE_NAMES_ZH[affix.attribute] : '屬性';
  }
  const def = AFFIX_DEFINITIONS.find(d => d.type === affix.type);
  return affix.element ? `${def?.name}（${BRAND_ELEMENT_ZH[affix.element]}）` : (def?.name ?? affix.type);
}

/**
 * 詞綴數值（含單位）。**固定值型與額外屬性不帶百分號**（§ 7.3.1）。
 * 特殊詞綴沒有數值，回空字串。
 *
 * 名稱與數值分開輸出是給「要各自上樣式」的呼叫端用的（滿值粗體、印記師的兩段式列），
 * 單位規則只有這一份，各面板不可自己拼 `+${value}%`。
 */
export function formatAffixValue(affix: Affix, quality: number = 0): string {
  if (isSpecialAffixType(affix.type)) return '';
  const unit = isFlatAffixType(affix.type) || isAttributeAffixType(affix.type) ? '' : '%';
  return `+${formatEffectiveValue(affix, quality)}${unit}`;
}

/**
 * 詞綴說明（§ 7.4 效果文字）：X 代入數值，去掉開頭「X% 是觸發率：」；
 * 受擊回血／回魔的回復比例範圍代入該條抽到的比例。
 */
export function formatAffixDescription(affix: Affix, quality: number = 0): string {
  const description = isSpecialAffixType(affix.type)
    ? getSpecialAffixDefinition(affix.type)?.description
    : AFFIX_DEFINITIONS.find(d => d.type === affix.type)?.description;
  if (!description) return '';
  const value = formatEffectiveValue(affix, quality);
  const text = description.replace(/^X% 是觸發率：/, '').replace(/X/g, value);
  if (isOnHitRestoreType(affix.type)) {
    return text.replace(restoreRange(affix.type), `${restorePercentWithQuality(affix, quality).toFixed(1)}%`);
  }
  return text;
}

export function formatAffixDisplay(affix: Affix, quality: number = 0): string {
  return formatAffixDisplayParts(affix, quality).filter(p => !p.range).map(p => p.text).join('');
}

/** 顯示片段；`range: true` 為緊接在前一個數值後的區間（`34-ui-guidelines.md` § 34.2「Alt 顯示區間」） */
export interface DisplayPart {
  text: string;
  range?: true;
}

/**
 * 詞綴顯示片段：非區間片段串起來即 `formatAffixDisplay()`。
 * `category` 有給才印 Tier 區間；`weaponBaseDamage` 為所在武器的平均基傷，有給才印元素侵蝕每秒傷害的區間（§ 7.9）。
 */
export function formatAffixDisplayParts(
  affix: Affix,
  quality: number = 0,
  weaponBaseDamage?: number,
  category?: AffixCategory,
): DisplayPart[] {
  const parts = formatBaseAffixDisplayParts(affix, quality, weaponBaseDamage, category);
  return affix.sealed ? [{ text: '(封) ' }, ...parts] : parts;
}

/** 同 Tier 區間乘品質：`(4.0 ~ 6.0%)`；無 Tier 的詞綴回 null */
export function formatAffixRange(affix: Affix, quality: number, category: AffixCategory): string | null {
  const t = getAffixTierRange(affix, category);
  if (!t) return null;
  const lo = formatEffectiveValue({ ...affix, value: t.min }, quality);
  const hi = formatEffectiveValue({ ...affix, value: t.max }, quality);
  const unit = isFlatAffixType(affix.type) ? '' : '%';
  return `(${lo} ~ ${hi}${unit})`;
}

/** 受擊回復比例在同 Tier 觸發率上下限的換算區間，乘品質：`(2.4 ~ 2.8%)` */
function formatRestoreRange(affix: Affix, type: OnHitRestoreType, quality: number, category: AffixCategory): string | null {
  const t = getAffixTierRange(affix, category);
  if (!t) return null;
  const lo = restoreWithQuality(getRestorePercent(type, t.min), quality);
  const hi = restoreWithQuality(getRestorePercent(type, t.max), quality);
  return `(${lo.toFixed(1)} ~ ${hi.toFixed(1)}%)`;
}

const erosionWithQuality = (damage: number, quality: number) => Math.max(1, Math.floor(damage * (1 + quality / 100)));

/** 元素侵蝕每秒傷害的抽取區間（同 `rollErosionDamage`），乘品質：`(9 ~ 18)` */
function formatErosionRange(weaponBaseDamage: number, quality: number): string {
  const max = Math.max(1, Math.floor(weaponBaseDamage));
  const min = Math.max(1, Math.floor(max / 2));
  return `(${erosionWithQuality(min, quality)} ~ ${erosionWithQuality(max, quality)})`;
}

function formatBaseAffixDisplayParts(
  affix: Affix,
  quality: number,
  weaponBaseDamage?: number,
  category?: AffixCategory,
): DisplayPart[] {
  if (isSpecialAffixType(affix.type)) return [{ text: formatBaseAffixName(affix) }];
  if (isAttributeAffixType(affix.type)) {
    return [{ text: `${formatBaseAffixName(affix)} ${formatAffixValue(affix, quality)}` }];
  }
  const name = formatBaseAffixName(affix);
  const range = category ? formatAffixRange(affix, quality, category) : null;
  // 片段依序為文字與區間交錯；區間為 null 時併入前一段文字
  const join = (...pieces: (string | { range: string | null })[]): DisplayPart[] => {
    const out: DisplayPart[] = [];
    for (const piece of pieces) {
      if (typeof piece !== 'string') {
        if (piece.range) out.push({ text: piece.range, range: true });
      } else if (out.length > 0 && !out[out.length - 1].range) {
        out[out.length - 1] = { text: out[out.length - 1].text + piece };
      } else {
        out.push({ text: piece });
      }
    }
    return out;
  };
  const value = formatEffectiveValue(affix, quality);
  if (isOnHitRestoreType(affix.type)) {
    // 名稱已含「受擊」，回復量的「最大 HP／MP 百分比」省略成「回血／回魔 X%」（§ 7.4）
    const pct = restorePercentWithQuality(affix, quality).toFixed(1);
    const what = affix.type === 'on_hit_hp' ? '回血' : '回魔';
    return join(`受擊 ${value}%`, { range }, ` 觸發${what} ${pct}%`,
      { range: category ? formatRestoreRange(affix, affix.type, quality, category) : null }, ` (T${affix.tier})`);
  }
  // 元素侵蝕的% 是觸發率、不是傷害%，另外把每跳固定傷害寫出來
  if (affix.type === 'element_erosion') {
    const dot = erosionWithQuality(affix.dotDamage ?? 0, quality);
    const dotRange = weaponBaseDamage != null ? formatErosionRange(weaponBaseDamage, quality) : null;
    return join(`${name} ${value}%`, { range }, ` 觸發／每秒 ${dot}`, { range: dotRange }, ` (T${affix.tier})`);
  }
  // § 7.9 X% 是效果強度，觸發率固定
  if (affix.type === 'hit_down' || affix.type === 'defense_down' || affix.type === 'element_down') {
    return join(`${name} ${value}%`, { range }, `／${AFFIX_DEBUFF_CHANCE}% 觸發 (T${affix.tier})`);
  }
  return join(`${name} ${formatAffixValue(affix, quality)}`, { range }, ` (T${affix.tier})`);
}

export interface AffixBonuses {
  attack_power: number;
  element_brand: number;
  element_erosion: number;
  skill_elemental: number;
  crit_rate: number;
  crit_damage: number;
  attack_speed: number;
  cooldown_reduction: number;
  hit_down: number;
  defense_down: number;
  defense: number;
  max_hp: number;
  max_mp: number;
  heal_effect: number;
  potion_effect: number;
  drop_rate: number;
  gold_rate: number;
  block_rate: number;
  magic_resist: number;
  on_hit_hp: number;
  on_hit_mp: number;
  /** 固定值：直接加算至最大 HP／MP（§ 7.3.1），不是百分比 */
  hp_regen: number;
  mp_regen: number;
  /** 額外屬性詞綴的加總不放這裡，改走 `collectAffixAttributes()` */
  bonus_attribute: number;
  evasion: number;
  attack_splash: number;
  thorns: number;
  move_speed: number;
  element_down: number;
  attack_lifesteal: number;
  skill_lifesteal: number;
}

export function collectAffixBonuses(gear: { affixes?: Affix[]; quality?: number }[]): AffixBonuses {
  const bonuses: AffixBonuses = {
    attack_power: 0,
    element_brand: 0,
    element_erosion: 0,
    skill_elemental: 0,
    crit_rate: 0,
    crit_damage: 0,
    attack_speed: 0,
    cooldown_reduction: 0,
    hit_down: 0,
    defense_down: 0,
    defense: 0,
    max_hp: 0,
    max_mp: 0,
    heal_effect: 0,
    potion_effect: 0,
    drop_rate: 0,
    gold_rate: 0,
    block_rate: 0,
    magic_resist: 0,
    on_hit_hp: 0,
    on_hit_mp: 0,
    hp_regen: 0,
    mp_regen: 0,
    bonus_attribute: 0,
    evasion: 0,
    attack_splash: 0,
    thorns: 0,
    move_speed: 0,
    element_down: 0,
    attack_lifesteal: 0,
    skill_lifesteal: 0,
  };

  for (const item of gear) {
    if (!item.affixes) continue;
    const quality = item.quality ?? 0;
    for (const affix of item.affixes) {
      // 特殊詞綴為固定效果，不參與數值加總（見 getSpecialAffixTypes）
      if (isSpecialAffixType(affix.type)) continue;
      bonuses[affix.type] += getEffectiveAffixValue(affix, quality);
    }
  }
  // § 7.3 同種加總四捨五入到小數一位
  for (const key of Object.keys(bonuses) as (keyof AffixBonuses)[]) bonuses[key] = roundAffixTenth(bonuses[key]);

  return bonuses;
}

/**
 * 額外屬性詞綴（§ 7.3.1）的加總。與模板的 `bonusAttributes` 分開收集 ——
 * 兩者都疊在「建角配點 + 升級配點」之上（`20-attributes.md` § 20.10）。
 */
export function collectAffixAttributes(gear: { affixes?: Affix[] }[]): Partial<Attributes> {
  const out: Partial<Attributes> = {};
  for (const item of gear) {
    for (const affix of item.affixes ?? []) {
      if (!isAttributeAffixType(affix.type) || !affix.attribute) continue;
      out[affix.attribute] = (out[affix.attribute] ?? 0) + affix.value;
    }
  }
  return out;
}

/** 收集裝備上所有特殊詞綴類型（多件不疊加，以 Set 表示） */
export function collectSpecialAffixTypes(gear: { affixes?: Affix[] }[]): Set<SpecialAffixType> {
  const types = new Set<SpecialAffixType>();
  for (const item of gear) {
    if (!item.affixes) continue;
    for (const affix of item.affixes) {
      if (isSpecialAffixType(affix.type)) types.add(affix.type);
    }
  }
  return types;
}

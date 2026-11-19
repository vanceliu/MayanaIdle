/**
 * 模擬腳本共用的詞綴配裝規則（`44-dps-prediction.md` § 44.2）。
 *
 * - 每件依所屬分類詞綴池（`07-affix.md` § 7.6），數值取該分類階級表在該 Tier 的上限
 * - 實測排名（`affixRanking.json`，由 `--probe-affix`／`--probe-weapon`／`--probe-unique` 三輪篩選產生，§ 44.2）：
 *   每件從池內全部詞綴取該職業、該情境實測邊際收益最高的 4 條（武器 T7 另加第 5 條封印）
 * - 舊規則（`--affix-rule=old`，量測基準）：武器攻擊詞綴由呼叫端窮舉；其他部位 2 條攻擊 ＋ 2 條生存
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
import type { EquipmentInstance } from '../src/models/equipment';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 實測排名檔：鍵 `{情境}|{職業}`（情境 reaper／arena6／arena7），值為「詞綴 → 每件邊際收益」，武器另存 `{情境}|{職業}|weapon` */
export const AFFIX_RANKING_FILE = join(dirname(fileURLToPath(import.meta.url)), 'affixRanking.json');
const RANKING: Record<string, Record<string, number>> = existsSync(AFFIX_RANKING_FILE) ? JSON.parse(readFileSync(AFFIX_RANKING_FILE, 'utf8')) : {};
const AFFIX_RULE = process.argv.find(a => a.startsWith('--affix-rule='))?.split('=')[1] ?? 'ranked';
let affixContext: string | null = null;
/** 目前模擬的情境（reaper、arena6、arena7）；未設定或 `--affix-rule=old` 時用舊規則 */
export function setAffixContext(context: string | null): void {
  affixContext = context;
}
function rankingOf(cn: ClassName, weapon = false): Record<string, number> | null {
  if (AFFIX_RULE === 'old' || !affixContext) return null;
  return RANKING[`${affixContext}|${cn}${weapon ? '|weapon' : ''}`] ?? null;
}
/** 依實測排名取池內前 n 條；同分依池內順序 */
function topRanked(category: AffixCategory, ranking: Record<string, number>, n: number): AffixType[] {
  return (Object.keys(AFFIX_POOLS[category]) as AffixType[])
    .map((t, i) => ({ t, i, v: ranking[t] ?? 0 }))
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .slice(0, n)
    .map(x => x.t);
}
/** T7 武器獨有詞綴（實測排名，鍵 `{情境}|{職業}|unique`）：收益最高且大於 0 者；沒有排名時回 null */
export function rankedWeaponUnique(cn: ClassName): UniqueAffixType | null {
  if (AFFIX_RULE === 'old' || !affixContext) return null;
  const ranking = RANKING[`${affixContext}|${cn}|unique`];
  if (!ranking) return null;
  const best = Object.entries(ranking).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] as UniqueAffixType : null;
}

/** 武器詞綴（實測排名）：前 `count` 條；沒有排名時回 null（呼叫端沿用自己的搜尋） */
export function rankedWeaponAffixes(cn: ClassName, count: number): AffixType[] | null {
  const ranking = rankingOf(cn, true);
  return ranking ? topRanked('weapon', ranking, count) : null;
}

/** 邊際量測用：移除所有裝備上的指定詞綴（含武器），回傳移除的件數 */
export function removeAffixGear(
  gear: (EquipmentInstance | null)[], weapon: EquipmentInstance, type: AffixType,
): { gear: (EquipmentInstance | null)[]; weapon: EquipmentInstance; removed: number } {
  let removed = 0;
  let nextWeapon = weapon;
  const out = gear.map(g => {
    if (!g || !(g.affixes ?? []).some(a => a.type === type)) return g;
    removed++;
    const patched = { ...g, affixes: (g.affixes ?? []).filter(a => a.type !== type) } as EquipmentInstance;
    if (g === weapon) nextWeapon = patched;
    return patched;
  });
  return { gear: out, weapon: nextWeapon, removed };
}

/**
 * 邊際量測用：在裝備上加一條指定詞綴（該件分類在 `tier` 的上限值）。
 * `target` armor：池內含該詞綴的非武器件，最多 3 件；weapon：只加在武器
 */
export function probeAffixGear(
  gear: (EquipmentInstance | null)[], weapon: EquipmentInstance, type: AffixType, tier: number,
  ctx: AffixBuildContext, target: 'armor' | 'weapon',
): { gear: (EquipmentInstance | null)[]; weapon: EquipmentInstance; added: number } {
  let added = 0;
  let nextWeapon = weapon;
  const out = gear.map(g => {
    if (!g) return g;
    if ((target === 'weapon') !== (g === weapon)) return g;
    if (added >= (target === 'weapon' ? 1 : 3) || !inPool(type, getAffixCategoryOf(g))) return g;
    added++;
    const patched = { ...g, affixes: [...(g.affixes ?? []), ...buildAffixes(g, [type], tier, { ...ctx, sealedIndex: undefined })] } as EquipmentInstance;
    if (g === weapon) nextWeapon = patched;
    return patched;
  });
  return { gear: out, weapon: nextWeapon, added };
}

/** 非武器部位的詞綴條數與其中攻擊詞綴的條數 */
export const ARMOR_AFFIX_SLOTS = 4;
export const ARMOR_OFFENSE_SLOTS = 2;

/** 武器池裡有輸出價值的攻擊詞綴（命中下降、普攻回血、技能回血、最大 HP／MP、回血、回魔不增加輸出，不列入） */
const WEAPON_NON_OFFENSE = new Set<AffixType>(['hit_down', 'attack_lifesteal', 'skill_lifesteal', 'max_hp', 'max_mp', 'hp_regen', 'mp_regen']);
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
  const ranking = rankingOf(cn);
  if (ranking) return topRanked(category, ranking, ARMOR_AFFIX_SLOTS);
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

/**
 * T7 獨有詞綴（`docs/design/07-affix-tier7.md`）。
 *
 * 存在實例的 `uniqueAffix` 欄位，不進 `affixes` —— 印記、品質、滿值判定都只認那 4 條。
 * 同類去重與素質凍結由 `systems/gear.ts` 的 `getEffectiveGear()` 處理，
 * 本模組的加總函式一律假設收到的是已處理過的裝備。
 */
import type { Attributes } from './attributes';
import { ATTRIBUTE_KEYS } from './attributes';
import type { ActiveEffect, StatModifier } from './effect';
import { random } from '../core/rng';

export type UniqueAffixType =
  // 武器（§ 7T.5）
  | 'hit_heal'
  | 'hit_mana'
  | 'hit_bonus_damage'
  | 'hit_stun'
  | 'kill_heal'
  | 'crit_damage'
  | 'crit_rate'
  | 'attack_speed'
  // 防具
  | 'struck_defense'
  | 'struck_spi'
  | 'struck_vit'
  | 'extra_defense'
  | 'evasion'
  | 'drop_rate'
  // 飾品
  | 'struck_magic_resist'
  | 'struck_all_attributes'
  | 'magic_resist'
  | 'all_attributes'
  | 'immune_all'
  // 腰帶（指定）
  | 'struck_str'
  | 'struck_int'
  | 'struck_agi'
  // 左手（指定）
  | 'struck_block'
  | 'struck_magic_attack'
  | 'struck_evasion';

export interface UniqueAffix {
  type: UniqueAffixType;
  /** 無數值的詞綴（命中暈眩、全免疫）固定 0 */
  value: number;
}

/** 抽取來源：三個隨機池，或由模板 id 指定 */
export type UniqueAffixPool = 'weapon' | 'armor' | 'accessory' | 'fixed';

/** § 7T.4 的觸發類型；`passive` 為常駐 */
export type UniqueAffixTrigger = 'passive' | 'hit' | 'kill' | 'struck';

export interface UniqueAffixDefinition {
  type: UniqueAffixType;
  name: string;
  pool: UniqueAffixPool;
  trigger: UniqueAffixTrigger;
  /** 數值區間；固定值為 min === max；無數值為 null */
  range: [number, number] | null;
  unit: '%' | '';
  /** 效果敘述，X 代表抽到的數值 */
  description: string;
  /** 受擊觸發 buff 的數值修正 */
  buffModifiers?: (value: number) => StatModifier[];
}

/** 受擊觸發的機率與 buff 持續（§ 7T.4） */
export const UNIQUE_STRUCK_CHANCE = 10;
export const UNIQUE_STRUCK_DURATION_MS = 5000;
/** 武器命中類的機率（追加傷害、命中暈眩） */
export const UNIQUE_HIT_PROC_CHANCE = 20;
export const UNIQUE_STUN_DURATION_MS = 5000;
/** 怪物身上 T7 命中暈眩的 category（`24-buff-debuff.md` § 24.4.3） */
export const UNIQUE_STUN_CATEGORY = 't7-stun';

const flat = (stat: string) => (value: number): StatModifier[] => [{ stat, value, isPercent: false }];

/** 角色 buff 的屬性 stat 鍵（`models/character.ts` 的 `getTotalAttributes()`） */
const ATTRIBUTE_BUFF_STAT: Record<keyof Attributes, string> = {
  STR: 'str', AGI: 'agility', VIT: 'vit', SPI: 'spi', INT: 'int', CHA: 'cha',
};

export const UNIQUE_AFFIX_DEFINITIONS: UniqueAffixDefinition[] = [
  { type: 'hit_heal', name: '命中回血', pool: 'weapon', trigger: 'hit', range: [10, 15], unit: '', description: '每下命中回復 X HP' },
  { type: 'hit_mana', name: '命中回魔', pool: 'weapon', trigger: 'hit', range: [10, 15], unit: '', description: '每下命中回復 X MP' },
  { type: 'hit_bonus_damage', name: '追加傷害', pool: 'weapon', trigger: 'hit', range: [10, 20], unit: '', description: `命中 ${UNIQUE_HIT_PROC_CHANCE}% 機率總體增加 X 傷害` },
  { type: 'hit_stun', name: '命中暈眩', pool: 'weapon', trigger: 'hit', range: null, unit: '', description: `命中 ${UNIQUE_HIT_PROC_CHANCE}% 機率使敵方暈眩 ${UNIQUE_STUN_DURATION_MS / 1000} 秒` },
  { type: 'kill_heal', name: '擊殺回血', pool: 'weapon', trigger: 'kill', range: [30, 50], unit: '', description: '擊殺回復 X HP' },
  { type: 'crit_damage', name: '爆擊傷害', pool: 'weapon', trigger: 'passive', range: [25, 50], unit: '%', description: '爆擊傷害 +X%' },
  { type: 'crit_rate', name: '爆擊率', pool: 'weapon', trigger: 'passive', range: [20, 25], unit: '%', description: '爆擊率 +X%' },
  { type: 'attack_speed', name: '攻擊速度', pool: 'weapon', trigger: 'passive', range: [20, 25], unit: '%', description: '攻擊速度 +X%' },

  { type: 'struck_defense', name: '受擊防禦', pool: 'armor', trigger: 'struck', range: [10, 15], unit: '', description: '受擊 10% 機率防禦 +X，持續 5 秒', buffModifiers: flat('defense') },
  { type: 'struck_spi', name: '受擊精神', pool: 'armor', trigger: 'struck', range: [2, 4], unit: '', description: '受擊 10% 機率精神 +X，持續 5 秒', buffModifiers: flat(ATTRIBUTE_BUFF_STAT.SPI) },
  { type: 'struck_vit', name: '受擊體質', pool: 'armor', trigger: 'struck', range: [2, 4], unit: '', description: '受擊 10% 機率體質 +X，持續 5 秒', buffModifiers: flat(ATTRIBUTE_BUFF_STAT.VIT) },
  { type: 'extra_defense', name: '額外防禦', pool: 'armor', trigger: 'passive', range: [3, 10], unit: '', description: '額外防禦 +X' },
  { type: 'evasion', name: '迴避', pool: 'armor', trigger: 'passive', range: [7, 10], unit: '%', description: '迴避率 +X%' },
  { type: 'drop_rate', name: '掉寶率', pool: 'armor', trigger: 'passive', range: [50, 100], unit: '%', description: '掉寶率 +X%' },

  { type: 'struck_magic_resist', name: '受擊魔抗', pool: 'accessory', trigger: 'struck', range: [5, 20], unit: '%', description: '受擊 10% 機率魔法抗性 +X%，持續 5 秒', buffModifiers: flat('magic_resist') },
  {
    type: 'struck_all_attributes', name: '受擊全屬性', pool: 'accessory', trigger: 'struck', range: [2, 4], unit: '',
    description: '受擊 10% 機率六大屬性各 +X，持續 5 秒',
    buffModifiers: value => ATTRIBUTE_KEYS.map(k => ({ stat: ATTRIBUTE_BUFF_STAT[k], value, isPercent: false })),
  },
  { type: 'magic_resist', name: '魔法抗性', pool: 'accessory', trigger: 'passive', range: [5, 15], unit: '%', description: '魔法抗性 +X%' },
  { type: 'all_attributes', name: '全屬性', pool: 'accessory', trigger: 'passive', range: [1, 2], unit: '', description: '六大屬性各 +X' },
  { type: 'immune_all', name: '全免疫', pool: 'accessory', trigger: 'passive', range: null, unit: '', description: '免疫中毒、流血、暈眩' },

  { type: 'struck_str', name: '受擊力量', pool: 'fixed', trigger: 'struck', range: [2, 4], unit: '', description: '受擊 10% 機率力量 +X，持續 5 秒', buffModifiers: flat(ATTRIBUTE_BUFF_STAT.STR) },
  { type: 'struck_int', name: '受擊智力', pool: 'fixed', trigger: 'struck', range: [2, 4], unit: '', description: '受擊 10% 機率智力 +X，持續 5 秒', buffModifiers: flat(ATTRIBUTE_BUFF_STAT.INT) },
  { type: 'struck_agi', name: '受擊敏捷', pool: 'fixed', trigger: 'struck', range: [2, 4], unit: '', description: '受擊 10% 機率敏捷 +X，持續 5 秒', buffModifiers: flat(ATTRIBUTE_BUFF_STAT.AGI) },
  { type: 'struck_block', name: '受擊格擋', pool: 'fixed', trigger: 'struck', range: [10, 10], unit: '%', description: '受擊 10% 機率格擋率 +X%，持續 5 秒', buffModifiers: flat('block_rate') },
  { type: 'struck_magic_attack', name: '受擊魔攻', pool: 'fixed', trigger: 'struck', range: [5, 10], unit: '', description: '受擊 10% 機率魔法攻擊 +X，持續 5 秒', buffModifiers: flat('magic_attack') },
  { type: 'struck_evasion', name: '受擊迴避', pool: 'fixed', trigger: 'struck', range: [10, 10], unit: '%', description: '受擊 10% 機率迴避率 +X%，持續 5 秒', buffModifiers: value => [{ stat: 'evasion', value, isPercent: true }] },
];

const DEFINITION_BY_TYPE = new Map(UNIQUE_AFFIX_DEFINITIONS.map(d => [d.type, d]));

export function getUniqueAffixDefinition(type: UniqueAffixType): UniqueAffixDefinition {
  return DEFINITION_BY_TYPE.get(type)!;
}

/** § 7T.5 腰帶與左手：由模板 id 指定（`99-ai-constraints.md` § 99.1 第 3 條：一律用 id） */
export const UNIQUE_AFFIX_BY_TEMPLATE: Readonly<Record<number, UniqueAffixType>> = {
  602: 'struck_str',
  603: 'struck_int',
  604: 'struck_agi',
  1155: 'struck_block',
  1171: 'struck_magic_attack',
  1186: 'struck_evasion',
};

const ARMOR_POOL_SLOTS = new Set(['helmet', 'chest', 'shirt', 'cloak', 'gloves', 'boots']);
const ACCESSORY_POOL_SLOTS = new Set(['necklace', 'ring1', 'ring2']);

/** 這個 T7 模板可抽到的獨有詞綴。非 T7 或無對應池時為空陣列 */
export function getUniqueAffixPool(template: { id?: number; slot: string; tier?: number }): UniqueAffixType[] {
  if (template.tier !== 7) return [];
  const fixed = template.id != null ? UNIQUE_AFFIX_BY_TEMPLATE[template.id] : undefined;
  if (fixed) return [fixed];
  const pool: UniqueAffixPool | undefined = template.slot === 'rightHand' ? 'weapon'
    : ARMOR_POOL_SLOTS.has(template.slot) ? 'armor'
    : ACCESSORY_POOL_SLOTS.has(template.slot) ? 'accessory'
    : undefined;
  return pool ? UNIQUE_AFFIX_DEFINITIONS.filter(d => d.pool === pool).map(d => d.type) : [];
}

/** 實例生成時抽一條（§ 7T.2）。非 T7 回 undefined */
export function rollUniqueAffix(template: { id?: number; slot: string; tier?: number }): UniqueAffix | undefined {
  const pool = getUniqueAffixPool(template);
  if (pool.length === 0) return undefined;
  const type = pool[Math.floor(random() * pool.length)];
  const range = getUniqueAffixDefinition(type).range;
  const value = range ? range[0] + Math.floor(random() * (range[1] - range[0] + 1)) : 0;
  return { type, value };
}

type GearLike = { uniqueAffix?: UniqueAffix } | null | undefined;

/** 生效中同種獨有詞綴的數值加總（去重後至多一件） */
export function sumUniqueAffix(gear: readonly GearLike[], type: UniqueAffixType): number {
  let total = 0;
  for (const g of gear) {
    if (g?.uniqueAffix?.type === type) total += g.uniqueAffix.value;
  }
  return total;
}

export function hasUniqueAffix(gear: readonly GearLike[], type: UniqueAffixType): boolean {
  return gear.some(g => g?.uniqueAffix?.type === type);
}

/** 生效中的獨有詞綴清單 */
export function collectUniqueAffixes(gear: readonly GearLike[]): UniqueAffix[] {
  const out: UniqueAffix[] = [];
  for (const g of gear) if (g?.uniqueAffix) out.push(g.uniqueAffix);
  return out;
}

/** 受擊 buff 的 category。同種類互蓋、刷新時間（`24-buff-debuff.md` § 24.4.3） */
export function uniqueStruckCategory(type: UniqueAffixType): string {
  return `t7-${type}`;
}

/** 依受擊觸發的獨有詞綴各擲一次 10%，回傳成功觸發的 buff（§ 7T.4） */
export function rollUniqueStruckBuffs(gear: readonly GearLike[], now: number): ActiveEffect[] {
  const out: ActiveEffect[] = [];
  for (const affix of collectUniqueAffixes(gear)) {
    const def = getUniqueAffixDefinition(affix.type);
    if (def.trigger !== 'struck' || !def.buffModifiers) continue;
    if (random() * 100 >= UNIQUE_STRUCK_CHANCE) continue;
    const category = uniqueStruckCategory(affix.type);
    out.push({
      id: `buff-${category}-${now}`,
      sourceSkillId: category,
      sourceSkillName: def.name,
      category,
      type: 'buff',
      target: 'player',
      modifiers: def.buffModifiers(affix.value),
      startTime: now,
      duration: UNIQUE_STRUCK_DURATION_MS,
      tags: [],
      name: def.name,
      description: formatUniqueAffixEffect(affix).replace(/^受擊 10% 機率/, '').replace(/，持續 5 秒$/, ''),
    });
  }
  return out;
}

/** 效果敘述，X 代入數值 */
export function formatUniqueAffixEffect(affix: UniqueAffix): string {
  return getUniqueAffixDefinition(affix.type).description.replace(/X/g, String(affix.value));
}

/** tooltip 用的一行（§ 7T.7）：`(獨) ` 接效果敘述 */
export function formatUniqueAffixDisplay(affix: UniqueAffix): string {
  return `(獨) ${formatUniqueAffixEffect(affix)}`;
}

/** Wiki 用的數值欄：`10~15`、`固定 10`、`—` */
export function formatUniqueAffixRange(def: UniqueAffixDefinition): string {
  if (!def.range) return '—';
  const [min, max] = def.range;
  return min === max ? `固定 ${min}${def.unit}` : `${min}~${max}${def.unit}`;
}

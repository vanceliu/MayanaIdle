/**
 * 詞綴適用分類。
 * `accessory` = 項鍊／戒指 —— 它們的 `type` 同為 `'armor'`，
 * 需要獨立分類才能限定「魔法抗性」這種飾品專屬詞綴（§ 7.6）。
 */
export type AffixCategory = 'weapon' | 'armor' | 'shield' | 'accessory';

export type AffixType =
  | 'attack_power'
  | 'attack_elemental'
  | 'skill_elemental'
  | 'crit_rate'
  | 'crit_damage'
  | 'attack_speed'
  | 'cooldown_reduction'
  | 'defense'
  | 'max_hp'
  | 'max_mp'
  | 'heal_effect'
  | 'potion_effect'
  | 'drop_rate'
  | 'gold_rate'
  | 'block_rate'
  | 'magic_resist';

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
 * 詛咒／虛弱／減速改由魔抗機率抵抗（§ 24.4.2），刻意不設免疫詞綴。
 */
export const SPECIAL_AFFIX_DEFINITIONS: SpecialAffixDefinition[] = [
  { type: 'immune_poison', name: '毒免疫', description: '免疫中毒（100%）', category: ['armor', 'shield', 'accessory'], minAreaLevel: 31 },
  { type: 'immune_bleed', name: '流血免疫', description: '免疫流血（100%）', category: ['armor', 'shield', 'accessory'], minAreaLevel: 31 },
  { type: 'resist_stun', name: '暈眩抵抗', description: '暈眩時間 -50%', category: ['armor', 'shield', 'accessory'], minAreaLevel: 41 },
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
  min: number;  // percentage
  max: number;  // percentage
}

export const AFFIX_TIERS: AffixTier[] = [
  { tier: 1, min: 3, max: 5 },
  { tier: 2, min: 6, max: 8 },
  { tier: 3, min: 9, max: 11 },
  { tier: 4, min: 12, max: 13 },
  { tier: 5, min: 14, max: 15 },
  { tier: 6, min: 16, max: 18 },
  { tier: 7, min: 19, max: 20 },
];

export interface AffixDefinition {
  type: AffixType;
  name: string;
  category: AffixCategory[];
}

export const AFFIX_DEFINITIONS: AffixDefinition[] = [
  // Weapon affixes (7)
  { type: 'attack_power', name: '攻擊力', category: ['weapon'] },
  { type: 'attack_elemental', name: '普攻元素傷害', category: ['weapon'] },
  { type: 'skill_elemental', name: '技能元素傷害', category: ['weapon'] },
  { type: 'crit_rate', name: '爆擊率', category: ['weapon'] },
  { type: 'crit_damage', name: '爆擊傷害', category: ['weapon'] },
  { type: 'attack_speed', name: '攻擊速度', category: ['weapon'] },
  { type: 'cooldown_reduction', name: '減少冷卻時間', category: ['weapon'] },
  // Armor affixes (7) —— 一般防具、盾牌、飾品皆可出現
  { type: 'defense', name: '防禦力', category: ['armor', 'shield', 'accessory'] },
  { type: 'max_hp', name: '最大 HP', category: ['armor', 'shield', 'accessory'] },
  { type: 'max_mp', name: '最大 MP', category: ['armor', 'shield', 'accessory'] },
  { type: 'heal_effect', name: '補血效果', category: ['armor', 'shield', 'accessory'] },
  { type: 'potion_effect', name: '藥水效果', category: ['armor', 'shield', 'accessory'] },
  { type: 'drop_rate', name: '掉寶率', category: ['armor', 'shield', 'accessory'] },
  { type: 'gold_rate', name: '金幣獲得率', category: ['armor', 'shield', 'accessory'] },
  // Shield exclusive (1)
  { type: 'block_rate', name: '格擋率', category: ['shield'] },
  // Accessory + shield exclusive (1)
  { type: 'magic_resist', name: '魔法抗性', category: ['accessory', 'shield'] },
];

export interface Affix {
  type: AnyAffixType;
  /** 一般詞綴 1~7；特殊詞綴固定 0（無 Tier 分級） */
  tier: number;
  value: number; // rolled percentage value
}

/**
 * 依裝備部位與類型決定詞綴分類（§ 7.6）。
 * 飾品（項鍊／戒指）雖然 `type` 為 `'armor'`，但擁有獨立的詞綴池。
 */
export function getAffixCategoryForSlot(
  slot: string,
  type: string,
): AffixCategory {
  if (type === 'shield') return 'shield';
  // 魔導書是副手裝備，不是武器：走防具池，避免元素師／牧師拿到兩份武器詞綴
  // （8 格攻擊詞綴 vs 其他職業 4 格，見 `44-dps-prediction.md` § 44.10）
  if (type === 'magicBook') return 'armor';
  // 臂甲是盜賊的左手防具（雙刀／鋼爪佔雙手時無法裝備），同樣走防具池
  if (type === 'armGuard') return 'armor';
  if (slot === 'rightHand' || slot === 'leftHand') return 'weapon';
  if (slot === 'necklace' || slot === 'ring1' || slot === 'ring2') return 'accessory';
  return 'armor';
}

export function getAffixPoolForSlot(category: AffixCategory): AffixDefinition[] {
  return AFFIX_DEFINITIONS.filter(d => d.category.includes(category));
}

export function rollAffixTier(areaLevel: number, isBoss: boolean = false): number {
  const weights = isBoss ? getBossTierWeights(areaLevel) : getTierWeights(areaLevel);
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i + 1;
  }
  return 1;
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

/**
 * 特定詞綴的專屬階級表（§ 7.3.1）。未列出者一律套用通用 `AFFIX_TIERS`。
 *
 * 魔法抗性的區間明顯低於通用表：它可同時出現在項鍊／戒指 ×2／盾牌
 * 共 4 個部位，套用通用表會過快頂到 75% 減傷上限。
 */
export const AFFIX_TIER_OVERRIDES: Partial<Record<AffixType, AffixTier[]>> = {
  magic_resist: [
    { tier: 1, min: 1, max: 2 },
    { tier: 2, min: 3, max: 4 },
    { tier: 3, min: 5, max: 6 },
    { tier: 4, min: 7, max: 8 },
    { tier: 5, min: 9, max: 10 },
    { tier: 6, min: 11, max: 15 },
    { tier: 7, min: 16, max: 20 },
  ],
};

export function getAffixTierTable(type?: AffixType): AffixTier[] {
  return (type && AFFIX_TIER_OVERRIDES[type]) || AFFIX_TIERS;
}

export function rollAffixValue(tier: number, type?: AffixType): number {
  const t = getAffixTierTable(type)[tier - 1];
  return Math.floor(Math.random() * (t.max - t.min + 1)) + t.min;
}

/**
 * 商店購買的裝備：詞綴 Tier 硬上限（`06-equipment-acquire.md` § 6A.6）。
 * 生成時只會滾到 T3，且鐵匠鋪的詞綴強化也升不過 T3。
 */
export const SHOP_MAX_AFFIX_TIER = 3;

/** 一般裝備的詞綴強化上限（`07-affix.md` § 7.2）。T6/T7 只能靠掉落原生取得。 */
export const DEFAULT_MAX_AFFIX_TIER = 5;
/** 鐵匠製作品的詞綴 Tier 上限（§ 6A.6）。T6/T7 只能靠掉落原生 */
export const CRAFT_MAX_AFFIX_TIER = 5;

export interface GenerateAffixOptions {
  /** Tier 硬上限。商店裝傳 `SHOP_MAX_AFFIX_TIER`；掉落／製作不傳。 */
  maxTier?: number;
  /** 均等隨機 Tier（不查區域權重表）。商店與製作品用，掉落品不用。 */
  uniformTier?: boolean;
  /**
   * 禁止特殊詞綴（免疫類）。§ 6A.6：商店品與製作品都不會出現特殊詞綴，
   * 只有掉落品依 § 7.10.3 的機率生成。
   */
  noSpecialAffix?: boolean;
}

export function generateAffixes(
  category: AffixCategory,
  areaLevel: number,
  slotCount: number = 4,
  isBoss: boolean = false,
  options: GenerateAffixOptions = {},
): Affix[] {
  const pool = getAffixPoolForSlot(category);
  const available = [...pool];
  // § 6A.6：商店品與製作品不會出現特殊詞綴，只有掉落品會
  const specialAvailable = options.noSpecialAffix ? [] : getSpecialAffixPoolForSlot(category, areaLevel);
  const specialChance = getSpecialAffixChance(areaLevel, isBoss);
  const affixes: Affix[] = [];

  const actualSlots = Math.min(slotCount, available.length);
  for (let i = 0; i < actualSlots; i++) {
    // § 7.10.3 特殊詞綴取代一個一般詞綴位置
    if (specialAvailable.length > 0 && Math.random() * 100 < specialChance) {
      const sIdx = Math.floor(Math.random() * specialAvailable.length);
      const sDef = specialAvailable.splice(sIdx, 1)[0];
      affixes.push({ type: sDef.type, tier: 0, value: 0 });
      continue;
    }
    const idx = Math.floor(Math.random() * available.length);
    const def = available.splice(idx, 1)[0];
    const cap = options.maxTier ?? 7;
    const tier = options.uniformTier
      ? 1 + Math.floor(Math.random() * cap)
      : Math.min(cap, rollAffixTier(areaLevel, isBoss));
    const value = rollAffixValue(tier, def.type);
    affixes.push({ type: def.type, tier, value });
  }

  return affixes;
}

export function getEffectiveAffixValue(affix: Affix, quality: number): number {
  return Math.floor(affix.value * (1 + quality / 100));
}

export interface AffixBonuses {
  attack_power: number;
  attack_elemental: number;
  skill_elemental: number;
  crit_rate: number;
  crit_damage: number;
  attack_speed: number;
  cooldown_reduction: number;
  defense: number;
  max_hp: number;
  max_mp: number;
  heal_effect: number;
  potion_effect: number;
  drop_rate: number;
  gold_rate: number;
  block_rate: number;
  magic_resist: number;
}

export function collectAffixBonuses(gear: { affixes?: Affix[]; quality?: number }[]): AffixBonuses {
  const bonuses: AffixBonuses = {
    attack_power: 0,
    attack_elemental: 0,
    skill_elemental: 0,
    crit_rate: 0,
    crit_damage: 0,
    attack_speed: 0,
    cooldown_reduction: 0,
    defense: 0,
    max_hp: 0,
    max_mp: 0,
    heal_effect: 0,
    potion_effect: 0,
    drop_rate: 0,
    gold_rate: 0,
    block_rate: 0,
    magic_resist: 0,
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

  return bonuses;
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

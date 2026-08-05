/**
 * 詞綴適用分類。
 * `accessory` = 項鍊／戒指 —— 它們的 `type` 同為 `'armor'`，
 * 需要獨立分類才能限定「魔法抗性」這種飾品專屬詞綴（§ 7.6）。
 */
export type AffixCategory = 'weapon' | 'armor' | 'shield' | 'accessory';

export type AffixType =
  | 'attack_power'
  | 'element_brand'
  | 'element_erosion'
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
  | 'magic_resist'
  | 'on_hit_hp'
  | 'on_hit_mp';

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

/** § 7.4 的詞綴分類小標。順序即 `AFFIX_DEFINITIONS` 的排列順序。 */
export type AffixGroup = '攻擊類' | '防禦類' | '補給類' | '掉落類' | '盾牌專屬' | '飾品／盾牌專屬';

export interface AffixDefinition {
  type: AffixType;
  name: string;
  category: AffixCategory[];
  /** § 7.4 的分類小標，Wiki 用來分組與篩選 */
  group: AffixGroup;
  /** § 7.4 的效果敘述，X 代表詞綴滾出的數值 */
  description: string;
}

export const AFFIX_DEFINITIONS: AffixDefinition[] = [
  // Weapon affixes (8) —— § 7.4 攻擊類
  { type: 'attack_power', name: '攻擊力', category: ['weapon'], group: '攻擊類', description: '攻擊力 +X%' },
  { type: 'element_brand', name: '元素刻印', category: ['weapon'], group: '攻擊類', description: '賦予武器一個元素（火／冰／風／地／光／暗），並使普攻傷害 +X%' },
  { type: 'element_erosion', name: '元素侵蝕', category: ['weapon'], group: '攻擊類', description: 'X% 是觸發率：命中後有 X% 機率讓目標中侵蝕，每秒固定傷害、持續 5 秒' },
  { type: 'skill_elemental', name: '技能元素傷害', category: ['weapon'], group: '攻擊類', description: '施放技能時元素傷害（火、冰、風、地、光、暗）+X%' },
  { type: 'crit_rate', name: '爆擊率', category: ['weapon'], group: '攻擊類', description: '爆擊率 +X%' },
  { type: 'crit_damage', name: '爆擊傷害', category: ['weapon'], group: '攻擊類', description: '爆擊傷害 +X%' },
  { type: 'attack_speed', name: '攻擊速度', category: ['weapon'], group: '攻擊類', description: '攻擊速度 +X%' },
  { type: 'cooldown_reduction', name: '減少冷卻時間', category: ['weapon'], group: '攻擊類', description: '技能冷卻時間 -X%' },
  // Armor affixes (7) —— 一般防具、盾牌、飾品皆可出現
  { type: 'defense', name: '防禦力', category: ['armor', 'shield', 'accessory'], group: '防禦類', description: '防禦力 +X%' },
  { type: 'max_hp', name: '最大 HP', category: ['armor', 'shield', 'accessory'], group: '防禦類', description: '最大 HP +X%' },
  { type: 'max_mp', name: '最大 MP', category: ['armor', 'shield', 'accessory'], group: '防禦類', description: '最大 MP +X%' },
  { type: 'heal_effect', name: '補血效果', category: ['armor', 'shield', 'accessory'], group: '補給類', description: '技能補血效果 +X%' },
  { type: 'potion_effect', name: '藥水效果', category: ['armor', 'shield', 'accessory'], group: '補給類', description: '藥水效果 +X%' },
  { type: 'drop_rate', name: '掉寶率', category: ['armor', 'shield', 'accessory'], group: '掉落類', description: '掉寶率 +X%（影響一般怪與 Boss 主掉落表、3~5 級職業技能書；工會任務收集物不受影響）' },
  { type: 'gold_rate', name: '金幣獲得率', category: ['armor', 'shield', 'accessory'], group: '掉落類', description: '金幣獲得率 +X%' },
  // Shield exclusive (1)
  { type: 'block_rate', name: '格擋率', category: ['shield'], group: '盾牌專屬', description: '格擋率 +X%' },
  // Accessory + shield exclusive (1)
  { type: 'magic_resist', name: '魔法抗性', category: ['accessory', 'shield'], group: '飾品／盾牌專屬', description: '魔法抗性 +X%，並降低怪物施加詛咒／虛弱／減速的機率' },
  // 受擊回復（2）—— X% 是觸發率，回復量另外抽（§ 7.4）
  { type: 'on_hit_hp', name: '受擊回血', category: ['armor', 'shield', 'accessory'], group: '防禦類', description: '受到傷害時 X% 機率回復最大 HP 的一定比例' },
  { type: 'on_hit_mp', name: '受擊回魔', category: ['armor', 'shield', 'accessory'], group: '防禦類', description: '受到傷害時 X% 機率回復最大 MP 的一定比例' },
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
   * 受擊回血／受擊回魔每次觸發回復的**比例**（§ 7.4，單位為最大 HP／MP 的百分比）。
   * 抽到當下決定，之後不變 —— 回血 2~4、回魔 2~5。其他詞綴一律 undefined。
   */
  restorePercent?: number;
}

/**
 * 受擊回復的**回復比例**（§ 7.4）：回血 2~4%、回魔 2~5% 的最大值。
 * 兩條分開是因為量級不同 —— 滿裝 maxHP 約 2810，2~4% 換算的等價減傷約 32%，
 * 與其他防禦詞綴仍需取捨；maxMP 的同比例只等於一發技能，故容許到 5%。
 *
 * **Tier 只決定觸發率**（走通用表），回復比例與 Tier 無關，另外抽。
 */
export const ON_HIT_RESTORE_PERCENT: Record<'on_hit_hp' | 'on_hit_mp', [number, number]> = {
  on_hit_hp: [2, 4],
  on_hit_mp: [2, 5],
};

/** 受擊回復比例：抽到當下在該範圍內決定後固定不變（單位為百分比）。 */
export function rollRestorePercent(type: 'on_hit_hp' | 'on_hit_mp'): number {
  const [min, max] = ON_HIT_RESTORE_PERCENT[type];
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** 回復比例套上裝備品質後的實際值（單位仍為百分比） */
export function restorePercentWithQuality(affix: Affix, quality: number): number {
  return Math.max(1, Math.floor((affix.restorePercent ?? 0) * (1 + quality / 100)));
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
      if (a.type !== type || !a.restorePercent) continue;
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

/**
 * 元素侵蝕的每跳傷害（§ 7.4）：`武器平均基傷的一半 ~ 武器平均基傷` 之間隨機，
 * 抽到當下決定，之後固定。下緣取一半而不是 1 —— 否則低 roll 等於沒抽到。
 */
export function rollErosionDamage(weaponBaseDamage: number): number {
  const max = Math.max(1, Math.floor(weaponBaseDamage));
  const min = Math.max(1, Math.floor(max / 2));
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** 元素侵蝕的傷害上限＝武器小怪／大怪基傷的平均（抽詞綴時強化必為 0，故不含強化） */
export function getWeaponBaseDamage(
  tpl: { smallMonsterDamage?: number | null; largeMonsterDamage?: number | null },
): number {
  const s = tpl.smallMonsterDamage ?? 0;
  const l = tpl.largeMonsterDamage ?? 0;
  return Math.max(1, Math.round((s + l) / 2));
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
  // （8 格攻擊詞綴 vs 其他職業 4 格，見 `44-dps-prediction.md` § 44.5）
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
  /**
   * 元素侵蝕的傷害上限（§ 7.4）——武器平均基傷。生成武器詞綴時必填；
   * 未給時侵蝕的每跳傷害會退化成 1。
   */
  weaponBaseDamage?: number;
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
    // § 7.4 元素刻印／元素侵蝕：抽到當下才決定屬性，六種均等隨機，兩條各自獨立抽
    const needsElement = def.type === 'element_brand' || def.type === 'element_erosion';
    const element = needsElement
      ? BRAND_ELEMENTS[Math.floor(Math.random() * BRAND_ELEMENTS.length)]
      : undefined;
    // § 7.4 元素侵蝕：每跳傷害在抽到當下由 `武器平均基傷的一半 ~ 武器平均基傷` 決定，之後固定不變
    const dotDamage = def.type === 'element_erosion'
      ? rollErosionDamage(options.weaponBaseDamage ?? 1)
      : undefined;
    // § 7.4 受擊回復：回復比例在抽到當下決定，之後固定；與 Tier 無關
    const restorePercent = def.type === 'on_hit_hp' || def.type === 'on_hit_mp'
      ? rollRestorePercent(def.type)
      : undefined;
    affixes.push({
      type: def.type, tier, value,
      ...(element ? { element } : {}),
      ...(dotDamage ? { dotDamage } : {}),
      ...(restorePercent ? { restorePercent } : {}),
    });
  }

  return affixes;
}

export function getEffectiveAffixValue(affix: Affix, quality: number): number {
  return Math.floor(affix.value * (1 + quality / 100));
}

/**
 * 這條詞綴是否滾到所屬 Tier 的**上限值**（§ 7.3.2，UI 以粗體標示）。
 *
 * 判定用未吃品質的原始 `value` —— 品質是裝備屬性、對每條詞綴等比放大，
 * 不影響「這次 roll 在該 Tier 內是否完美」這件事。
 * 特殊詞綴無 Tier 也無數值，一律 false。
 */
export function isMaxRollAffix(affix: Affix): boolean {
  if (isSpecialAffixType(affix.type)) return false;
  const t = getAffixTierTable(affix.type)[affix.tier - 1];
  return !!t && affix.value === t.max;
}

/**
 * 詞綴的顯示文字（一般：`攻擊力 +12% (T4)`；特殊：`[特殊] 毒免疫`，見 § 7.10.5）。
 *
 * `Affix` 只存 `{ type, tier, value }`，文字是衍生資料，不進 DB。
 * 遺產快照是唯一例外：封存當下就把這段文字寫死，日後 `AFFIX_DEFINITIONS`
 * 改名或刪詞綴時，舊紀錄仍顯示封存當時的正確名稱（§ 45.1）。
 */
export function formatAffixDisplay(affix: Affix, quality: number = 0): string {
  if (isSpecialAffixType(affix.type)) {
    const def = getSpecialAffixDefinition(affix.type);
    return `[特殊] ${def?.name ?? affix.type}`;
  }
  const def = AFFIX_DEFINITIONS.find(d => d.type === affix.type);
  const name = affix.element ? `${def?.name}（${BRAND_ELEMENT_ZH[affix.element]}）` : (def?.name ?? affix.type);
  // 元素侵蝕的% 是觸發率、不是傷害%，另外把每跳固定傷害寫出來
  if (affix.type === 'on_hit_hp' || affix.type === 'on_hit_mp') {
    const pct = restorePercentWithQuality(affix, quality);
    const what = affix.type === 'on_hit_hp' ? '最大HP' : '最大MP';
    return `${name} ${getEffectiveAffixValue(affix, quality)}% 觸發／回復${what} ${pct}% (T${affix.tier})`;
  }
  if (affix.type === 'element_erosion') {
    const dot = Math.max(1, Math.floor((affix.dotDamage ?? 0) * (1 + quality / 100)));
    return `${name} ${getEffectiveAffixValue(affix, quality)}% 觸發／每秒 ${dot} (T${affix.tier})`;
  }
  return `${name} +${getEffectiveAffixValue(affix, quality)}% (T${affix.tier})`;
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

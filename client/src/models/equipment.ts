import type { Affix } from './affix';
import { collectAffixAttributes } from './affix';
import type { Attributes } from './attributes';
import { ATTRIBUTE_KEYS } from './attributes';

export type EquipSlot =
  | 'rightHand'
  | 'leftHand'
  | 'helmet'
  | 'chest'
  | 'shirt'
  | 'cloak'
  | 'belt'
  | 'gloves'
  | 'boots'
  | 'necklace'
  | 'ring1'
  | 'ring2';


/**
 * 普通攻擊的武器射程（格）。`41-arpg-combat.md` § 3.1 為權威定義。
 *
 * 14 種武器類型裡只有弓是遠程，其餘（含法杖、魔導書）普通攻擊都得貼身。
 *
 * 常數放在 model 層而非 FSM：UI 與戰鬥邏輯讀同一份。
 */
export const MELEE_WEAPON_RANGE = 1.5;
export const WEAPON_RANGE: Record<string, number> = {
  bow: 15,
};

export function getWeaponRange(weaponType: string | undefined): number {
  return (weaponType && WEAPON_RANGE[weaponType]) || MELEE_WEAPON_RANGE;
}

/** 是否為遠程武器。近戰是預設值，介面只在「不是預設」時才需要標出射程 */
export function isRangedWeapon(weaponType: string | undefined): boolean {
  return getWeaponRange(weaponType) > MELEE_WEAPON_RANGE;
}

/** 裝備部位的顯示名稱。裝備欄、新手 NPC 等多處共用，不可各自複製一份。 */
export const SLOT_NAMES: Record<EquipSlot, string> = {
  rightHand: '右手',
  leftHand: '左手',
  helmet: '頭盔',
  chest: '胸甲',
  shirt: '上衣',
  cloak: '斗篷',
  belt: '腰帶',
  gloves: '手套',
  boots: '鞋子',
  necklace: '項鍊',
  ring1: '戒指1',
  ring2: '戒指2',
};

/**
 * 部位的固定排列順序。裝備欄與背包的「裝備中」格子共用同一份，
 * 兩邊各留一份會在改順序時只改到一邊。
 */
export const SLOT_ORDER: EquipSlot[] = [
  'rightHand', 'leftHand', 'helmet', 'chest', 'shirt', 'cloak', 'belt',
  'gloves', 'boots', 'necklace', 'ring1', 'ring2',
];

export type WeaponType =
  | 'sword'
  | 'axe'
  | 'mace'
  | 'staff'
  | 'bow'
  | 'twoHandSword'
  | 'twoHandAxe'
  | 'twoHandStaff'
  | 'dualBlade'
  | 'claw'
  | 'shield'
  | 'magicBook'
  | 'armGuard';

/** 飾品部位（項鍊／戒指）——詞綴分類與強化規則與一般防具不同 */
export const ACCESSORY_SLOTS: EquipSlot[] = ['necklace', 'ring1', 'ring2'];

export function isAccessorySlot(slot: EquipSlot): boolean {
  return ACCESSORY_SLOTS.includes(slot);
}

export type WeaponMaterial = 'wood' | 'iron' | 'silver' | 'mithril' | 'dragon' | 'orichalcum';

/**
 * 防具路線（`06-equipment.md` § 6A.8.8）。取代防具的職業限制 ——
 * 誰穿得上改由 `requiredAttributes` 決定，路線只決定「看哪個屬性」。
 *
 * | 路線 | 主需求 | 第二需求 | 左手對應 |
 * |---|---|---|---|
 * | robe | 智力 | 精神 | 魔導書 |
 * | light | 敏捷 | 體質 | 臂甲 |
 * | heavy | 力量 | 體質 | 盾牌 |
 */
export type ArmorLine = 'robe' | 'light' | 'heavy';

/** 各路線的主需求／第二需求看哪個屬性（§ 6A.8.8） */
export const ARMOR_LINE_ATTRIBUTES: Record<ArmorLine, { primary: keyof Attributes; secondary: keyof Attributes }> = {
  robe: { primary: 'INT', secondary: 'SPI' },
  light: { primary: 'AGI', secondary: 'VIT' },
  heavy: { primary: 'STR', secondary: 'VIT' },
};

/**
 * 素質需求階梯（§ 6A.8.8）。索引即裝備 tier，T1 新手裝無需求。
 * T6 的 18 是建角配點的單項上限，T7 的 24 只有 Lv51+ 加點才碰得到。
 */
export const ARMOR_REQUIREMENT_LADDER: { primary: number; secondary: number }[] = [
  { primary: 0, secondary: 0 },   // T0（未使用）
  { primary: 0, secondary: 0 },   // T1 新手裝
  { primary: 10, secondary: 0 },  // T2
  { primary: 12, secondary: 0 },  // T3
  { primary: 14, secondary: 12 }, // T4
  { primary: 16, secondary: 14 }, // T5
  { primary: 18, secondary: 16 }, // T6
  { primary: 24, secondary: 18 }, // T7
];

/** 防具隨機額外防禦的範圍（§ 6A.8.8）：實例生成時抽，0／1／2 均等 */
export const DEFENSE_BONUS_MIN = 0;
export const DEFENSE_BONUS_MAX = 2;

/** 防具安定值的抽取範圍（§ 6.10）：實例生成時抽，4／5／6 均等 */
export const ARMOR_STABILITY_MIN = 4;
export const ARMOR_STABILITY_MAX = 6;

export type AcquireType = 'shop' | 'craft' | 'drop_only' | 'starter';

/**
 * 裝備階級（`06-equipment-acquire.md` § 6A.1）。單一刻度取代舊的 shopTier／craftTier。
 *
 * | 分組 | Tier | 取得 | 詞綴上限 |
 * |---|---|---|---|
 * | 低階 | 1 | 新手裝（創角直接穿上，不販售） | T3 |
 * | 低階 | 2~3 | 商店可買 | T3 |
 * | 中階 | 4~5 | 鐵匠製作 | T5 |
 * | 高階 | 6 | 僅一般怪物掉落 | T7 |
 * | 高階 | 7 | 僅 Boss 掉落 | T7 |
 *
 * 與詞綴 Tier 規則對稱：T1~T5 靠買／做／強化，T6 靠打怪，T7 靠打 Boss。
 *
 * 不變式：tier N+1 的素質天花板必須嚴格大於 tier N。
 * 與「詞綴 Tier」同為 1~7 但意義不同，UI 顯示需標明「裝備Tier」。
 */
export type EquipmentTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** 商店販售的階級範圍。T1 是新手裝專屬階級，商店從 T2 開始賣 */
export const MIN_SHOP_TIER = 2;
export const MAX_SHOP_TIER = 3;

/** 鐵匠可製作的最高裝備階級（中階 = T4~T5）。T6/T7 為掉落限定 */
/** 鐵匠可製作的最高階級。T6 有一半開放製作（仍照掉），T7 僅 Boss 掉落 */
export const MAX_CRAFT_TIER = 6;

/** 僅一般怪物掉落的階級 */
export const MONSTER_DROP_ONLY_TIER = 6;

/** 僅 Boss 掉落的階級 */
export const BOSS_DROP_ONLY_TIER = 7;

/** @deprecated 由 `tier` 取代，僅供舊資料遷移期間讀取 */
export type CraftTier = 'entry' | 'mid' | 'top';
/** @deprecated 由 `tier` 取代，僅供舊資料遷移期間讀取 */
export type ShopTier = 'low' | 'mid' | 'high';

export interface CraftMaterial {
  /** 材料的 `ITEM_DEFINITIONS` id。存 id 不存名稱，道具改名不必動配方 */
  itemId: number;
  amount: number;
}

export interface CraftPrerequisiteWeapon {
  /**
   * 前置武器的 `EQUIPMENT_SEEDS` id。與 `CraftMaterial.itemId` 同理存 id 不存名稱
   * （`99-ai-constraints.md` § 99.1 第 3、7 條）—— 名稱比對會在裝備改名後靜默失效，
   * 而這裡的比對結果會拿去**刪除玩家的裝備實例**，失效的代價不只是判定錯誤。
   *
   * 比對語意不變（`06-equipment-acquire.md` § 6A.3）：只認是哪一個模板，
   * 不限來源，強化值／詞綴／品質皆不影響。
   */
  templateId: number;
  quantity: number;
}

export interface EquipmentTemplate {
  id?: number;
  name: string;
  type: WeaponType | 'armor';
  slot: EquipSlot;
  isTwoHanded: boolean;
  smallMonsterDamage?: number;
  largeMonsterDamage?: number;
  defense?: number;
  attackSuccess?: number;
  extraAttack?: number;
  magicAttack?: number;
  bonusHp?: number;
  bonusMp?: number;
  hpRegen?: number;
  mpRegen?: number;
  bonusWeight?: number;
  /** 腰帶專屬：擴充背包格數（`35-inventory-constraints.md` § 35.1） */
  bonusBagSlots?: number;
  /** 顯示用文字（如「力量+2」）。實際生效的數值一律讀 `bonusAttributes`。 */
  bonusStats?: string;
  /**
   * 額外屬性（`06-equipment.md` § 6.8）。單一屬性、最多 +2。
   * 疊加於 `baseAttributes + bonusAttributes` 之上，**不受 35 點上限限制**，
   * 也**不影響升級時的 HP/MP 成長**（見 `20-attributes.md` § 20.10）。
   */
  bonusAttributes?: Partial<Attributes>;
  blockRate?: number;
  weight?: number;
  material?: WeaponMaterial;
  /**
   * 防具路線（`06-equipment.md` § 6A.8.8）。防具必填，武器與飾品為 undefined。
   * 決定 `requiredAttributes` 看哪個屬性，也決定同一（部位 × 階級）的三件怎麼分。
   */
  line?: ArmorLine;
  /**
   * 素質需求（§ 6A.8.8）。**防具沒有 `requiredClass`**，能不能穿看這裡。
   * 未滿足時仍可裝備，但該件的詞綴全部凍結。
   */
  requiredAttributes?: Partial<Attributes>;
  /** 職業限制（武器與 T1 新手裝用；一般防具改用 `requiredAttributes`） */
  requiredClass?: string[];
  buyPrice: number;
  stability?: number;
  canBreak?: boolean;
  acquireType?: AcquireType;
  /** 裝備階級 1~7（`06-equipment-acquire.md` § 6A.1）。取代 shopTier / craftTier。 */
  tier?: EquipmentTier;
  /** @deprecated 由 `tier` 取代 */
  shopTier?: ShopTier;
  /** @deprecated 由 `tier` 取代 */
  craftTier?: CraftTier;
  /** 製作費，一律 0 —— 製作不收金幣（`06-equipment-acquire.md` § 6A.3） */
  craftGold?: number;
  craftMaterials?: CraftMaterial[];
  craftPrerequisiteWeapon?: CraftPrerequisiteWeapon;
}

export interface EquipmentInstance {
  id?: number;
  /**
   * 該實例的詞綴 Tier 硬上限（`06-equipment-acquire.md` § 6A.6）。
   * 商店購買時寫入 3；掉落與製作品為 `undefined`，走預設上限 5。
   * 屬於實例而非模板 —— 同一模板由怪物掉落取得時不受限。
   */
  maxAffixTier?: number;
  templateId: number;
  name: string;
  type: WeaponType | 'armor';
  slot: EquipSlot;
  isTwoHanded: boolean;
  smallMonsterDamage?: number;
  largeMonsterDamage?: number;
  defense?: number;
  attackSuccess?: number;
  extraAttack?: number;
  magicAttack?: number;
  bonusHp?: number;
  bonusMp?: number;
  hpRegen?: number;
  mpRegen?: number;
  bonusWeight?: number;
  /** 腰帶專屬：擴充背包格數（`35-inventory-constraints.md` § 35.1） */
  bonusBagSlots?: number;
  /** 顯示用文字（如「力量+2」）。實際生效的數值一律讀 `bonusAttributes`。 */
  bonusStats?: string;
  /**
   * 額外屬性（`06-equipment.md` § 6.8）。單一屬性、最多 +2。
   * 疊加於 `baseAttributes + bonusAttributes` 之上，**不受 35 點上限限制**，
   * 也**不影響升級時的 HP/MP 成長**（見 `20-attributes.md` § 20.10）。
   */
  bonusAttributes?: Partial<Attributes>;
  blockRate?: number;
  weight?: number;
  material?: WeaponMaterial;
  /** 防具路線（§ 6A.8.8），由模板複製而來 */
  line?: ArmorLine;
  /** 素質需求（§ 6A.8.8），由模板複製而來 */
  requiredAttributes?: Partial<Attributes>;
  /**
   * 隨機額外防禦（§ 6A.8.8）。**實例生成時抽 0~2，均等**，之後不變。
   * 與基礎防禦、強化等級三段相加才是這件的實際防禦（`21-combat-formula.md` § 21.5）。
   */
  defenseBonus?: number;
  element?: string;
  quality: number; // 0~20
  enhancement: number;
  /**
   * 安定值。武器 6、飾品 0、腰帶 -1（不可強化）皆沿用模板值；
   * **防具於實例生成時抽 4~6**（§ 6.10），因此同模板的兩件可以不同。
   */
  stability?: number;
  affixes: Affix[]; // up to 4 affix slots
  requiredClass?: string[];
  ownerId: number;
  equipped: boolean;
  inStorage?: boolean;
  storageType?: 'personal' | 'shared';
  isStarterGear?: boolean;
}

/** 防具隨機額外防禦：實例生成時抽 0／1／2，均等（§ 6A.8.8） */
export function rollDefenseBonus(): number {
  return DEFENSE_BONUS_MIN + Math.floor(Math.random() * (DEFENSE_BONUS_MAX - DEFENSE_BONUS_MIN + 1));
}

/** 防具安定值：實例生成時抽 4／5／6，均等（§ 6.10） */
export function rollArmorStability(): number {
  return ARMOR_STABILITY_MIN + Math.floor(Math.random() * (ARMOR_STABILITY_MAX - ARMOR_STABILITY_MIN + 1));
}

/**
 * 一件防具的實際防禦（`21-combat-formula.md` § 21.5 的第一段）：
 * 基礎固定值 + 隨機額外 + 強化等級。素質需求未滿足時**三段照算**，凍結的只有詞綴。
 */
export function getItemDefense(item: {
  defense?: number; defenseBonus?: number; enhancement?: number;
}): number {
  return (item.defense ?? 0) + (item.defenseBonus ?? 0) + (item.enhancement ?? 0);
}

/**
 * 某（路線 × 階級）的素質需求（§ 6A.8.8）。第二需求為 0 的階級不列該屬性。
 * 主需求與第二需求同屬性時（不會發生於現行三路線）取較大值。
 */
export function getArmorRequirement(line: ArmorLine, tier: EquipmentTier): Partial<Attributes> {
  const ladder = ARMOR_REQUIREMENT_LADDER[tier];
  if (!ladder || ladder.primary <= 0) return {};
  const { primary, secondary } = ARMOR_LINE_ATTRIBUTES[line];
  const out: Partial<Attributes> = { [primary]: ladder.primary };
  if (ladder.secondary > 0) {
    out[secondary] = Math.max(out[secondary] ?? 0, ladder.secondary);
  }
  return out;
}

/** 這組屬性是否滿足該件的素質需求（§ 6A.8.8） */
export function meetsAttributeRequirement(
  required: Partial<Attributes> | undefined,
  attributes: Attributes,
): boolean {
  if (!required) return true;
  return ATTRIBUTE_KEYS.every(k => attributes[k] >= (required[k] ?? 0));
}

/** 一件裝備提供的額外屬性：模板的 `bonusAttributes` 加上額外屬性詞綴（§ 20.10） */
function itemAttributeContribution(item: EquipmentInstance): Partial<Attributes> {
  const out: Partial<Attributes> = { ...item.bonusAttributes };
  const fromAffixes = collectAffixAttributes([item]);
  for (const k of ATTRIBUTE_KEYS) {
    const v = fromAffixes[k];
    if (v) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

/**
 * 素質需求的**最小固定點**解（§ 6A.8.8）。
 *
 * 1. 起算值＝角色自身屬性（建角＋升級配點＋buff），**不含任何裝備**
 * 2. 掃過裝備，把需求已滿足的納入，累加其額外屬性
 * 3. 重複第 2 步，直到沒有新的裝備被納入
 *
 * 「A 撐起 B」成立；兩件互相認證（A 給敏捷需力量、B 給力量需敏捷）不成立 ——
 * 起算值不含裝備，兩件誰都進不了第一輪。判定結果與穿戴順序無關。
 *
 * 回傳「詞綴生效」的裝備集合。不在集合裡的件仍然裝備著、防禦與重量照算，
 * 只有那 4 條詞綴凍結。
 */
export function resolveActiveGear(
  gear: (EquipmentInstance | null | undefined)[],
  selfAttributes: Attributes,
): Set<EquipmentInstance> {
  const total: Attributes = { ...selfAttributes };
  const active = new Set<EquipmentInstance>();
  const pending: EquipmentInstance[] = [];

  const admit = (item: EquipmentInstance) => {
    active.add(item);
    const contrib = itemAttributeContribution(item);
    for (const k of ATTRIBUTE_KEYS) total[k] += contrib[k] ?? 0;
  };

  for (const item of gear) {
    if (!item) continue;
    if (!item.requiredAttributes) admit(item);
    else pending.push(item);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      if (!meetsAttributeRequirement(pending[i].requiredAttributes, total)) continue;
      admit(pending.splice(i, 1)[0]);
      changed = true;
    }
  }

  return active;
}

/** 這件裝備的詞綴目前有沒有生效（§ 6A.8.8）。`active` 由 `resolveActiveGear()` 取得 */
export function areAffixesActive(
  item: EquipmentInstance | null | undefined,
  active: Set<EquipmentInstance>,
): boolean {
  return !!item && (!item.requiredAttributes || active.has(item));
}

export function isHandSlot(slot: EquipSlot): boolean {
  return slot === 'rightHand' || slot === 'leftHand';
}

/** @deprecated Use isHandSlot */
export const isWeaponSlot = isHandSlot;

/**
 * 副手防禦裝備：佔手部欄位，但性質是防具。
 * 與詞綴系統同一條分界（`07-affix.md` § 7.6：這三種走防具池／盾牌池，不吃武器詞綴）。
 */
export const OFFHAND_DEFENSE_TYPES: WeaponType[] = ['shield', 'magicBook', 'armGuard'];

/**
 * 這件裝備會不會**佔住一隻手**（`06-equipment.md` § 6.5）。
 *
 * 臂甲是唯一的例外：它套在前臂上，手仍然是空的，
 * 所以可以與雙手武器並存 —— 盾牌與魔導書要握著，不行。
 */
export function occupiesHand(item: { slot: EquipSlot; type: string } | null | undefined): boolean {
  if (!item) return false;
  if (item.slot !== 'leftHand' && item.slot !== 'rightHand') return false;
  return item.type !== 'armGuard';
}

export function isOffhandDefenseType(type: string): boolean {
  return (OFFHAND_DEFENSE_TYPES as string[]).includes(type);
}

/**
 * 武器／防具的語意分類（統計用，見 `37-statistics.md` § 37.1）。
 * **不可改用 `isHandSlot`**：那是掉落池的「取得管道」分界，
 * 會把盾牌／魔導書／臂甲算成武器。
 */
export function isWeaponEquipment(slot: EquipSlot, type: string): boolean {
  return isHandSlot(slot) && !isOffhandDefenseType(type);
}

/**
 * 分類是防具 —— 一般防具＋盾牌／魔導書／臂甲（`06-equipment.md` § 副手裝備）。
 * 與 `isWeaponEquipment` 互補，Wiki 分頁與素材用途連結都用這條分界。
 */
export function isArmorEquipment(slot: EquipSlot, type: string): boolean {
  return !isWeaponEquipment(slot, type);
}

/**
 * 強化等級是否計入防禦（`21-combat-formula.md` § 21.5）。
 *
 * 判斷看**分類**不看基礎防禦數值：基礎防禦 0 的防具（T4 上衣，`06-equipment.md` § 6A.8.9）
 * 強化照樣給防禦；飾品的強化走 § 6.10.1 的魔抗與數值倍率，不進防禦合計。
 */
export function enhancementCountsAsDefense(item: { slot: EquipSlot; type: string }): boolean {
  return isArmorEquipment(item.slot, item.type) && !isAccessorySlot(item.slot);
}

export type EquippedGear = Partial<Record<EquipSlot, EquipmentInstance | null>>;

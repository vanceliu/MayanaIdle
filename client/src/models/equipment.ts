import type { Affix } from './affix';
import type { Attributes } from './character';

export type EquipSlot =
  | 'rightHand'
  | 'leftHand'
  | 'helmet'
  | 'chest'
  | 'belt'
  | 'gloves'
  | 'boots'
  | 'necklace'
  | 'ring1'
  | 'ring2';


/**
 * 普通攻擊的武器射程（格）。`41-arpg-combat.md` § 3.1 為權威定義。
 *
 * 14 種武器類型裡只有弓是遠程，其餘（含法杖、魔導書）普通攻擊都得貼身 ——
 * 法系的輸出靠技能射程，不靠武器。
 *
 * 常數放在 model 層而非 FSM：介面要顯示同一個數字，
 * 抽出來才不會 UI 自己抄一份 15 然後跟戰鬥邏輯漂移。
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
  'rightHand', 'leftHand', 'helmet', 'chest', 'belt',
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
  element?: string;
  quality: number; // 0~20
  enhancement: number;
  stability?: number; // weapon default 6, armor default 4, -1 = no enhance
  affixes: Affix[]; // up to 4 affix slots
  requiredClass?: string[];
  ownerId: number;
  equipped: boolean;
  inStorage?: boolean;
  storageType?: 'personal' | 'shared';
  isStarterGear?: boolean;
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

export type EquippedGear = Partial<Record<EquipSlot, EquipmentInstance | null>>;

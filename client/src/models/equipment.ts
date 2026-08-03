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

export type WeaponType =
  | 'sword'
  | 'dagger'
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
 * 裝備階級（`06-equipment-balance.md` § 6A.8）。單一刻度取代舊的 shopTier／craftTier。
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
  name: string;
  amount: number;
}

export interface CraftPrerequisiteWeapon {
  name: string;
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
   * 額外屬性（`06-equipment.md` § 6.8）。單一屬性、最多 +2（`99-ai-constraints.md` 第 35 條）。
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
  /** 裝備階級 1~7（§ 6A.8）。取代 shopTier / craftTier。 */
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
   * 額外屬性（`06-equipment.md` § 6.8）。單一屬性、最多 +2（`99-ai-constraints.md` 第 35 條）。
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

export type EquippedGear = Partial<Record<EquipSlot, EquipmentInstance | null>>;

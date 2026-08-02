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
  | 'magicBook';

/** 飾品部位（項鍊／戒指）——詞綴分類與強化規則與一般防具不同 */
export const ACCESSORY_SLOTS: EquipSlot[] = ['necklace', 'ring1', 'ring2'];

export function isAccessorySlot(slot: EquipSlot): boolean {
  return ACCESSORY_SLOTS.includes(slot);
}

export type WeaponMaterial = 'wood' | 'iron' | 'silver' | 'mithril' | 'dragon' | 'orichalcum';

export type AcquireType = 'shop' | 'craft' | 'drop_only' | 'starter';
export type CraftTier = 'entry' | 'mid' | 'top';
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
  shopTier?: ShopTier;
  craftTier?: CraftTier;
  craftGold?: number;
  craftMaterials?: CraftMaterial[];
  craftPrerequisiteWeapon?: CraftPrerequisiteWeapon;
}

export interface EquipmentInstance {
  id?: number;
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

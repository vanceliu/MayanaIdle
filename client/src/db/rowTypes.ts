/**
 * 持久層資料列型別。server 與 client 共用；Dexie 綁定在 `database.ts`。
 */
import type { EquipmentTier } from '../models/equipment';

export interface UserEntry {
  id?: number;
  createdAt: number;
}

export interface WarehouseEntry {
  id?: number;
  userId: number;
  name: string;
  /**
   * `'gold'` 已於 v16 移除 —— 金幣改存 `warehouseGold` 表（見 `WarehouseGoldEntry`）。
   * 這裡是**物品**的分類，混入一個餘額用的假分類會讓每個走訪倉庫的迴圈
   * 都得先記得跳過它，而漏掉的那個就會把餘額當成一疊道具。
   */
  type: 'equipment' | 'material' | 'potion' | 'scroll' | 'spellbook';
  itemTemplateId?: number;
  amount: number;
  storageType: 'personal' | 'shared';
  characterId?: number;
}

/**
 * 共用倉庫的金幣餘額，一個帳號一列（`18-data-schema.md` § 18.7：
 * 「倉庫另有獨立金幣存放欄位供跨角色轉移」）。
 *
 * 金幣是餘額不是物品：它沒有 `itemTemplateId`、不佔格數、不計重量，
 * 而且線上化後需要「不可為負」的原子扣減（`98-online-architecture.md` § 4）。
 * 與物品同表只能靠 `type` 字串區分，那三個性質一個都保證不了。
 */
export interface WarehouseGoldEntry {
  /** 主鍵。共用倉庫綁帳號層級，故一個 userId 只會有一列 */
  userId: number;
  amount: number;
}

export interface DropTableEntry {
  id?: number;
  area: string;
  itemType: 'gold' | 'equipment' | 'item';
  equipmentTemplateId?: number;
  equipmentPool?: 'weapon' | 'armor' | 'all';
  acquireType?: 'shop' | 'craft';
  /** 掉落池的裝備階級（`06-equipment-acquire.md` § 6A.1）。取代舊的 shopTier / craftTier。 */
  tier?: EquipmentTier;
  itemTemplateId?: number;
  dropValue: number;
  /** 區域內依怪物等級線性遞增的掉落值上限（§ 27.3 以「50~100」標示者）。省略 = 固定值 */
  dropValueMax?: number;
  minAmount?: number;
  maxAmount?: number;
}

export interface BossDropTableEntry {
  id?: number;
  bossName: string;
  itemType: 'gold' | 'equipment' | 'item';
  equipmentTemplateId?: number;
  equipmentPool?: 'weapon' | 'armor' | 'all';
  acquireType?: 'shop' | 'craft';
  /** 掉落池的裝備階級（`06-equipment-acquire.md` § 6A.1）。取代舊的 shopTier / craftTier。 */
  tier?: EquipmentTier;
  itemTemplateId?: number;
  dropValue: number;
  minAmount?: number;
  maxAmount?: number;
}

export interface CharacterBagEntry {
  id?: number;
  characterId: number;
  name: string;
  type: 'material' | 'potion' | 'scroll' | 'spellbook';
  itemTemplateId?: number;
  amount: number;
}

import type { BagItem } from '../models/bagItem';
import type { EquipmentInstance, EquipmentTemplate } from '../models/equipment';
import type { EquipmentTierLevel } from '../models/equipmentTier';
import { getItemById } from '../models/items';
import { getEquipmentInstanceTierLevel } from '../models/equipmentTier';
import { hasMaterialUsage } from './craftMaterialUsage';

/**
 * 商店定價與可賣判定（`39-batch-sell.md`）。
 *
 * 這裡是**唯一一份**：雜貨店／武器店／防具店的手動買賣、批量販售，
 * 以及村莊腳本的自動販售全走這些函式。
 * 三家商店各留一份自己的定價時，改回收價得同時改四處，
 * 漏一處就變成「手動賣」與「腳本自動賣」拿到不同金額。
 *
 * 本檔只做計算與篩選，不碰 store 與 db —— 實際寫入是 gameStore 的
 * `sellBagItems` / `sellEquipmentInstances` / `buyBagItems`。
 */

/** 商店回收價一律為買價的一半 */
export const SHOP_SELL_RATE = 0.5;

// === 道具（雜貨店） ===

/** 道具的基準價（買價或標定的售價）。`noSell` 明確不可販售，不靠「沒填價格」來擋 */
export function getItemBasePrice(itemId: number): number {
  const def = getItemById(itemId);
  if (def?.noSell) return 0;
  if (def?.sellPrice) return def.sellPrice;
  if (def?.buyPrice) return def.buyPrice;
  return 0;
}

/** 單顆回收價 */
export function getItemSellPrice(itemId: number): number {
  return Math.floor(getItemBasePrice(itemId) * SHOP_SELL_RATE);
}

export function isSellableItem(itemId: number): boolean {
  return getItemBasePrice(itemId) > 0;
}

export interface MaterialBatchOptions {
  /** 顏色只表達稀有度，「Tier N 以下」會連進得了配方的素材一起掃掉，故預設保護 */
  skipCraftMaterials?: boolean;
}

/** 批量販售：挑出 iconTier ≤ maxTier 的素材 */
export function collectSellableMaterials(
  bagItems: BagItem[],
  maxTier: number,
  options: MaterialBatchOptions = {},
): BagItem[] {
  const { skipCraftMaterials = true } = options;
  return bagItems.filter(item => {
    if (item.type !== 'material') return false;
    const def = getItemById(item.itemId);
    if (!def || !def.iconTier || def.noSell) return false;
    if (skipCraftMaterials && hasMaterialUsage(item.itemId)) return false;
    if (getItemSellPrice(item.itemId) <= 0) return false;
    return def.iconTier <= maxTier;
  });
}

/** 被「跳過配方素材」擋下來的素材，用來告訴玩家少賣了什麼，而不是靜默漏掉 */
export function collectProtectedMaterials(bagItems: BagItem[], maxTier: number): BagItem[] {
  return bagItems.filter(item => {
    if (item.type !== 'material' || !hasMaterialUsage(item.itemId)) return false;
    const def = getItemById(item.itemId);
    return !!def?.iconTier && !def.noSell && def.iconTier <= maxTier;
  });
}

export function getMaterialsSellTotal(items: BagItem[]): number {
  return items.reduce((sum, item) => sum + getItemSellPrice(item.itemId) * item.amount, 0);
}

// === 裝備（武器店／防具店） ===

/**
 * 裝備回收價。
 * 新手裝不能賣 —— `isStarterGear` 只有從新手指導員領取時才會標，
 * 創角直接穿上的那套沒有旗標，所以改從模板的 `acquireType` 判斷。
 */
export function getEquipmentSellPrice(
  item: EquipmentInstance,
  templates: EquipmentTemplate[],
): number {
  const template = templates.find(t => t.id === item.templateId);
  if (template?.acquireType === 'starter') return 0;
  if (template?.buyPrice) return Math.floor(template.buyPrice * SHOP_SELL_RATE);
  if (template?.craftGold) return Math.floor(template.craftGold * SHOP_SELL_RATE);
  return 0;
}

/** 出售清單的共同條件：賣得掉、不是新手裝、沒穿在身上 */
export function isSellableEquipment(
  item: EquipmentInstance,
  templates: EquipmentTemplate[],
  equippedIds: Set<number | undefined>,
): boolean {
  if (getEquipmentSellPrice(item, templates) <= 0) return false;
  if (item.isStarterGear) return false;
  return !equippedIds.has(item.id);
}

/** 武器店只收武器、防具店只收其餘部位。判定依據是有沒有小怪傷害 */
export function isWeaponInstance(item: EquipmentInstance): boolean {
  return !!item.smallMonsterDamage;
}

/**
 * 批量販售：挑出等級 ≤ maxTier 的裝備。
 * `drop_only` 與 tier 0（新手裝）一律排除，避免「Tier N 以下」把它們一起掃掉。
 */
export function collectBatchSellEquipment(
  items: EquipmentInstance[],
  templates: EquipmentTemplate[],
  maxTier: EquipmentTierLevel,
): EquipmentInstance[] {
  return items.filter(item => {
    const tierLevel = getEquipmentInstanceTierLevel(item, templates);
    if (tierLevel === 0) return false;
    const template = templates.find(t => t.id === item.templateId);
    if (template?.acquireType === 'starter') return false;
    if (template?.acquireType === 'drop_only') return false;
    return tierLevel <= maxTier;
  });
}

export function getEquipmentSellTotal(
  items: EquipmentInstance[],
  templates: EquipmentTemplate[],
): number {
  return items.reduce((sum, item) => sum + getEquipmentSellPrice(item, templates), 0);
}

/** 批量販售的等級選項（武器店／防具店共用） */
export const EQUIPMENT_TIER_OPTIONS: { tier: EquipmentTierLevel; label: string }[] = [
  { tier: 1, label: '商店低階（白色）' },
  { tier: 2, label: '商店中階以下' },
  { tier: 3, label: '商店高階以下' },
  { tier: 4, label: '製作入門以下' },
  { tier: 5, label: '製作進階以下' },
  { tier: 6, label: '製作頂級以下' },
];

/** 批量販售的素材等級選項（雜貨店） */
export const MATERIAL_TIER_OPTIONS: { tier: number; label: string }[] = [
  { tier: 1, label: 'Tier 1（白色素材）' },
  { tier: 2, label: 'Tier 2 以下' },
  { tier: 3, label: 'Tier 3 以下' },
  { tier: 4, label: 'Tier 4 以下' },
  { tier: 5, label: 'Tier 5 以下' },
  { tier: 6, label: 'Tier 6 以下' },
  { tier: 7, label: 'Tier 7 以下（全部）' },
];

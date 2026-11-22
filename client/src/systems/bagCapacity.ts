/** 背包容量（`35-inventory-constraints.md` § 35.1）。不依賴任何 store，信箱等被 store 引用的模組可直接使用 */
import type { BagItem } from '../models/bagItem';
import type { EquipmentInstance, EquippedGear } from '../models/equipment';
import { isSigilItemId } from '../models/sigil';
import { isArenaTicketItemId } from './arenaBox';

/** § 35.1：背包基礎格數。腰帶可再擴充，見 `getBagMaxSlots()` */
export const BAG_BASE_SLOTS = 60;

/**
 * 背包實際格數 = 基礎 60 + 腰帶的 `bonusBagSlots`（§ 35.1）。
 * 腰帶最高 +20，因此上限為 80 格。
 */
export function getBagMaxSlots(gear: EquippedGear): number {
  const bonus = Object.values(gear).reduce(
    (sum, item) => sum + (item?.bonusBagSlots ?? 0),
    0,
  );
  return BAG_BASE_SLOTS + bonus;
}

/** 身上的裝備件數。裝備中的裝備一樣留在背包格上並佔格（§ 35.1） */
export function getEquippedCount(gear: EquippedGear): number {
  return Object.values(gear).filter(Boolean).length;
}

/**
 * 已用格數（§ 35.1）＝ 消耗品種類 + 背包裝備 + **身上裝備**，**不含印記**。
 *
 * 裝備中的裝備沒有離開背包，只是多一個「裝備中」標記，因此一樣佔格 ——
 * 穿脫只是同一格換個狀態，不再有佔格增減。
 *
 * 印記走獨立分頁、完全不進格數體系（§ 35.20），所以在這裡就濾掉 ——
 * 容量檢查的入口有十來個，讓每個入口各自記得排除印記必然會漏。
 */
export function getBagUsedSlots(
  bagItems: BagItem[],
  inventory: EquipmentInstance[],
  gear: EquippedGear,
): number {
  // 印記與競技場票券不佔格（§ 35.20、`55-arena.md` § 55.8）
  const countable = bagItems.filter(b => !isSigilItemId(b.itemId) && !isArenaTicketItemId(b.itemId)).length;
  return countable + inventory.length + getEquippedCount(gear);
}

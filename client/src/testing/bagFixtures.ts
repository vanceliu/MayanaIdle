import { getItemId } from '../models/items';
import { makeBagItem, type BagItem } from '../models/bagItem';

/**
 * 測試用的背包格產生器。
 *
 * 正式程式一律以 id 操作背包（`99-ai-constraints.md` § 99.1），但測試寫名稱好讀得多，
 * 所以名稱→id 的轉換集中在這裡；查不到就直接丟錯，避免測試靜默地少了一格道具。
 */
export function bagItem(name: string, amount: number): BagItem {
  const itemId = getItemId(name);
  if (itemId == null) throw new Error(`測試用道具不存在於 seed：${name}`);
  return makeBagItem(itemId, amount)!;
}

/** 依 id 產生（名稱會變、id 不會的情境用） */
export function bagItemById(itemId: number, amount: number): BagItem {
  const entry = makeBagItem(itemId, amount);
  if (!entry) throw new Error(`測試用道具 id 不存在於 seed：${itemId}`);
  return entry;
}

/**
 * 佔格用的假道具。容量測試只在乎「有幾格」，不在乎是什麼東西，
 * 因此用負數 id 明確與 seed 區隔（seed 的 id 一律為正）。
 */
export function fillerBagItems(count: number): BagItem[] {
  return Array.from({ length: count }, (_, i) => ({
    itemId: -(i + 1),
    name: `雜物${i}`,
    type: 'material' as const,
    amount: 1,
  }));
}

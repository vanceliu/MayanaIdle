import type { TalentSlot } from './talent';
import { buildBagLayout, type BagSlotMap } from './bagLayout';

/**
 * 背包「天賦」分頁的格子與順序（`35-inventory-constraints.md` § 35.21）。
 *
 * **只有未安裝的天賦格。** 條件與動作一律內建、不是物品，不進背包
 * （`51-auto-talent.md` § 51.5）。
 *
 * 整理是一次性落位（§ 35.8）；位置是清單順序，不是格子索引。
 */

export interface TalentBagCell {
  tier: 1 | 2 | 3 | 4;
  count: number;
}

/** 位置表的鍵。天賦格以階級為鍵 —— 同階的一模一樣，堆成一格 */
export function talentCellKey(cell: TalentBagCell): string {
  return `slot-${cell.tier}`;
}

/** 格子鍵 → 格子索引。形狀與 `BagSlotMap` 相同，兩邊共用同一組函式 */
export type TalentBagOrder = BagSlotMap;

export function talentBagOrderStorageKey(characterId: number): string {
  return `mayana_talent_bag_order_${characterId}`;
}

/** 可動用的格子清單，未套用位置表。同階天賦格堆成一格帶數量 */
export function buildTalentBagCells(spareSlots: TalentSlot[]): TalentBagCell[] {
  return ([1, 2, 3, 4] as const)
    .map(tier => ({ tier, count: spareSlots.filter(s => s.tier === tier).length }))
    .filter(x => x.count > 0);
}

/** 整理（§ 35.21.1）：**高階在前**。回傳位置表，由呼叫端持久化 */
export function sortTalentBag(cells: TalentBagCell[]): TalentBagOrder {
  const sorted = [...cells].sort((a, b) => b.tier - a.tier);
  const order: TalentBagOrder = {};
  sorted.forEach((c, i) => { order[talentCellKey(c)] = i; });
  return order;
}

/**
 * 網格欄數的預設值。真正的唯一出處是 `components/BagGrid.tsx` 的 `BAG_COLUMNS`
 * （§ 35.21.3），model 層不 import 元件，所以由呼叫端傳進來，這裡只是同值的預設。
 */
export const TALENT_BAG_COLUMNS = 5;

/** 帶著格子鍵的項目。`buildBagLayout`／`moveBagSlot` 吃的是 `{ id }` */
export interface TalentBagSlotItem {
  id: string;
  cell: TalentBagCell;
}

/**
 * 排出天賦分頁的版面，空格為 null。
 *
 * **與一般分頁同一套**（`models/bagLayout.ts`）：位置表是例外表，
 * 手動擺過的照位置放，其餘依取得順序流進剩下的空格。
 *
 * `minSlots` 只是**視覺下限**（列數對齊一般分頁，§ 35.21.3），不是容量 ——
 * 天賦分頁不佔背包格也沒有格數上限（§ 35.21.1）。
 */
export function buildTalentBagLayout(
  cells: TalentBagCell[],
  order: TalentBagOrder,
  minSlots: number,
  columns: number = TALENT_BAG_COLUMNS,
): (TalentBagSlotItem | null)[] {
  const items = cells.map(cell => ({ id: talentCellKey(cell), cell }));
  const needed = Math.ceil(items.length / columns) * columns;
  return buildBagLayout(items, order, Math.max(minSlots, needed));
}

export function loadTalentBagOrder(characterId: number): TalentBagOrder {
  try {
    const data = JSON.parse(localStorage.getItem(talentBagOrderStorageKey(characterId)) ?? 'null');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const next: TalentBagOrder = {};
    for (const [key, at] of Object.entries(data)) {
      if (typeof at === 'number' && Number.isInteger(at) && at >= 0) next[key] = at;
    }
    return next;
  } catch {
    return {};
  }
}

export function saveTalentBagOrder(characterId: number, order: TalentBagOrder): void {
  localStorage.setItem(talentBagOrderStorageKey(characterId), JSON.stringify(order));
}

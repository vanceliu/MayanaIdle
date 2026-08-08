/**
 * 背包版面（`35-inventory-constraints.md` § 35.1.3）。
 *
 * 採「例外表」模型：`slotMap` 只記錄**被手動拖放過**的項目，
 * 其餘項目依預設順序填進剩下的空格。
 *
 * 這樣做的好處是物品增減時不需要做任何狀態調和 ——
 * 新獲得的物品自動流進最前面的空格，用掉的物品自動讓出格子，
 * 手動擺放的位置則維持不動。
 *
 * **位置不持久化**：`slotMap` 只存在於當下 session，重新載入回到預設排列。
 */

import { SLOT_ORDER, type EquipSlot } from './equipment';

export interface BagSlotItem {
  id: string;
}

/** itemId → 格子索引。只收錄手動移動過的項目 */
export type BagSlotMap = Record<string, number>;

/**
 * 格子位置的 localStorage key（§ 35.17）。
 *
 * 刻意**不放進 `mayana_prefs_`** —— prefs 會跟著角色匯出，
 * 而匯入時裝備實例會重新配發 id（`characterTransfer.ts` 寫入 `id: undefined`），
 * 帶過去的 `equip-{id}` 必然全部對不上，只會留下一堆 stale entry。
 * 這是純本機的顯示偏好，不與角色綁定。
 */
export function bagLayoutStorageKey(characterId: number): string {
  return `mayana_bag_layout_${characterId}`;
}

/** 整理（§ 35.8.1）需要的欄位。裝備中的項目才有 `equippedSlot` */
export interface BagSortItem extends BagSlotItem {
  type: string;
  name: string;
  equippedSlot?: EquipSlot;
}

/**
 * 排出長度為 `maxSlots` 的版面，空格為 `null`。
 *
 * 手動位置若越界（例如卸下腰帶導致格數變少）或與其他手動位置相撞，
 * 該項目會退回自動填格，不會消失。
 */
export function buildBagLayout<T extends BagSlotItem>(
  items: T[],
  slotMap: BagSlotMap,
  maxSlots: number,
): (T | null)[] {
  const layout: (T | null)[] = Array.from({ length: Math.max(0, maxSlots) }, () => null);
  const placed = new Set<string>();

  for (const item of items) {
    const idx = slotMap[item.id];
    if (idx == null || idx < 0 || idx >= layout.length) continue;
    if (layout[idx]) continue;
    layout[idx] = item;
    placed.add(item.id);
  }

  let cursor = 0;
  for (const item of items) {
    if (placed.has(item.id)) continue;
    while (cursor < layout.length && layout[cursor]) cursor++;
    if (cursor >= layout.length) break;
    layout[cursor] = item;
  }

  return layout;
}

/**
 * 把 `fromIndex` 的項目拖到 `toIndex`。
 * 目標格有物品則**互換**，空格則單純移動。
 *
 * 回傳新的 `slotMap`；同時剔除已不存在於版面上的舊項目，避免 session 內無限累積。
 */
export function moveBagSlot<T extends BagSlotItem>(
  layout: (T | null)[],
  slotMap: BagSlotMap,
  fromIndex: number,
  toIndex: number,
): BagSlotMap {
  const from = layout[fromIndex];
  if (!from || fromIndex === toIndex) return slotMap;
  if (toIndex < 0 || toIndex >= layout.length) return slotMap;

  const alive = new Set(layout.filter((i): i is T => i != null).map(i => i.id));
  const next: BagSlotMap = {};
  for (const [id, idx] of Object.entries(slotMap)) {
    if (alive.has(id)) next[id] = idx;
  }

  next[from.id] = toIndex;
  const to = layout[toIndex];
  if (to) next[to.id] = fromIndex;

  return next;
}

// ------------------------------------------------------------------ 整理

/** § 35.8.1 的類型順位。裝備中的不看這張表，一律排在最前面 */
const TYPE_SORT_ORDER: Record<string, number> = {
  potion: 1,
  scroll: 2,
  material: 3,
  spellbook: 4,
  equipment: 5,
};

/**
 * 整理（§ 35.8）：把當下的排序結果整批寫成 `slotMap`。
 *
 * 這是**單向動作**，不保留整理前的快照 —— 整理結果就是 slotMap 全表，
 * 與拖曳共用同一條路徑，不引入第二套狀態。
 * 整理過後每個項目都有明確位置，新獲得的物品因此不會再插隊到分類中間。
 *
 * 超出 `maxSlots` 的項目不寫入，讓它們退回自動填格（與越界處理一致）。
 */
export function sortBagLayout(items: BagSortItem[], maxSlots: number): BagSlotMap {
  const slotRank = new Map<string, number>(SLOT_ORDER.map((slot, i) => [slot, i]));

  const sorted = [...items].sort((a, b) => {
    // § 35.8.1：裝備中是獨立的第一順位，不是裝備類內部的分層
    const equippedA = a.equippedSlot ? 0 : 1;
    const equippedB = b.equippedSlot ? 0 : 1;
    if (equippedA !== equippedB) return equippedA - equippedB;

    if (a.equippedSlot && b.equippedSlot) {
      const rankA = slotRank.get(a.equippedSlot) ?? 99;
      const rankB = slotRank.get(b.equippedSlot) ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      return a.name.localeCompare(b.name);
    }

    const typeA = TYPE_SORT_ORDER[a.type] ?? 99;
    const typeB = TYPE_SORT_ORDER[b.type] ?? 99;
    if (typeA !== typeB) return typeA - typeB;
    return a.name.localeCompare(b.name);
  });

  const next: BagSlotMap = {};
  const limit = Math.min(sorted.length, Math.max(0, maxSlots));
  for (let i = 0; i < limit; i++) {
    next[sorted[i].id] = i;
  }
  return next;
}

// ---------------------------------------------------------------- 拖出背包

/**
 * 拖出背包時交給落點的描述（`35-inventory-constraints.md` § 35.5.3）。
 *
 * `BagGridItem` 帶著 React 元素與裝備實例，不適合直接傳給落點處理；這裡只留必要欄位。
 *
 * 拖放走 Pointer Events（`47-mobile.md`），負載是**在記憶體裡傳的物件**，
 * 不再序列化 —— HTML5 拖放時代那組 MIME／`dataTransfer` 編解碼已隨機制一起移除。
 */
export interface BagDragPayload {
  kind: 'bag' | 'equipment';
  /** 顯示用名稱（確認視窗的文案）。實際定位一律用 `itemId`／`equipmentId` */
  name: string;
  /** kind === 'bag' 時的道具 id */
  itemId?: number;
  amount: number;
  equipmentId?: number;
  /** 這件裝備正穿在身上（§ 35.1）。裝備中不可丟棄，拖到地圖不觸發丟棄流程 */
  equipped?: boolean;
}

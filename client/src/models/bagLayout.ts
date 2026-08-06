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

export interface BagSlotItem {
  id: string;
}

/** itemId → 格子索引。只收錄手動移動過的項目 */
export type BagSlotMap = Record<string, number>;

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
}

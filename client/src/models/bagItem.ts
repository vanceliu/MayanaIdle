import { getItemById, type ItemCategory } from './items';

export type BagItemType = 'material' | 'potion' | 'scroll' | 'spellbook';

/**
 * 背包／個人倉庫／共用倉庫的一格。
 *
 * **`itemId` 是唯一的鍵**（`99-ai-constraints.md` § 99.1）：所有比對、合併、扣除一律用它。
 * `name` 與 `type` 是**由 id 反查 seed 產生的顯示快取**，不是獨立資料 ——
 * 一律經 `makeBagItem()` 產生，不可手寫。曾因為以名稱當鍵，
 * 道具改名等於玩家存量憑空消失，必須寫 Dexie upgrade 補救（v14／v15）。
 */
export interface BagItem {
  itemId: number;
  name: string;
  type: BagItemType;
  amount: number;
}

/** 道具分類 → 背包分頁。副本道具歸卷軸、其他歸素材（背包只有四種分頁） */
export function mapItemCategoryToBagType(category: ItemCategory): BagItemType {
  switch (category) {
    case 'dungeon':
      return 'scroll';
    case 'other':
      return 'material';
    default:
      return category;
  }
}

/**
 * 建立背包格。`name`／`type` 一律由 seed 反查，呼叫端不得自帶 ——
 * 自帶就等於在玩家資料裡固化了當下的名稱，改名後 UI 會顯示舊名。
 *
 * 回傳 `null` 表示 id 不在 `ITEM_DEFINITIONS` 裡（seed 移除過的道具），呼叫端須自行丟棄。
 */
export function makeBagItem(itemId: number, amount: number): BagItem | null {
  const def = getItemById(itemId);
  if (!def) return null;
  return { itemId, name: def.name, type: mapItemCategoryToBagType(def.category), amount };
}

/** 背包裡某道具的數量（沒有則 0） */
export function getBagItemAmount(bagItems: BagItem[], itemId: number): number {
  return bagItems.find(b => b.itemId === itemId)?.amount ?? 0;
}

export function hasBagItem(bagItems: BagItem[], itemId: number, amount = 1): boolean {
  return getBagItemAmount(bagItems, itemId) >= amount;
}

/**
 * 加入道具並合併同 id 的格子。**不檢查背包格數上限** ——
 * 上限判定需要裝備欄位（腰帶），由呼叫端在加入前用 `getBagUsedSlots()` 自行判斷。
 */
export function addBagItem(bagItems: BagItem[], itemId: number, amount: number): BagItem[] {
  const existing = bagItems.find(b => b.itemId === itemId);
  if (existing) {
    return bagItems.map(b => (b.itemId === itemId ? { ...b, amount: b.amount + amount } : b));
  }
  const entry = makeBagItem(itemId, amount);
  return entry ? [...bagItems, entry] : bagItems;
}

/** 扣除道具，歸零的格子一併移除 */
export function consumeBagItem(bagItems: BagItem[], itemId: number, amount = 1): BagItem[] {
  return bagItems
    .map(b => (b.itemId === itemId ? { ...b, amount: b.amount - amount } : b))
    .filter(b => b.amount > 0);
}

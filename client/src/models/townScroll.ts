export interface TownScrollInfo {
  /** 對應 `ITEM_DEFINITIONS` 的 id —— 背包比對一律用它，不用名稱 */
  itemId: number;
  name: string;
  townId: string;
  townName: string;
  price: number;
}

export const TOWN_SCROLL_CONFIG: Record<string, TownScrollInfo> = {
  'neutral-town': {
    itemId: 4,
    name: '薄暮村回城卷軸',
    townId: 'neutral-town',
    townName: '薄暮村',
    price: 500,
  },
  'elsarth-town': {
    itemId: 5,
    name: '艾爾薩斯回城卷軸',
    townId: 'elsarth-town',
    townName: '艾爾薩斯城鎮',
    price: 500,
  },
  'varden-town': {
    itemId: 6,
    name: '瓦爾登回城卷軸',
    townId: 'varden-town',
    townName: '瓦爾登城鎮',
    price: 500,
  },
  'greyridge-town': {
    itemId: 156,
    name: '灰脊回城卷軸',
    townId: 'greyridge-town',
    townName: '灰脊城鎮',
    price: 500,
  },
};

export const ALL_TOWN_SCROLLS = Object.values(TOWN_SCROLL_CONFIG);

export function getTownScrollByItemId(itemId: number): TownScrollInfo | undefined {
  return ALL_TOWN_SCROLLS.find(s => s.itemId === itemId);
}

export function findScrollInBag(bagItems: { itemId: number; amount: number }[]): TownScrollInfo | null {
  for (const scroll of ALL_TOWN_SCROLLS) {
    const item = bagItems.find(b => b.itemId === scroll.itemId);
    if (item && item.amount > 0) return scroll;
  }
  return null;
}

export function consumeTownScroll<T extends { itemId: number; amount: number }>(
  bagItems: T[],
  itemId: number
): T[] {
  return bagItems
    .map(b => b.itemId === itemId ? { ...b, amount: b.amount - 1 } : b)
    .filter(b => b.amount > 0);
}

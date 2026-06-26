export interface TownScrollInfo {
  name: string;
  townId: string;
  townName: string;
  price: number;
}

export const TOWN_SCROLL_CONFIG: Record<string, TownScrollInfo> = {
  'neutral-town': {
    name: '薄暮村回城卷軸',
    townId: 'neutral-town',
    townName: '薄暮村',
    price: 500,
  },
  'elsarth-town': {
    name: '艾爾薩斯回城卷軸',
    townId: 'elsarth-town',
    townName: '艾爾薩斯城鎮',
    price: 500,
  },
  'varden-town': {
    name: '瓦爾登回城卷軸',
    townId: 'varden-town',
    townName: '瓦爾登城鎮',
    price: 500,
  },
};

export const ALL_TOWN_SCROLLS = Object.values(TOWN_SCROLL_CONFIG);

export function findScrollInBag(bagItems: { name: string; amount: number }[]): TownScrollInfo | null {
  for (const scroll of ALL_TOWN_SCROLLS) {
    const item = bagItems.find(b => b.name === scroll.name);
    if (item && item.amount > 0) return scroll;
  }
  return null;
}

export function consumeTownScroll<T extends { name: string; amount: number }>(
  bagItems: T[],
  scrollName: string
): T[] {
  return bagItems
    .map(b => b.name === scrollName ? { ...b, amount: b.amount - 1 } : b)
    .filter(b => b.amount > 0);
}

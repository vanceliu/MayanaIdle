/**
 * 拍賣場（`docs/design/57-auction.md`）：上架、標價與搜尋的資料與純函式。
 * 判定在 server（`server/src/auction.ts`）；client 只顯示。
 */
import type { ClassName } from './character';
import type { EquipmentInstance, EquipSlot } from './equipment';
import type { AnyAffixType } from './affix';
import type { UniqueAffixType } from './uniqueAffix';
import type { MailItem } from './mailbox';
import { mapItemCategoryToBagType, type BagItemType } from './bagItem';
import { getItemById } from './items';

/** § 57.0：false 時 NPC、快捷列、Wiki 條目不出現，server 拒絕所有拍賣場操作 */
export const AUCTION_ENABLED = false;

export const AUCTION_CLOSED_MESSAGE = '拍賣場暫未開放';

/** § 57.2 */
export const AUCTION_LISTING_FEE = 5000;
/** § 57.2：每隻角色同時上架的筆數 */
export const AUCTION_MAX_LISTINGS = 20;
/** § 57.6 */
export const AUCTION_PAGE_SIZE = 30;

export const AUCTION_SOLD_OUT_MESSAGE = '已被其他玩家買走';

export type AuctionPrice =
  | { kind: 'gold'; gold: number }
  | { kind: 'item'; itemId: number; amount: number };

export interface AuctionListing {
  id: number;
  sellerCharacterId: number;
  sellerName: string;
  kind: 'equipment' | 'item';
  /** `equipment` 用：保管中的實例（`storageType = 'auction'`） */
  equipment?: EquipmentInstance;
  /** `item` 用 */
  itemId?: number;
  /** 裝備固定 1 */
  amount: number;
  price: AuctionPrice;
  createdAt: number;
}

export type AuctionKind = AuctionListing['kind'];
/** 搜尋的分類（§ 57.6）：`all`＝該類別全部；裝備為部位（戒指一律 `ring1`），道具為類型 */
export type AuctionCategory = 'all' | `slot:${Exclude<EquipSlot, 'ring2'>}` | `item:${BagItemType}`;

/** 分類是否屬於該類別：裝備只配部位、道具只配類型 */
export function isCategoryOfKind(category: AuctionCategory, kind: AuctionKind): boolean {
  return category === 'all' || category.startsWith(kind === 'equipment' ? 'slot:' : 'item:');
}
export type AuctionSort = 'newest' | 'price_asc' | 'price_desc';

export interface AuctionAffixFilter {
  type: AnyAffixType | UniqueAffixType;
  /** 不填＝有即可 */
  min?: number;
}

export interface AuctionQuery {
  /** 只列這個類別（§ 57.6） */
  kind: AuctionKind;
  category: AuctionCategory;
  /** 職業、階級、詞綴只用於裝備 */
  className?: ClassName;
  tiers?: number[];
  name?: string;
  affixes?: AuctionAffixFilter[];
  priceKind: 'all' | 'gold' | 'item';
  sort: AuctionSort;
  /** 0 起算 */
  page: number;
}

export const DEFAULT_AUCTION_QUERY: AuctionQuery = { kind: 'equipment', category: 'all', priceKind: 'all', sort: 'newest', page: 0 };

/** 上架的物品：裝備指定實例；道具依背包 → 個人倉庫 → 帳號倉庫扣（§ 57.2） */
export type AuctionListInput =
  | { kind: 'equipment'; equipmentId: number; price: AuctionPrice }
  | { kind: 'item'; itemId: number; amount: number; price: AuctionPrice };

/** 顯示名稱：裝備帶強化值 */
export function auctionListingName(listing: Pick<AuctionListing, 'kind' | 'equipment' | 'itemId'>): string {
  if (listing.kind === 'equipment') {
    const e = listing.equipment!;
    return e.enhancement > 0 ? `${e.name} +${e.enhancement}` : e.name;
  }
  return getItemById(listing.itemId!)?.name ?? '道具';
}

/** 上架時間：月/日 時:分 */
export function auctionListedAtText(createdAt: number): string {
  return new Date(createdAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function auctionPriceText(price: AuctionPrice): string {
  return price.kind === 'gold'
    ? `${price.gold.toLocaleString()} 金幣`
    : `${getItemById(price.itemId)?.name ?? '道具'} ×${price.amount}`;
}

function itemBagType(itemId: number): BagItemType | undefined {
  const def = getItemById(itemId);
  return def ? mapItemCategoryToBagType(def.category) : undefined;
}

function affixValue(e: EquipmentInstance, type: AuctionAffixFilter['type']): number | undefined {
  const own = e.affixes.find(a => a.type === type);
  if (own) return own.value;
  return e.uniqueAffix?.type === type ? e.uniqueAffix.value : undefined;
}

/** § 57.6 的篩選。`tierOf` 由呼叫端以模板查（裝備實例不帶階級） */
export function matchesAuctionQuery(
  listing: AuctionListing,
  query: AuctionQuery,
  tierOf: (templateId: number) => number | undefined,
): boolean {
  if (listing.kind !== query.kind) return false;
  const equipment = listing.kind === 'equipment' ? listing.equipment! : null;
  if (query.category !== 'all') {
    const [group, value] = query.category.split(':');
    // 戴過右戒位的戒指實例 slot 是 ring2，分類只有一個「戒指」
    const slot = equipment?.slot === 'ring2' ? 'ring1' : equipment?.slot;
    if (group === 'slot' && slot !== value) return false;
    if (group === 'item' && (equipment || itemBagType(listing.itemId!) !== value)) return false;
  }
  if (query.priceKind !== 'all' && listing.price.kind !== query.priceKind) return false;
  const affixes = query.affixes ?? [];
  if (equipment) {
    if (query.className && equipment.requiredClass?.length && !equipment.requiredClass.includes(query.className)) return false;
    if (query.tiers?.length && !query.tiers.includes(tierOf(equipment.templateId) ?? 0)) return false;
    for (const f of affixes) {
      const value = affixValue(equipment, f.type);
      if (value === undefined || (f.min !== undefined && value < f.min)) return false;
    }
  }
  const name = query.name?.trim().toLowerCase();
  if (name && !auctionListingName(listing).toLowerCase().includes(name)) return false;
  return true;
}

/** § 57.6：依價格排序時道具標價的排在金幣標價之後，依上架時間 */
export function compareAuctionListings(sort: AuctionSort) {
  return (a: AuctionListing, b: AuctionListing): number => {
    const newest = b.createdAt - a.createdAt || b.id - a.id;
    if (sort === 'newest') return newest;
    const aGold = a.price.kind === 'gold' ? a.price.gold : null;
    const bGold = b.price.kind === 'gold' ? b.price.gold : null;
    if (aGold === null || bGold === null) return aGold === bGold ? newest : (aGold === null ? 1 : -1);
    return (sort === 'price_asc' ? aGold - bGold : bGold - aGold) || newest;
  };
}

/** 上架物品寄出時的信件項目（成交給買家、下架退給賣家） */
export function listingMailItems(listing: AuctionListing): MailItem[] {
  return listing.kind === 'equipment'
    ? [{ type: 'equipment', equipmentId: listing.equipment!.id! }]
    : [{ type: 'item', itemId: listing.itemId!, amount: listing.amount }];
}

/** 成交時給賣家的貨款 */
export function priceMailItems(price: AuctionPrice): MailItem[] {
  return price.kind === 'gold'
    ? [{ type: 'gold', amount: price.gold }]
    : [{ type: 'item', itemId: price.itemId, amount: price.amount }];
}

function quantityText(listing: AuctionListing): string {
  return `${auctionListingName(listing)} ×${listing.amount}`;
}

/** § 57.5 信件標題 */
export const auctionMailTitle = {
  bought: (l: AuctionListing) => `拍賣場：購得 ${quantityText(l)}`,
  sold: (l: AuctionListing, buyerName: string) => `拍賣場：${quantityText(l)} 已售出（買家 ${buyerName}）`,
  cancelled: (l: AuctionListing) => `拍賣場：${quantityText(l)} 已下架`,
};

/** § 57.5 `sourceKey` */
export const auctionMailKey = {
  bought: (id: number) => `auction-bought-${id}`,
  sold: (id: number) => `auction-sold-${id}`,
  cancelled: (id: number) => `auction-cancel-${id}`,
};

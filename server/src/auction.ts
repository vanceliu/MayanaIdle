/**
 * 拍賣場（`docs/design/57-auction.md`）。
 * 上架中的清單整份放記憶體；每次變動先以單一交易落地（`AuctionStorage`），成功才改記憶體與角色狀態。
 */
import type { Session } from '../../client/src/stores/session';
import type { GameState } from '../../client/src/stores/gameStore';
import type { EquipmentInstance, EquipSlot } from '../../client/src/models/equipment';
import type { Mail } from '../../client/src/models/mailbox';
import type { BagItemType } from '../../client/src/models/bagItem';
import { getBagItemAmount, isPositiveCount } from '../../client/src/models/bagItem';
import { getItemById, isBoundItem } from '../../client/src/models/items';
import {
  AUCTION_LISTING_FEE, AUCTION_MAX_LISTINGS, AUCTION_PAGE_SIZE, AUCTION_SOLD_OUT_MESSAGE,
  auctionMailKey, auctionMailTitle, compareAuctionListings, listingMailItems,
  isCategoryOfKind, matchesAuctionQuery, priceMailItems,
  type AuctionAffixFilter, type AuctionCategory, type AuctionKind, type AuctionListInput, type AuctionListing,
  type AuctionPrice, type AuctionQuery,
} from '../../client/src/models/auction';
import type { ClassName } from '../../client/src/models/character';
import { CRAFT_SOURCE_ORDER, getCraftSources, type CraftSourceKind } from '../../client/src/systems/craftQuestSystem';
import { drawCraftMaterials } from '../../client/src/systems/crafting';
import { getTemplateById } from '../../client/src/systems/templateSync';
import type { AuctionSearchView } from '../../client/src/stores/auctionStore';
import type { AuctionStorage } from './db/auctionStorage';

export class AuctionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const EQUIP_SLOTS: readonly Exclude<EquipSlot, 'ring2'>[] = [
  'rightHand', 'leftHand', 'helmet', 'chest', 'shirt', 'cloak', 'belt', 'gloves', 'boots', 'necklace', 'ring1',
];
const BAG_TYPES: readonly BagItemType[] = ['material', 'potion', 'scroll', 'spellbook'];
const CLASS_NAMES: readonly ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];
const CATEGORIES: ReadonlySet<string> = new Set([
  'all', ...EQUIP_SLOTS.map(s => `slot:${s}`), ...BAG_TYPES.map(t => `item:${t}`),
]);
/** 一件裝備最多 4 條詞綴＋1 條 T7 獨有詞綴，選更多不可能有符合的 */
const MAX_AFFIX_FILTERS = 5;
const MAX_TEXT = 40;

/** 裝備在哪一處的 store 欄位 */
const EQUIPMENT_FIELD: Record<CraftSourceKind, 'inventory' | 'personalStoredEquipment' | 'storedEquipment'> = {
  bag: 'inventory', personal: 'personalStoredEquipment', shared: 'storedEquipment',
};

function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
}

function isTradableItem(itemId: unknown): itemId is number {
  return Number.isSafeInteger(itemId) && !!getItemById(itemId as number) && !isBoundItem(itemId as number);
}

/** client 送來的內容一律重新檢查（`97-selfhosted-server.md` § 97.2 參數驗證） */
function parsePrice(raw: unknown): AuctionPrice {
  const v = asRecord(raw);
  if (v.kind === 'gold' && isPositiveCount(v.gold)) return { kind: 'gold', gold: v.gold };
  if (v.kind === 'item' && isTradableItem(v.itemId) && isPositiveCount(v.amount)) {
    return { kind: 'item', itemId: v.itemId, amount: v.amount };
  }
  throw new AuctionError('bad_price', '標價不正確');
}

function parseListInput(raw: unknown): AuctionListInput {
  const v = asRecord(raw);
  const price = parsePrice(v.price);
  if (v.kind === 'equipment' && isPositiveCount(v.equipmentId)) return { kind: 'equipment', equipmentId: v.equipmentId, price };
  if (v.kind === 'item') {
    if (Number.isSafeInteger(v.itemId) && isBoundItem(v.itemId as number)) throw new AuctionError('bound', '綁定角色的道具不可上架');
    if (isTradableItem(v.itemId) && isPositiveCount(v.amount)) return { kind: 'item', itemId: v.itemId, amount: v.amount, price };
  }
  throw new AuctionError('bad_listing', '上架內容不正確');
}

function parseAffixes(raw: unknown): AuctionAffixFilter[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.slice(0, MAX_AFFIX_FILTERS).flatMap(entry => {
    const { type, min } = asRecord(entry);
    if (typeof type !== 'string' || !type || type.length > MAX_TEXT) return [];
    return [{ type: type as AuctionAffixFilter['type'], ...(Number.isFinite(min) ? { min: min as number } : {}) }];
  });
}

/** 分類不屬於該類別時改為 `all`；職業、階級、詞綴只在裝備保留 */
export function parseAuctionQuery(raw: unknown): AuctionQuery {
  const v = asRecord(raw);
  const kind: AuctionKind = v.kind === 'item' ? 'item' : 'equipment';
  const category = typeof v.category === 'string' && CATEGORIES.has(v.category) ? v.category as AuctionCategory : 'all';
  const tiers = Array.isArray(v.tiers) ? v.tiers.filter((t): t is number => Number.isInteger(t) && t >= 1 && t <= 7) : undefined;
  const affixes = parseAffixes(v.affixes);
  return {
    kind,
    category: isCategoryOfKind(category, kind) ? category : 'all',
    ...(kind === 'equipment' && CLASS_NAMES.includes(v.className as ClassName) ? { className: v.className as ClassName } : {}),
    ...(kind === 'equipment' && tiers?.length ? { tiers } : {}),
    ...(typeof v.name === 'string' && v.name.trim() ? { name: v.name.trim().slice(0, MAX_TEXT) } : {}),
    ...(kind === 'equipment' && affixes?.length ? { affixes } : {}),
    priceKind: v.priceKind === 'gold' || v.priceKind === 'item' ? v.priceKind : 'all',
    sort: v.sort === 'price_asc' || v.sort === 'price_desc' ? v.sort : 'newest',
    page: Number.isSafeInteger(v.page) && (v.page as number) > 0 ? v.page as number : 0,
  };
}

function characterOf(session: Session): { id: number; name: string; gold: number } {
  const ch = session.game.getState().character;
  if (!ch?.id) throw new AuctionError('no_character', '尚未進入世界');
  return { id: ch.id, name: ch.name, gold: ch.gold };
}

function findEquipment(state: GameState, equipmentId: number): { source: CraftSourceKind; item: EquipmentInstance } | null {
  const sources = getCraftSources(state);
  for (const source of CRAFT_SOURCE_ORDER) {
    const item = sources[source].equipment.find(e => e.id === equipmentId);
    if (item) return { source, item };
  }
  return null;
}

function heldAmount(state: GameState, itemId: number): number {
  const sources = getCraftSources(state);
  return CRAFT_SOURCE_ORDER.reduce((sum, source) => sum + getBagItemAmount(sources[source].materials, itemId), 0);
}

/** 依背包 → 個人倉庫 → 帳號倉庫扣（`06-equipment-acquire.md` § 6A.3） */
function drawItems(state: GameState, itemId: number, amount: number): Partial<GameState> {
  const drawn = drawCraftMaterials([{ itemId, amount }], getCraftSources(state));
  return { bagItems: drawn.bag, personalStoredMaterials: drawn.personal, storedMaterials: drawn.shared };
}

function mail(characterId: number, sourceKey: string, title: string, items: Mail['items'], now: number): Mail {
  return { characterId, sourceKey, title, items, createdAt: now, claimedAt: null };
}

export class AuctionManager {
  private readonly storage: AuctionStorage;
  private readonly listings = new Map<number, AuctionListing>();
  private lock: Promise<unknown> = Promise.resolve();

  constructor(storage: AuctionStorage) {
    this.storage = storage;
    for (const listing of storage.loadAll()) this.listings.set(listing.id, listing);
  }

  /** § 57.7：新到舊 */
  mine(characterId: number): AuctionListing[] {
    return [...this.listings.values()]
      .filter(l => l.sellerCharacterId === characterId)
      .sort(compareAuctionListings('newest'));
  }

  /** § 57.6：server 篩選與排序，一次一頁 */
  search(query: AuctionQuery): AuctionSearchView {
    const tierOf = (templateId: number) => getTemplateById(templateId)?.tier;
    const matched = [...this.listings.values()]
      .filter(l => matchesAuctionQuery(l, query, tierOf))
      .sort(compareAuctionListings(query.sort));
    const start = query.page * AUCTION_PAGE_SIZE;
    return { query, listings: matched.slice(start, start + AUCTION_PAGE_SIZE), total: matched.length };
  }

  /** § 57.2 上架 */
  list(session: Session, raw: unknown, now: number): Promise<AuctionListing> {
    const input = parseListInput(raw);
    return this.exclusive(async () => {
      const seller = characterOf(session);
      if (seller.gold < AUCTION_LISTING_FEE) throw new AuctionError('gold', `金幣不足（上架費 ${AUCTION_LISTING_FEE.toLocaleString()}）`);
      if (this.mine(seller.id).length >= AUCTION_MAX_LISTINGS) {
        throw new AuctionError('limit', `每隻角色最多同時上架 ${AUCTION_MAX_LISTINGS} 筆`);
      }
      const state = session.game.getState();
      const base = { sellerCharacterId: seller.id, sellerName: seller.name, price: input.price, createdAt: now };
      let draft: Omit<AuctionListing, 'id'>;
      let patch: Partial<GameState>;
      if (input.kind === 'equipment') {
        const found = findEquipment(state, input.equipmentId);
        if (!found) throw new AuctionError('missing', '找不到這件裝備');
        if (found.item.isStarterGear) throw new AuctionError('starter', `${found.item.name} 是新手裝，不可上架`);
        const field = EQUIPMENT_FIELD[found.source];
        const equipment = { ...found.item, ownerId: seller.id, equipped: false, inStorage: true, storageType: 'auction' as const };
        draft = { ...base, kind: 'equipment', equipment, amount: 1 };
        patch = { [field]: state[field].filter(e => e.id !== input.equipmentId) } as Partial<GameState>;
      } else {
        if (heldAmount(state, input.itemId) < input.amount) throw new AuctionError('amount', '數量不足');
        draft = { ...base, kind: 'item', itemId: input.itemId, amount: input.amount };
        patch = drawItems(state, input.itemId, input.amount);
      }
      const id = await this.storage.openListing(draft);
      const listing: AuctionListing = { ...draft, id };
      this.listings.set(id, listing);
      const latest = session.game.getState().character!;
      session.game.setState({ ...patch, character: { ...latest, gold: latest.gold - AUCTION_LISTING_FEE } });
      return listing;
    });
  }

  /** § 57.3 下架：物品寄回賣家信箱，上架費不退 */
  cancel(session: Session, listingId: unknown, now: number): Promise<AuctionListing> {
    return this.exclusive(async () => {
      const seller = characterOf(session);
      const listing = this.listings.get(Number(listingId));
      if (!listing || listing.sellerCharacterId !== seller.id) throw new AuctionError('missing', '找不到這筆上架');
      await this.storage.closeListing(listing.id, this.mailedEquipment(listing, seller.id), [
        mail(seller.id, auctionMailKey.cancelled(listing.id), auctionMailTitle.cancelled(listing), listingMailItems(listing), now),
      ]);
      this.listings.delete(listing.id);
      return listing;
    });
  }

  /** § 57.4 購買：一口價，先到者成交；雙方的東西都寄到信箱 */
  buy(session: Session, listingId: unknown, now: number): Promise<AuctionListing> {
    return this.exclusive(async () => {
      const buyer = characterOf(session);
      const listing = this.listings.get(Number(listingId));
      if (!listing) throw new AuctionError('sold_out', AUCTION_SOLD_OUT_MESSAGE);
      if (listing.sellerCharacterId === buyer.id) throw new AuctionError('self', '不能購買自己上架的物品');
      const state = session.game.getState();
      const { price } = listing;
      let patch: Partial<GameState>;
      if (price.kind === 'gold') {
        if (buyer.gold < price.gold) throw new AuctionError('gold', '金幣不足');
        patch = { character: { ...state.character!, gold: state.character!.gold - price.gold } };
      } else {
        if (heldAmount(state, price.itemId) < price.amount) {
          throw new AuctionError('amount', `${getItemById(price.itemId)?.name ?? '道具'} 不足`);
        }
        patch = drawItems(state, price.itemId, price.amount);
      }
      await this.storage.closeListing(listing.id, this.mailedEquipment(listing, buyer.id), [
        mail(buyer.id, auctionMailKey.bought(listing.id), auctionMailTitle.bought(listing), listingMailItems(listing), now),
        mail(listing.sellerCharacterId, auctionMailKey.sold(listing.id), auctionMailTitle.sold(listing, buyer.name), priceMailItems(price), now),
      ]);
      this.listings.delete(listing.id);
      session.game.setState(patch);
      return listing;
    });
  }

  /** § 57.8 角色刪除：上架中的隨角色消失 */
  async dropSeller(characterId: number): Promise<void> {
    await this.exclusive(async () => {
      await this.storage.deleteBySeller(characterId);
      for (const [id, l] of this.listings) if (l.sellerCharacterId === characterId) this.listings.delete(id);
    });
  }

  private mailedEquipment(listing: AuctionListing, recipientId: number): EquipmentInstance | null {
    return listing.equipment ? { ...listing.equipment, ownerId: recipientId, storageType: 'mail' } : null;
  }

  /** 檢查與寫入之間不讓別的操作插進來（兩人同時買同一筆） */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.lock.then(fn, fn);
    this.lock = next.then(() => {}, () => {});
    return next;
  }
}

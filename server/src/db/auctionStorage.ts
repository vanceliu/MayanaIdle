/**
 * 拍賣場的持久層（`57-auction.md` § 57.9）。
 * `AuctionManager` 開機時整份載入記憶體，之後每次變動以單一交易寫入。
 */
import type { DatabaseSync } from 'node:sqlite';
import type { AuctionListing, AuctionPrice } from '../../../client/src/models/auction';
import type { EquipmentInstance } from '../../../client/src/models/equipment';
import type { Mail } from '../../../client/src/models/mailbox';
import { writeGateOf, type WriteGate } from './writeGate';

export interface AuctionStorage {
  loadAll(): AuctionListing[];
  /** 寫 listing；裝備以整筆實例覆寫（保管中）。回傳 listing id */
  openListing(listing: Omit<AuctionListing, 'id'>): Promise<number>;
  /** 刪 listing、裝備以整筆實例覆寫（信件中）、寄信，整批成立或整批不成立 */
  closeListing(listingId: number, equipment: EquipmentInstance | null, mails: Mail[]): Promise<void>;
  /** 角色刪除（§ 57.8）：保管中的裝備由 `deleteCharacterEquipment` 一併刪除 */
  deleteBySeller(characterId: number): Promise<void>;
}

function priceColumns(price: AuctionPrice): [string, number | null, number | null, number | null] {
  return price.kind === 'gold'
    ? ['gold', price.gold, null, null]
    : ['item', null, price.itemId, price.amount];
}

export class SqliteAuctionStorage implements AuctionStorage {
  private readonly db: DatabaseSync;
  /** 寫入一律走關卡（`writeGate.ts`） */
  private readonly gate: WriteGate;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.gate = writeGateOf(db);
  }

  loadAll(): AuctionListing[] {
    const equipment = new Map<number, EquipmentInstance>();
    const equipmentRows = this.db.prepare(
      "SELECT id, data FROM equipment_instances WHERE json_extract(data, '$.storageType') = 'auction'",
    ).all() as { id: number; data: string }[];
    for (const r of equipmentRows) equipment.set(r.id, { ...(JSON.parse(r.data) as EquipmentInstance), id: r.id });

    const rows = this.db.prepare('SELECT * FROM auction_listings ORDER BY id').all() as Record<string, unknown>[];
    const listings: AuctionListing[] = [];
    for (const r of rows) {
      const kind = r.kind as AuctionListing['kind'];
      const item = kind === 'equipment' ? equipment.get(r.equipment_instance_id as number) : undefined;
      if (kind === 'equipment' && !item) continue;
      listings.push({
        id: r.id as number,
        sellerCharacterId: r.seller_character_id as number,
        sellerName: r.seller_name as string,
        kind,
        ...(item ? { equipment: item } : { itemId: r.item_id as number }),
        amount: r.amount as number,
        price: r.price_kind === 'gold'
          ? { kind: 'gold', gold: r.price_gold as number }
          : { kind: 'item', itemId: r.price_item_id as number, amount: r.price_amount as number },
        createdAt: r.created_at as number,
      });
    }
    return listings;
  }

  openListing(listing: Omit<AuctionListing, 'id'>): Promise<number> {
    return this.gate.atomic(() => {
      if (listing.equipment) this.writeEquipment(listing.equipment);
      const r = this.db.prepare(`INSERT INTO auction_listings
        (seller_character_id, seller_name, kind, equipment_instance_id, item_id, amount, price_kind, price_gold, price_item_id, price_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          listing.sellerCharacterId, listing.sellerName, listing.kind,
          listing.equipment?.id ?? null, listing.itemId ?? null, listing.amount,
          ...priceColumns(listing.price), listing.createdAt,
        );
      return Number(r.lastInsertRowid);
    });
  }

  async closeListing(listingId: number, equipment: EquipmentInstance | null, mails: Mail[]): Promise<void> {
    await this.gate.atomic(() => {
      this.db.prepare('DELETE FROM auction_listings WHERE id = ?').run(listingId);
      if (equipment) this.writeEquipment(equipment);
      const insert = this.db.prepare('INSERT INTO mailbox (character_id, source_key, data) VALUES (?, ?, ?)');
      for (const mail of mails) {
        const { id: _id, ...data } = mail;
        insert.run(mail.characterId, mail.sourceKey, JSON.stringify(data));
      }
    });
  }

  async deleteBySeller(characterId: number): Promise<void> {
    await this.gate.write(() => this.db.prepare('DELETE FROM auction_listings WHERE seller_character_id = ?').run(characterId));
  }

  private writeEquipment(item: EquipmentInstance): void {
    const { id, ...data } = item;
    this.db.prepare('UPDATE equipment_instances SET owner_id = ?, data = ? WHERE id = ?').run(item.ownerId, JSON.stringify(data), id!);
  }
}

/** 不落地的實作：`World` 未指定持久層時使用（測試） */
export class MemoryAuctionStorage implements AuctionStorage {
  private nextId = 1;
  loadAll(): AuctionListing[] { return []; }
  async openListing(): Promise<number> { return this.nextId++; }
  async closeListing(): Promise<void> {}
  async deleteBySeller(): Promise<void> {}
}

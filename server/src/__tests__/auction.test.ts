import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { SqliteAuctionStorage } from '../db/auctionStorage';
import { AuctionManager } from '../auction';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, syncWorld, type PlayerSession } from '../playerSession';
import { World } from '../world';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer } from '../ws';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';
import { addBagItem, getBagItemAmount } from '../../../client/src/models/bagItem';
import { loadTemplateCache } from '../../../client/src/systems/templateSync';
import { EQUIPMENT_SEEDS } from '../../../client/src/db/seed/equipmentSeeds';
import { ITEM_DEFINITIONS } from '../../../client/src/db/seed';
import type { EquipmentInstance } from '../../../client/src/models/equipment';
import {
  AUCTION_CLOSED_MESSAGE, AUCTION_ENABLED, AUCTION_LISTING_FEE, AUCTION_MAX_LISTINGS, AUCTION_PAGE_SIZE, AUCTION_SOLD_OUT_MESSAGE, DEFAULT_AUCTION_QUERY,
  auctionMailKey, type AuctionQuery,
} from '../../../client/src/models/auction';

/** 拍賣場（`57-auction.md`） */
const ATTRS = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never;
const SILVER_ORE = 11;
const SILVER_ESSENCE = 12;
const BOUND_ITEM = ITEM_DEFINITIONS.find(i => i.bound)!.id;
const T5 = EQUIPMENT_SEEDS.find(t => t.tier === 5 && t.acquireType !== 'starter' && t.type !== 'armor')!;
const T4 = EQUIPMENT_SEEDS.find(t => t.tier === 4 && t.acquireType !== 'starter' && t.type !== 'armor')!;
const GOLD = 100_000;

describe('拍賣場', () => {
  let world: World;
  let repo: SqliteRepository;
  let db: DatabaseSync;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    await loadTemplateCache(repo);
    world = new World(undefined, new SqliteAuctionStorage(db));
  });

  async function enter(userId: number, name: string, region = 'neutral-town'): Promise<PlayerSession> {
    const s = createPlayerSession(repo, '127.0.0.1', () => {});
    s.world = world;
    s.userId = userId;
    s.game.setState({ userId });
    world.sessions.add(s);
    await s.game.getState().createCharacter(name, 'knight', ATTRS);
    const ch = s.game.getState().character!;
    s.game.setState({ character: { ...ch, level: 10, gold: GOLD, currentRegion: region, currentArea: region } });
    await s.game.getState().saveState();
    await s.mailbox.getState().load(ch.id!);
    await syncWorld(s);
    world.onCharacterEnter(s);
    return s;
  }

  const idOf = (s: PlayerSession) => s.game.getState().character!.id!;
  const goldOf = (s: PlayerSession) => s.game.getState().character!.gold;
  const act = (s: PlayerSession, name: string, ...args: unknown[]) => world.handleAuctionAction(s, name, args);
  const gold = (amount: number) => ({ kind: 'gold', gold: amount });

  async function giveEquipment(
    s: PlayerSession,
    extra: Partial<EquipmentInstance> = {},
    field: 'inventory' | 'personalStoredEquipment' | 'storedEquipment' = 'inventory',
  ): Promise<number> {
    const tpl = extra.templateId === T4.id ? T4 : T5;
    const base = {
      templateId: tpl.id!, name: tpl.name, type: tpl.type, slot: tpl.slot,
      ownerId: field === 'storedEquipment' ? s.userId : idOf(s),
      quality: 12, enhancement: 3, affixes: [], equipped: false, inStorage: field !== 'inventory',
      ...(field === 'personalStoredEquipment' ? { storageType: 'personal' } : {}),
      ...(field === 'storedEquipment' ? { storageType: 'shared' } : {}),
      ...extra,
    };
    const id = await repo.addEquipment(base as never);
    s.game.setState({ [field]: [...s.game.getState()[field], { ...base, id } as never] });
    return id;
  }

  function giveItem(s: PlayerSession, itemId: number, amount: number, field: 'bagItems' | 'personalStoredMaterials' | 'storedMaterials' = 'bagItems') {
    s.game.setState({ [field]: addBagItem(s.game.getState()[field], itemId, amount) });
  }

  function storedEquipment(id: number): { owner_id: number; data: Record<string, unknown> } {
    const row = db.prepare('SELECT owner_id, data FROM equipment_instances WHERE id = ?').get(id) as { owner_id: number; data: string };
    return { owner_id: row.owner_id, data: JSON.parse(row.data) };
  }

  describe('上架（§ 57.2）', () => {
    it('裝備：扣上架費、離開背包、由拍賣場保管並落地', async () => {
      const a = await enter(1, 'Alice');
      const equipId = await giveEquipment(a);

      const r = await act(a, 'list', { kind: 'equipment', equipmentId: equipId, price: gold(3000) });

      expect(r.ok).toBe(true);
      expect(goldOf(a)).toBe(GOLD - AUCTION_LISTING_FEE);
      expect(a.game.getState().inventory.some(i => i.id === equipId)).toBe(false);
      expect(storedEquipment(equipId)).toMatchObject({ owner_id: idOf(a), data: { storageType: 'auction', inStorage: true, enhancement: 3 } });
      expect(world.auction.mine(idOf(a))).toHaveLength(1);
      expect(db.prepare('SELECT COUNT(*) AS n FROM auction_listings').get()).toEqual({ n: 1 });
      // 背包與金幣立刻落地
      expect((await repo.getCharacter(idOf(a)))!.gold).toBe(GOLD - AUCTION_LISTING_FEE);
    });

    it('可上架個人倉庫與帳號倉庫的裝備', async () => {
      const a = await enter(1, 'Alice');
      const personal = await giveEquipment(a, {}, 'personalStoredEquipment');
      const shared = await giveEquipment(a, {}, 'storedEquipment');

      expect((await act(a, 'list', { kind: 'equipment', equipmentId: personal, price: gold(1) })).ok).toBe(true);
      expect((await act(a, 'list', { kind: 'equipment', equipmentId: shared, price: gold(1) })).ok).toBe(true);

      expect(a.game.getState().personalStoredEquipment).toEqual([]);
      expect(a.game.getState().storedEquipment).toEqual([]);
      expect(storedEquipment(shared).owner_id).toBe(idOf(a));
    });

    it('道具依背包 → 個人倉庫 → 帳號倉庫扣', async () => {
      const a = await enter(1, 'Alice');
      giveItem(a, SILVER_ORE, 2);
      giveItem(a, SILVER_ORE, 2, 'personalStoredMaterials');
      giveItem(a, SILVER_ORE, 5, 'storedMaterials');

      const r = await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 6, price: gold(500) });

      expect(r.ok).toBe(true);
      const s = a.game.getState();
      expect(getBagItemAmount(s.bagItems, SILVER_ORE)).toBe(0);
      expect(getBagItemAmount(s.personalStoredMaterials, SILVER_ORE)).toBe(0);
      expect(getBagItemAmount(s.storedMaterials, SILVER_ORE)).toBe(3);
      expect(world.auction.mine(idOf(a))[0]).toMatchObject({ kind: 'item', itemId: SILVER_ORE, amount: 6 });
    });

    it('數量不足、上架費不足、新手裝、綁定道具都擋下，且不扣費', async () => {
      const a = await enter(1, 'Alice');
      giveItem(a, SILVER_ORE, 1);
      giveItem(a, BOUND_ITEM, 1);
      const starter = await giveEquipment(a, { isStarterGear: true });

      expect((await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 2, price: gold(1) })).message).toBe('數量不足');
      expect((await act(a, 'list', { kind: 'equipment', equipmentId: starter, price: gold(1) })).ok).toBe(false);
      expect((await act(a, 'list', { kind: 'item', itemId: BOUND_ITEM, amount: 1, price: gold(1) })).message).toBe('綁定角色的道具不可上架');
      expect((await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: { kind: 'item', itemId: BOUND_ITEM, amount: 1 } })).ok).toBe(false);
      expect(goldOf(a)).toBe(GOLD);

      a.game.setState({ character: { ...a.game.getState().character!, gold: AUCTION_LISTING_FEE - 1 } });
      expect((await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: gold(1) })).ok).toBe(false);
      expect(world.auction.mine(idOf(a))).toEqual([]);
    });

    it(`每隻角色同時最多 ${AUCTION_MAX_LISTINGS} 筆；下架後釋出額度`, async () => {
      const a = await enter(1, 'Alice');
      a.game.setState({ character: { ...a.game.getState().character!, gold: AUCTION_LISTING_FEE * (AUCTION_MAX_LISTINGS + 2) } });
      giveItem(a, SILVER_ORE, AUCTION_MAX_LISTINGS + 1);
      for (let i = 0; i < AUCTION_MAX_LISTINGS; i++) {
        expect((await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: gold(1) })).ok).toBe(true);
      }
      const over = await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: gold(1) });
      expect(over).toEqual({ ok: false, message: `每隻角色最多同時上架 ${AUCTION_MAX_LISTINGS} 筆` });

      await act(a, 'cancel', world.auction.mine(idOf(a))[0].id);
      expect((await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: gold(1) })).ok).toBe(true);
    });

    it('不在城鎮不能操作', async () => {
      const a = await enter(1, 'Alice', 'dawn-plains');
      giveItem(a, SILVER_ORE, 1);
      expect((await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: gold(1) })).ok).toBe(false);
      expect((await act(a, 'open')).ok).toBe(false);
    });
  });

  describe('下架（§ 57.3）', () => {
    it('物品寄回賣家信箱，上架費不退；領取後回到背包', async () => {
      const a = await enter(1, 'Alice');
      const equipId = await giveEquipment(a);
      await act(a, 'list', { kind: 'equipment', equipmentId: equipId, price: gold(1) });
      const listingId = world.auction.mine(idOf(a))[0].id;

      expect((await act(a, 'cancel', listingId)).ok).toBe(true);

      expect(goldOf(a)).toBe(GOLD - AUCTION_LISTING_FEE);
      expect(world.auction.mine(idOf(a))).toEqual([]);
      expect(storedEquipment(equipId).data).toMatchObject({ storageType: 'mail' });
      const [mail] = a.mailbox.getState().mails;
      expect(mail).toMatchObject({ sourceKey: auctionMailKey.cancelled(listingId), items: [{ type: 'equipment', equipmentId: equipId }] });

      expect(await a.mailbox.getState().claim(mail.id!)).toBe(true);
      expect(a.game.getState().inventory.find(i => i.id === equipId)).toMatchObject({ enhancement: 3, quality: 12 });
    });

    it('不能下架別人的', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      giveItem(a, SILVER_ORE, 1);
      await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: gold(1) });
      expect((await act(b, 'cancel', world.auction.mine(idOf(a))[0].id)).message).toBe('找不到這筆上架');
    });
  });

  describe('購買（§ 57.4、§ 57.5）', () => {
    it('金幣標價：買家扣金幣；雙方各收一封信，賣家在線立即更新信箱', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      const equipId = await giveEquipment(a);
      await act(a, 'list', { kind: 'equipment', equipmentId: equipId, price: gold(3000) });
      const listingId = world.auction.mine(idOf(a))[0].id;

      expect(await act(b, 'buy', listingId)).toEqual({ ok: true, message: '購買成功，物品已寄到信箱' });

      expect(goldOf(b)).toBe(GOLD - 3000);
      expect(goldOf(a)).toBe(GOLD - AUCTION_LISTING_FEE);
      expect(storedEquipment(equipId)).toMatchObject({ owner_id: idOf(b), data: { storageType: 'mail' } });
      expect(b.mailbox.getState().mails[0]).toMatchObject({ sourceKey: auctionMailKey.bought(listingId) });
      expect(a.mailbox.getState().unread).toBe(1);
      expect(a.mailbox.getState().mails[0]).toMatchObject({ sourceKey: auctionMailKey.sold(listingId), items: [{ type: 'gold', amount: 3000 }] });
      expect(a.mailbox.getState().mails[0].title).toContain('Bob');

      await a.mailbox.getState().claim(a.mailbox.getState().mails[0].id!);
      expect(goldOf(a)).toBe(GOLD - AUCTION_LISTING_FEE + 3000);
      await b.mailbox.getState().claim(b.mailbox.getState().mails[0].id!);
      expect(b.game.getState().inventory.some(i => i.id === equipId)).toBe(true);
    });

    it('道具標價：從買家背包 → 個人倉庫 → 帳號倉庫扣；賣家離線也收得到', async () => {
      const a = await enter(1, 'Alice');
      giveItem(a, SILVER_ORE, 4);
      await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 4, price: { kind: 'item', itemId: SILVER_ESSENCE, amount: 3 } });
      const listingId = world.auction.mine(idOf(a))[0].id;
      const sellerId = idOf(a);
      world.onCharacterLeave(a);
      world.sessions.delete(a);

      const b = await enter(2, 'Bob');
      giveItem(b, SILVER_ESSENCE, 1);
      giveItem(b, SILVER_ESSENCE, 1, 'personalStoredMaterials');
      giveItem(b, SILVER_ESSENCE, 5, 'storedMaterials');
      expect((await act(b, 'buy', listingId)).ok).toBe(true);

      const s = b.game.getState();
      expect(getBagItemAmount(s.bagItems, SILVER_ESSENCE)).toBe(0);
      expect(getBagItemAmount(s.personalStoredMaterials, SILVER_ESSENCE)).toBe(0);
      expect(getBagItemAmount(s.storedMaterials, SILVER_ESSENCE)).toBe(4);
      const sellerMail = (await repo.listMail(sellerId)).find(m => m.sourceKey === auctionMailKey.sold(listingId));
      expect(sellerMail!.items).toEqual([{ type: 'item', itemId: SILVER_ESSENCE, amount: 3 }]);
      expect(b.mailbox.getState().mails[0].items).toEqual([{ type: 'item', itemId: SILVER_ORE, amount: 4 }]);
    });

    it('兩人同時購買：先到者成交，後到者提示已被買走', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      const c = await enter(3, 'Carol');
      giveItem(a, SILVER_ORE, 1);
      await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: gold(100) });
      const listingId = world.auction.mine(idOf(a))[0].id;

      const [rb, rc] = await Promise.all([act(b, 'buy', listingId), act(c, 'buy', listingId)]);

      expect(rb.ok).toBe(true);
      expect(rc).toEqual({ ok: false, message: AUCTION_SOLD_OUT_MESSAGE });
      expect(goldOf(c)).toBe(GOLD);
      expect((await repo.listMail(idOf(a))).filter(m => m.sourceKey.startsWith('auction-sold'))).toHaveLength(1);
    });

    it('不能買自己的；金幣或道具不足擋下且不成交', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      giveItem(a, SILVER_ORE, 2);
      await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: gold(GOLD * 2) });
      await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: { kind: 'item', itemId: SILVER_ESSENCE, amount: 1 } });
      const [byItem, byGold] = world.auction.mine(idOf(a));

      expect((await act(a, 'buy', byGold.id)).message).toBe('不能購買自己上架的物品');
      expect((await act(b, 'buy', byGold.id)).message).toBe('金幣不足');
      expect((await act(b, 'buy', byItem.id)).ok).toBe(false);
      expect(world.auction.mine(idOf(a))).toHaveLength(2);
    });
  });

  describe('搜尋（§ 57.6）', () => {
    const search = async (s: PlayerSession, query: Partial<AuctionQuery>) => {
      await act(s, 'search', { ...DEFAULT_AUCTION_QUERY, ...query });
      return s.auction.getState().results!;
    };

    it('詞綴多選全部都要有，可填最低值；選了詞綴只列裝備', async () => {
      const a = await enter(1, 'Alice');
      const both = await giveEquipment(a, { affixes: [{ type: 'attack_power', tier: 5, value: 12 }, { type: 'crit_rate', tier: 5, value: 4 }] as never });
      const one = await giveEquipment(a, { affixes: [{ type: 'attack_power', tier: 5, value: 20 }] as never });
      giveItem(a, SILVER_ORE, 1);
      for (const id of [both, one]) await act(a, 'list', { kind: 'equipment', equipmentId: id, price: gold(1) });
      await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: gold(1) });
      await act(a, 'open');

      const ids = (r: { listings: { equipment?: EquipmentInstance }[] }) => r.listings.map(l => l.equipment?.id);
      expect(ids(await search(a, { affixes: [{ type: 'attack_power' }, { type: 'crit_rate' }] }))).toEqual([both]);
      expect(ids(await search(a, { affixes: [{ type: 'attack_power', min: 15 }] }))).toEqual([one]);
      expect((await search(a, { affixes: [{ type: 'attack_power' }] })).total).toBe(2);
    });

    it('分類、階級、名稱篩選', async () => {
      const a = await enter(1, 'Alice');
      const t5 = await giveEquipment(a);
      const t4 = await giveEquipment(a, { templateId: T4.id! });
      giveItem(a, SILVER_ORE, 1);
      for (const id of [t5, t4]) await act(a, 'list', { kind: 'equipment', equipmentId: id, price: gold(1) });
      await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: gold(1) });
      await act(a, 'open');

      expect((await search(a, { kind: 'item', category: 'item:material' })).listings.map(l => l.itemId)).toEqual([SILVER_ORE]);
      expect((await search(a, { tiers: [4] })).listings.map(l => l.equipment?.id)).toEqual([t4]);
      expect((await search(a, { name: T5.name.slice(0, 2).toLowerCase() })).listings.some(l => l.equipment?.id === t5)).toBe(true);
    });

    it('裝備／道具分開列；分類不屬於該類別改為全部，道具不套職業、階級、詞綴', async () => {
      const a = await enter(1, 'Alice');
      const t5 = await giveEquipment(a);
      giveItem(a, SILVER_ORE, 1);
      await act(a, 'list', { kind: 'equipment', equipmentId: t5, price: gold(1) });
      await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: gold(1) });
      await act(a, 'open');

      expect((await search(a, {})).listings.map(l => l.equipment?.id)).toEqual([t5]);
      expect((await search(a, { kind: 'item' })).listings.map(l => l.itemId)).toEqual([SILVER_ORE]);
      expect((await search(a, { kind: 'equipment', category: 'item:material' })).listings.map(l => l.equipment?.id)).toEqual([t5]);
      expect((await search(a, { kind: 'item', tiers: [4], affixes: [{ type: 'attack_power' }] })).listings.map(l => l.itemId)).toEqual([SILVER_ORE]);
    });

    it(`依價格排序時道具標價排在後面；一頁 ${AUCTION_PAGE_SIZE} 筆`, async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      for (const s of [a, b]) giveItem(s, SILVER_ORE, AUCTION_MAX_LISTINGS);
      for (let i = 0; i < AUCTION_MAX_LISTINGS; i++) {
        await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: gold(100 + i) });
        await act(b, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 1, price: i === 0 ? { kind: 'item', itemId: SILVER_ESSENCE, amount: 1 } : gold(1 + i) });
      }
      await act(a, 'open');

      const first = await search(a, { kind: 'item', sort: 'price_asc' });
      expect(first.total).toBe(AUCTION_MAX_LISTINGS * 2);
      expect(first.listings).toHaveLength(AUCTION_PAGE_SIZE);
      expect(first.listings[0].price).toEqual({ kind: 'gold', gold: 2 });
      const last = await search(a, { kind: 'item', sort: 'price_asc', page: 1 });
      expect(last.listings).toHaveLength(AUCTION_MAX_LISTINGS * 2 - AUCTION_PAGE_SIZE);
      expect(last.listings.at(-1)!.price.kind).toBe('item');
    });
  });

  it('重啟後清單由 SQLite 載回', async () => {
    const a = await enter(1, 'Alice');
    const equipId = await giveEquipment(a);
    giveItem(a, SILVER_ORE, 3);
    await act(a, 'list', { kind: 'equipment', equipmentId: equipId, price: gold(9) });
    await act(a, 'list', { kind: 'item', itemId: SILVER_ORE, amount: 3, price: { kind: 'item', itemId: SILVER_ESSENCE, amount: 2 } });

    const reloaded = new AuctionManager(new SqliteAuctionStorage(db));

    expect(reloaded.mine(idOf(a)).map(l => [l.kind, l.price])).toEqual([
      ['item', { kind: 'item', itemId: SILVER_ESSENCE, amount: 2 }],
      ['equipment', { kind: 'gold', gold: 9 }],
    ]);
    expect(reloaded.mine(idOf(a))[1].equipment).toMatchObject({ id: equipId, enhancement: 3 });
  });

  it('刪除角色：上架中的一併消失（§ 57.8）', async () => {
    const a = await enter(1, 'Alice');
    const equipId = await giveEquipment(a);
    await act(a, 'list', { kind: 'equipment', equipmentId: equipId, price: gold(1) });

    const id = idOf(a);
    await a.game.getState().deleteCharacter(id);
    await world.onCharacterDeleted(id);

    expect(world.auction.search(DEFAULT_AUCTION_QUERY).total).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM auction_listings').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM equipment_instances WHERE id = ?').get(equipId)).toEqual({ n: 0 });
  });
});

describe('拍賣場：開關', () => {
  it.skipIf(AUCTION_ENABLED)('AUCTION_ENABLED 為 false 時開放世界的拍賣場操作一律拒絕（§ 57.0）', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    const auth = new AuthService(db);
    const config = { ...buildConfig(new Map(), '/tmp').config, bind: '0.0.0.0' };
    const server = new GameServer({ repo, auth, config: () => config, version: 'test', hostUsername: 'host', mode: 'open', leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }), auctionStorage: new SqliteAuctionStorage(db) });
    let fire!: (socket: unknown, req: unknown) => void;
    server.attach({ on: (_ev: string, handler: typeof fire) => { fire = handler; } } as never);

    const user = await auth.register('alice', 'password1');
    const handlers: Record<string, (raw: unknown) => void> = {};
    const out: ServerMessage[] = [];
    fire({
      readyState: 1, OPEN: 1,
      on(ev: string, h: (raw: unknown) => void) { handlers[ev] = h; },
      send(raw: string) { out.push(JSON.parse(raw) as ServerMessage); },
      close() {},
    }, { socket: { remoteAddress: '1.2.3.4' } });
    const session = [...server.sessions].at(-1)!;
    const send = (msg: unknown) => handlers.message(JSON.stringify(msg));
    send({ t: 'hello', version: PROTOCOL_VERSION, release: 'test' });
    send({ t: 'resume', token: await auth.issueSession(user.id) });
    send({ t: 'create_character', name: 'Alice', className: 'knight', bonusAttrs: { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 } });
    await vi.waitFor(() => expect(session.game.getState().character?.name).toBe('Alice'));

    send({ t: 'action', store: 'auction', name: 'open', args: [], id: 1 });
    await vi.waitFor(() => expect(out.some(m => 'id' in m && m.id === 1)).toBe(true));
    expect(out.find(m => 'id' in m && m.id === 1)).toMatchObject({ t: 'action_ok', result: false });
    expect(session.auction.getState().message).toBe(AUCTION_CLOSED_MESSAGE);
    expect(session.auction.getState().results).toBeFalsy();
  });
});

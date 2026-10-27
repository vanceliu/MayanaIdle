import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { SqliteGuildStorage, guildOwnerId } from '../db/guildStorage';
import { GuildManager } from '../guild';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, syncWorld, type PlayerSession } from '../playerSession';
import { World } from '../world';
import { addBagItem, getBagItemAmount } from '../../../client/src/models/bagItem';
import type { EquipmentInstance } from '../../../client/src/models/equipment';
import {
  GUILD_WAREHOUSE_CAPACITY, GUILD_WAREHOUSE_FULL_MESSAGE, GUILD_WAREHOUSE_TAKEN_MESSAGE,
} from '../../../client/src/models/guild';

/** 公會倉庫（`11-guild.md` § 11.8） */
const ATTRS = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never;
const SILVER_ORE = 11;
const SILVER_ESSENCE = 12;

describe('公會倉庫', () => {
  let world: World;
  let repo: SqliteRepository;
  let db: DatabaseSync;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    world = new World(new SqliteGuildStorage(db));
  });

  async function enter(userId: number, name: string, region = 'neutral-town'): Promise<PlayerSession> {
    const s = createPlayerSession(repo, '127.0.0.1', () => {});
    s.world = world;
    s.userId = userId;
    s.game.setState({ userId });
    world.sessions.add(s);
    await s.game.getState().createCharacter(name, 'knight', ATTRS);
    const ch = s.game.getState().character!;
    s.game.setState({ character: { ...ch, level: 10, gold: 1000, currentRegion: region, currentArea: region } });
    await s.game.getState().saveState();
    await syncWorld(s);
    world.onCharacterEnter(s);
    return s;
  }

  const idOf = (s: PlayerSession) => s.game.getState().character!.id!;
  const act = (s: PlayerSession, name: string, ...args: unknown[]) => world.handleGuildAction(s, name, args);

  async function guildOf(leader: PlayerSession, ...members: PlayerSession[]) {
    await act(leader, 'create', '星辰');
    for (const m of members) {
      await act(leader, 'invite', idOf(m));
      await act(m, 'accept', m.guild.getState().invites[0].id);
    }
    return world.guilds.guildOf(idOf(leader))!;
  }

  async function giveEquipment(s: PlayerSession, extra: Partial<EquipmentInstance> = {}): Promise<number> {
    const base = { templateId: 1, ownerId: idOf(s), quality: 0, enhancement: 0, affixes: [], equipped: false, inStorage: false, ...extra };
    const id = await repo.addEquipment(base as never);
    s.game.setState({ inventory: [...s.game.getState().inventory, { ...base, id } as never] });
    return id;
  }

  function giveItem(s: PlayerSession, itemId: number, amount: number) {
    s.game.setState({ bagItems: addBagItem(s.game.getState().bagItems, itemId, amount) });
  }

  it('打開分頁才送內容；其他成員存入不推送，重新打開才看得到', async () => {
    const a = await enter(1, 'Alice');
    const b = await enter(2, 'Bob');
    await guildOf(a, b);
    expect(a.guild.getState().warehouse).toBeNull();

    expect((await act(a, 'openWarehouse')).ok).toBe(true);
    expect(a.guild.getState().warehouse).toMatchObject({ items: [], equipment: [], gold: 0, used: 0, capacity: GUILD_WAREHOUSE_CAPACITY });

    giveItem(b, SILVER_ORE, 5);
    await act(b, 'depositWarehouse', { materials: [{ itemId: SILVER_ORE, amount: 5 }] });
    world.tick();
    expect(a.guild.getState().warehouse!.items).toEqual([]);

    await act(a, 'openWarehouse');
    expect(a.guild.getState().warehouse!.items.map(i => [i.itemId, i.amount])).toEqual([[SILVER_ORE, 5]]);

    await act(a, 'closeWarehouse');
    expect(a.guild.getState().warehouse).toBeNull();
  });

  it('沒有公會或不在城鎮不能打開', async () => {
    const a = await enter(1, 'Alice');
    expect((await act(a, 'openWarehouse')).message).toBe('你沒有公會');
    await guildOf(a);
    const ch = a.game.getState().character!;
    a.game.setState({ character: { ...ch, currentRegion: 'dawn-plains' } });
    expect((await act(a, 'openWarehouse')).ok).toBe(false);
  });

  it('存入裝備與道具：背包扣掉、倉庫增加、落地到 SQLite（裝備 ownerId 為負的公會 id）', async () => {
    const a = await enter(1, 'Alice');
    const guild = await guildOf(a);
    const equipId = await giveEquipment(a);
    giveItem(a, SILVER_ORE, 8);

    const r = await act(a, 'depositWarehouse', { equipmentIds: [equipId], materials: [{ itemId: SILVER_ORE, amount: 3 }] });
    expect(r.ok).toBe(true);
    expect(a.game.getState().inventory.some(i => i.id === equipId)).toBe(false);
    expect(getBagItemAmount(a.game.getState().bagItems, SILVER_ORE)).toBe(5);
    expect(a.guild.getState().warehouse!.used).toBe(2);

    expect(db.prepare('SELECT item_id, amount FROM guild_warehouse_items').all()).toEqual([{ item_id: SILVER_ORE, amount: 3 }]);
    const row = db.prepare('SELECT owner_id, data FROM equipment_instances WHERE id = ?').get(equipId) as { owner_id: number; data: string };
    expect(row.owner_id).toBe(guildOwnerId(guild.id));
    expect(JSON.parse(row.data)).toMatchObject({ inStorage: true, storageType: 'guild' });
  });

  it('新手裝不收', async () => {
    const a = await enter(1, 'Alice');
    await guildOf(a);
    const starter = await giveEquipment(a, { isStarterGear: true });
    await act(a, 'depositWarehouse', { equipmentIds: [starter] });
    expect(a.game.getState().inventory.some(i => i.id === starter)).toBe(true);
  });

  it('200 格：放得下的先存，放不下的留在背包；已有的同種道具不佔新格', async () => {
    const a = await enter(1, 'Alice');
    const guild = await guildOf(a);
    for (let i = 0; i < GUILD_WAREHOUSE_CAPACITY - 2; i++) guild.warehouse.items.set(10_000 + i, 1);
    guild.warehouse.items.set(SILVER_ORE, 1);
    giveItem(a, SILVER_ORE, 4);
    giveItem(a, SILVER_ESSENCE, 2);
    const equipId = await giveEquipment(a);

    const r = await act(a, 'depositWarehouse', {
      materials: [{ itemId: SILVER_ORE, amount: 4 }, { itemId: SILVER_ESSENCE, amount: 2 }],
      equipmentIds: [equipId],
    });
    expect(r).toEqual({ ok: true, message: GUILD_WAREHOUSE_FULL_MESSAGE });
    // 裝備先排：佔掉最後一格，銀精華放不下；銀礦石已有，照常疊上去
    expect(a.game.getState().inventory.some(i => i.id === equipId)).toBe(false);
    expect(guild.warehouse.items.get(SILVER_ORE)).toBe(5);
    expect(getBagItemAmount(a.game.getState().bagItems, SILVER_ESSENCE)).toBe(2);
    expect(world.guilds.warehouseUsed(guild)).toBe(GUILD_WAREHOUSE_CAPACITY);
  });

  it('取出：成功放回背包；東西已被拿走則失敗並刷新為最新內容', async () => {
    const a = await enter(1, 'Alice');
    const b = await enter(2, 'Bob');
    await guildOf(a, b);
    const equipId = await giveEquipment(a);
    giveItem(a, SILVER_ORE, 5);
    await act(a, 'depositWarehouse', { equipmentIds: [equipId], materials: [{ itemId: SILVER_ORE, amount: 5 }] });

    await act(b, 'openWarehouse');
    await act(a, 'withdrawWarehouse', { equipmentIds: [equipId] });
    expect(a.game.getState().inventory.some(i => i.id === equipId)).toBe(true);
    const row = db.prepare('SELECT owner_id FROM equipment_instances WHERE id = ?').get(equipId) as { owner_id: number };
    expect(row.owner_id).toBe(idOf(a));

    // Bob 的畫面還是舊的，裡面仍有那件
    expect(b.guild.getState().warehouse!.equipment.map(e => e.id)).toEqual([equipId]);
    const r = await act(b, 'withdrawWarehouse', { equipmentIds: [equipId] });
    expect(r).toEqual({ ok: false, message: GUILD_WAREHOUSE_TAKEN_MESSAGE });
    expect(b.guild.getState().warehouse!.equipment).toEqual([]);

    expect((await act(b, 'withdrawWarehouse', { materials: [{ itemId: SILVER_ORE, amount: 6 }] })).message).toBe(GUILD_WAREHOUSE_TAKEN_MESSAGE);
    expect((await act(b, 'withdrawWarehouse', { materials: [{ itemId: SILVER_ORE, amount: 5 }] })).ok).toBe(true);
    expect(getBagItemAmount(b.game.getState().bagItems, SILVER_ORE)).toBe(5);
  });

  it('兩人同時取同一件，只有一人拿到', async () => {
    const a = await enter(1, 'Alice');
    const b = await enter(2, 'Bob');
    await guildOf(a, b);
    const equipId = await giveEquipment(a);
    await act(a, 'depositWarehouse', { equipmentIds: [equipId] });

    const [ra, rb] = await Promise.all([
      act(a, 'withdrawWarehouse', { equipmentIds: [equipId] }),
      act(b, 'withdrawWarehouse', { equipmentIds: [equipId] }),
    ]);
    expect([ra.ok, rb.ok].filter(Boolean)).toHaveLength(1);
    const holders = [a, b].filter(s => s.game.getState().inventory.some(i => i.id === equipId));
    expect(holders).toHaveLength(1);
  });

  it('背包放不下不可取出', async () => {
    const a = await enter(1, 'Alice');
    await guildOf(a);
    giveItem(a, SILVER_ESSENCE, 1);
    await act(a, 'depositWarehouse', { materials: [{ itemId: SILVER_ESSENCE, amount: 1 }] });
    const filler = Array.from({ length: 100 }, (_, i) => ({ id: 50_000 + i, templateId: 1 }) as never);
    a.game.setState({ inventory: filler });
    expect((await act(a, 'withdrawWarehouse', { materials: [{ itemId: SILVER_ESSENCE, amount: 1 }] })).message).toBe('背包空間不足');
  });

  it('金幣：存入扣身上、取出不得超過餘額', async () => {
    const a = await enter(1, 'Alice');
    const b = await enter(2, 'Bob');
    await guildOf(a, b);
    await act(a, 'depositWarehouseGold', 400);
    expect(a.game.getState().character!.gold).toBe(600);
    expect((await act(b, 'withdrawWarehouseGold', 500)).message).toBe('公會倉庫金幣不足');
    expect((await act(b, 'withdrawWarehouseGold', 300)).ok).toBe(true);
    expect(b.game.getState().character!.gold).toBe(1300);
    expect(db.prepare('SELECT warehouse_gold FROM guilds').get()).toEqual({ warehouse_gold: 100 });
    expect((await act(a, 'depositWarehouseGold', -5)).ok).toBe(false);
  });

  it('解散：倉庫的道具、裝備、金幣一併消失', async () => {
    const a = await enter(1, 'Alice');
    await guildOf(a);
    const equipId = await giveEquipment(a);
    giveItem(a, SILVER_ORE, 2);
    await act(a, 'depositWarehouse', { equipmentIds: [equipId], materials: [{ itemId: SILVER_ORE, amount: 2 }] });
    await act(a, 'depositWarehouseGold', 100);
    await act(a, 'openWarehouse');

    await act(a, 'disband');
    expect(db.prepare('SELECT COUNT(*) AS n FROM guild_warehouse_items').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM equipment_instances WHERE id = ?').get(equipId)).toEqual({ n: 0 });
    expect(a.guild.getState().warehouse).toBeNull();
  });

  it('退出公會後倉庫分頁的內容清掉', async () => {
    const a = await enter(1, 'Alice');
    const b = await enter(2, 'Bob');
    await guildOf(a, b);
    await act(b, 'openWarehouse');
    await act(b, 'leave');
    expect(b.guild.getState().warehouse).toBeNull();
  });

  it('同號的角色被刪除，不會帶走公會倉庫的裝備', async () => {
    const a = await enter(1, 'Alice');
    const guild = await guildOf(a);
    const equipId = await giveEquipment(a);
    await act(a, 'depositWarehouse', { equipmentIds: [equipId] });
    // 公會 id 與某個角色 id 相同時，依角色 id 清裝備不可碰到公會倉庫
    await repo.deleteCharacterEquipment(guild.id);
    expect(db.prepare('SELECT COUNT(*) AS n FROM equipment_instances WHERE id = ?').get(equipId)).toEqual({ n: 1 });
  });

  it('重開 server 後倉庫從 SQLite 還原', async () => {
    const a = await enter(1, 'Alice');
    await guildOf(a);
    const equipId = await giveEquipment(a);
    giveItem(a, SILVER_ORE, 4);
    await act(a, 'depositWarehouse', { equipmentIds: [equipId], materials: [{ itemId: SILVER_ORE, amount: 4 }] });
    await act(a, 'depositWarehouseGold', 250);

    const reloaded = new GuildManager(new SqliteGuildStorage(db));
    const guild = reloaded.guildOf(idOf(a))!;
    const view = reloaded.warehouseView(guild);
    expect(view.equipment.map(e => e.id)).toEqual([equipId]);
    expect(view.items.map(i => [i.itemId, i.amount])).toEqual([[SILVER_ORE, 4]]);
    expect(view.gold).toBe(250);
  });
});

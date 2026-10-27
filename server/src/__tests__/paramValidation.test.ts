import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer } from '../ws';
import { defaultSession } from '../../../client/src/stores/session';
import { loadTemplateCache } from '../../../client/src/systems/templateSync';
import { makeBagItem } from '../../../client/src/models/bagItem';
import { EQUIPMENT_SEEDS } from '../../../client/src/db/seed/equipmentSeeds';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';
import type { PlayerSession } from '../playerSession';

/** 數值、鍵名、列舉參數驗證（`97-selfhosted-server.md` § 97.2 硬性要求） */
const KNIGHT_BONUS = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
const RED_POTION = 1;
const SEAL_SIGIL = 162;
const BAD_COUNTS: [string, unknown][] = [['字串', 'x'], ['小數', 1.5], ['負數', -1], ['0', 0], ['null', null]];

interface Client {
  session: PlayerSession;
  act(name: string, ...args: unknown[]): Promise<ServerMessage>;
}

describe('數值、鍵名、列舉參數驗證', () => {
  let db: DatabaseSync;
  let auth: AuthService;
  let server: GameServer;
  let fire: (socket: unknown, req: unknown) => void;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    await loadTemplateCache(repo);
    auth = new AuthService(db);
    const config = { ...buildConfig(new Map(), '/tmp').config, bind: '0.0.0.0' };
    server = new GameServer({ repo, auth, config: () => config, version: 'test', hostUsername: 'host', mode: 'open', leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }) });
    server.attach({ on: (_ev: string, handler: typeof fire) => { fire = handler; } } as never);
  });

  async function enter(): Promise<Client> {
    const user = await auth.register('alice', 'password1');
    const handlers: Record<string, (raw: unknown) => void> = {};
    const sent: ServerMessage[] = [];
    fire({
      readyState: 1,
      OPEN: 1,
      on(ev: string, h: (raw: unknown) => void) { handlers[ev] = h; },
      send(raw: string) { sent.push(JSON.parse(raw) as ServerMessage); },
      close() {},
    }, { socket: { remoteAddress: '1.2.3.4' } });
    const session = [...server.sessions].at(-1)!;
    const send = (msg: unknown) => handlers.message(JSON.stringify(msg));
    send({ t: 'hello', version: PROTOCOL_VERSION, release: 'test' });
    send({ t: 'resume', token: await auth.issueSession(user.id) });
    send({ t: 'create_character', name: 'Alice', className: 'knight', bonusAttrs: KNIGHT_BONUS });
    await vi.waitFor(() => expect(session.game.getState().character?.name).toBe('Alice'));
    let nextId = 1;
    return {
      session,
      act: async (name, ...args) => {
        const id = nextId++;
        send({ t: 'action', store: 'game', name, args, id });
        await vi.waitFor(() => expect(sent.some(m => 'id' in m && m.id === id)).toBe(true));
        return sent.find(m => 'id' in m && m.id === id)!;
      },
    };
  }

  const state = (c: Client) => c.session.game.getState();
  const held = (c: Client, itemId: number) => state(c).bagItems.find(b => b.itemId === itemId)?.amount ?? 0;

  it('unequipItem("__proto__")：不污染 Object.prototype，裝備不變', async () => {
    const c = await enter();
    const gear = state(c).equippedGear;

    await c.act('unequipItem', '__proto__');
    await c.act('unequipItem', 'constructor');

    expect(({} as Record<string, unknown>).equipped).toBeUndefined();
    expect(state(c).equippedGear).toEqual(gear);
  });

  describe('數量參數', () => {
    it.each(BAD_COUNTS)('sellBagItems 數量為%s：金幣與背包不變', async (_label, amount) => {
      const c = await enter();
      const gold = state(c).character!.gold;
      const before = held(c, RED_POTION);

      await c.act('sellBagItems', [{ itemId: RED_POTION, amount }]);

      expect(state(c).character!.gold).toBe(gold);
      expect(held(c, RED_POTION)).toBe(before);
    });

    it.each(BAD_COUNTS)('depositToWarehouse 數量為%s：背包不變', async (_label, amount) => {
      const c = await enter();
      const before = held(c, RED_POTION);

      await c.act('depositToWarehouse', { warehouse: 'personal', materials: [{ itemId: RED_POTION, amount }] });

      expect(held(c, RED_POTION)).toBe(before);
      expect(state(c).personalStoredMaterials).toEqual([]);
    });

    it.each(BAD_COUNTS)('withdrawFromWarehouse 數量為%s：倉庫不變', async (_label, amount) => {
      const c = await enter();
      await c.act('depositToWarehouse', { warehouse: 'personal', materials: [{ itemId: RED_POTION, amount: 3 }] });
      const stored = state(c).personalStoredMaterials;

      await c.act('withdrawFromWarehouse', { warehouse: 'personal', materials: [{ itemId: RED_POTION, amount }] });

      expect(state(c).personalStoredMaterials).toEqual(stored);
    });

    it.each(BAD_COUNTS.filter(([label]) => label !== 'null'))('discardBagItem 數量為%s：背包不變', async (_label, amount) => {
      const c = await enter();
      const before = held(c, RED_POTION);

      await c.act('discardBagItem', RED_POTION, amount);

      expect(held(c, RED_POTION)).toBe(before);
    });

    it.each([['字串', 'x'], ['小數', 1.5]])('confirmDiscard 數量為%s：不丟棄', async (_label, amount) => {
      const c = await enter();
      const before = held(c, RED_POTION);
      await c.act('requestDiscard', { kind: 'bag', itemId: RED_POTION });

      await c.act('confirmDiscard', amount);

      expect(held(c, RED_POTION)).toBe(before);
    });

    it('合法數量照常買賣、存取、丟棄', async () => {
      const c = await enter();
      const start = held(c, RED_POTION);
      const gold = state(c).character!.gold;

      await c.act('sellBagItems', [{ itemId: RED_POTION, amount: 1 }]);
      await c.act('depositToWarehouse', { warehouse: 'personal', materials: [{ itemId: RED_POTION, amount: 2 }] });
      await c.act('withdrawFromWarehouse', { warehouse: 'personal', materials: [{ itemId: RED_POTION, amount: 1 }] });
      await c.act('discardBagItem', RED_POTION, 1);

      expect(state(c).character!.gold).toBeGreaterThan(gold);
      expect(held(c, RED_POTION)).toBe(start - 1 - 2 + 1 - 1);
    });
  });

  describe('applySigil', () => {
    /** 新手裝不能用印記，這裡用商店裝備並給一條詞綴 */
    async function withAffixedItem(c: Client) {
      const shop = EQUIPMENT_SEEDS.filter(t => t.acquireType === 'shop' && (t.buyPrice ?? 0) > 0).sort((x, y) => x.buyPrice! - y.buyPrice!)[0];
      c.session.game.setState({ character: { ...state(c).character!, gold: shop.buyPrice! } });
      await c.act('buyShopEquipment', [shop.id]);
      const item = state(c).inventory.find(i => i.templateId === shop.id)!;
      const affixes = [{ type: 'max_hp', tier: 1, value: 5 }];
      c.session.game.setState({
        inventory: state(c).inventory.map(i => (i.id === item.id ? { ...i, affixes } as never : i)),
        bagItems: [...state(c).bagItems, makeBagItem(SEAL_SIGIL, 5)!],
      });
      return item.id!;
    }

    it.each([['字串', '0'], ['小數', 0.5], ['負數', -1], ['超出範圍', 1]])('詞綴編號為%s：不處理、詞綴與印記不變', async (_label, index) => {
      const c = await enter();
      const id = await withAffixedItem(c);

      const reply = await c.act('applySigil', id, 'seal', index);

      expect(reply).toMatchObject({ t: 'action_ok', result: { ok: false } });
      expect(state(c).inventory.find(i => i.id === id)!.affixes).toHaveLength(1);
      expect(held(c, SEAL_SIGIL)).toBe(5);
    });

    it('不存在的印記類型：回失敗，不拋錯', async () => {
      const c = await enter();
      const id = await withAffixedItem(c);

      const reply = await c.act('applySigil', id, 'zzz', null);

      expect(reply).toMatchObject({ t: 'action_ok', result: { ok: false } });
    });
  });

  it('spendAttributePoint 非屬性鍵：不寫入、點數不扣', async () => {
    const c = await enter();
    c.session.game.setState({ character: { ...state(c).character!, unspentAttributePoints: 1 } });
    const bonus = state(c).character!.bonusAttributes;

    await c.act('spendAttributePoint', 'constructor');
    await c.act('spendAttributePoint', '__proto__');

    expect(state(c).character!.bonusAttributes).toEqual(bonus);
    expect(state(c).character!.unspentAttributePoints).toBe(1);
  });

  it('restAtInn 在野外：不收錢、不回復（`13-town.md` § 13.7）', async () => {
    const c = await enter();
    c.session.game.setState({ character: { ...state(c).character!, currentRegion: 'dawn-plains', currentArea: 'dawn-plains', hp: 1, gold: 1000 } });

    const reply = await c.act('restAtInn', 'full');

    expect(reply).toMatchObject({ t: 'action_ok', result: false });
    expect(state(c).character!.gold).toBe(1000);
    expect(state(c).character!.hp).toBe(1);
  });

  it('restAtInn 在城鎮：照常收錢回復', async () => {
    const c = await enter();
    c.session.game.setState({ character: { ...state(c).character!, hp: 1, gold: 1000 } });

    const reply = await c.act('restAtInn', 'full');

    expect(reply).toMatchObject({ t: 'action_ok', result: true });
    expect(state(c).character!.gold).toBeLessThan(1000);
    expect(state(c).character!.hp).toBeGreaterThan(1);
  });

  it('restAtInn 未知 mode：不收錢、不回復', async () => {
    const c = await enter();
    c.session.game.setState({ character: { ...state(c).character!, hp: 1, mp: 0, gold: 1000 } });

    const reply = await c.act('restAtInn', 'zzz');

    expect(reply).toMatchObject({ t: 'action_ok', result: false });
    expect(state(c).character!.gold).toBe(1000);
    expect(state(c).character!.hp).toBe(1);
  });
});

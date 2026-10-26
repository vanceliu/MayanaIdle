import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer } from '../ws';
import { defaultSession } from '../../../client/src/stores/session';
import { loadTemplateCache } from '../../../client/src/systems/templateSync';
import { EQUIPMENT_SEEDS } from '../../../client/src/db/seed/equipmentSeeds';
import { getBagMaxSlots, getBagUsedSlots } from '../../../client/src/stores/gameStore';
import type { BagItem } from '../../../client/src/models/bagItem';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';
import type { PlayerSession } from '../playerSession';

/** 價格與任務內容由 server 決定（`97-selfhosted-server.md` § 97.2 硬性要求） */
const KNIGHT_BONUS = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
const RED_POTION = 1;
const RED_POTION_PRICE = 25;
const NEUTRAL_TOWN_SCROLL = 4;
const OTHER_TOWN_SCROLL = 5;

interface Client {
  session: PlayerSession;
  act(name: string, ...args: unknown[]): Promise<void>;
  gold(): number;
  held(itemId: number): number;
  setGold(gold: number): void;
}

describe('價格與任務內容由 server 決定', () => {
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
    send({ t: 'resume', token: auth.issueSession(user.id) });
    send({ t: 'create_character', name: 'Alice', className: 'knight', bonusAttrs: KNIGHT_BONUS });
    await vi.waitFor(() => expect(session.game.getState().character?.name).toBe('Alice'));
    let nextId = 1;
    const state = () => session.game.getState();
    return {
      session,
      act: async (name, ...args) => {
        const id = nextId++;
        send({ t: 'action', store: 'game', name, args, id });
        await vi.waitFor(() => expect(sent.some(m => 'id' in m && m.id === id)).toBe(true));
      },
      gold: () => state().character!.gold,
      held: itemId => state().bagItems.find(b => b.itemId === itemId)?.amount ?? 0,
      setGold: gold => session.game.setState({ character: { ...state().character!, gold } }),
    };
  }

  describe('buyBagItems', () => {
    it('client 給的單價不採用，依貨架價扣款', async () => {
      const c = await enter();
      c.setGold(1000);
      const before = c.held(RED_POTION);

      await c.act('buyBagItems', [{ itemId: RED_POTION, amount: 2, unitPrice: 0 }]);

      expect(c.gold()).toBe(1000 - 2 * RED_POTION_PRICE);
      expect(c.held(RED_POTION)).toBe(before + 2);
    });

    it.each([
      ['負數', -1000000],
      ['0', 0],
      ['小數', 1.5],
      ['字串', '2'],
    ])('數量為%s：整筆不成交', async (_label, amount) => {
      const c = await enter();
      c.setGold(1000);
      const before = c.held(RED_POTION);

      await c.act('buyBagItems', [{ itemId: RED_POTION, amount }]);

      expect(c.gold()).toBe(1000);
      expect(c.held(RED_POTION)).toBe(before);
    });

    it('非貨架品（他城回城卷軸）買不到；當地回城卷軸買得到', async () => {
      const c = await enter();
      c.setGold(100000);

      await c.act('buyBagItems', [{ itemId: OTHER_TOWN_SCROLL, amount: 1, unitPrice: 0 }]);
      expect(c.held(OTHER_TOWN_SCROLL)).toBe(0);

      await c.act('buyBagItems', [{ itemId: NEUTRAL_TOWN_SCROLL, amount: 1 }]);
      expect(c.held(NEUTRAL_TOWN_SCROLL)).toBe(1);
      expect(c.gold()).toBe(100000 - 500);
    });

    it('一筆裡有一項不合法，整筆都不成交', async () => {
      const c = await enter();
      c.setGold(100000);
      const before = c.held(RED_POTION);

      await c.act('buyBagItems', [{ itemId: RED_POTION, amount: 1 }, { itemId: OTHER_TOWN_SCROLL, amount: 1 }]);

      expect(c.gold()).toBe(100000);
      expect(c.held(RED_POTION)).toBe(before);
    });

    it('金幣不足：不成交', async () => {
      const c = await enter();
      c.setGold(RED_POTION_PRICE - 1);

      await c.act('buyBagItems', [{ itemId: RED_POTION, amount: 1 }]);

      expect(c.gold()).toBe(RED_POTION_PRICE - 1);
    });

    it('背包已滿且買的是新品項：不成交', async () => {
      const c = await enter();
      c.setGold(100000);
      const s = c.session.game.getState();
      const free = getBagMaxSlots(s.equippedGear) - getBagUsedSlots(s.bagItems, s.inventory, s.equippedGear);
      const fillers = Array.from({ length: free }, (_, i) => ({ itemId: 10000 + i, name: 'filler', type: 'material', amount: 1 }) as BagItem);
      c.session.game.setState({ bagItems: [...s.bagItems, ...fillers] });

      await c.act('buyBagItems', [{ itemId: 144, amount: 1 }]);

      expect(c.held(144)).toBe(0);
      expect(c.gold()).toBe(100000);
    });
  });

  describe('sellEquipmentInstances', () => {
    it('client 給的模板不採用，依 server 模板售價', async () => {
      const c = await enter();
      const shop = EQUIPMENT_SEEDS.filter(t => t.acquireType === 'shop' && (t.buyPrice ?? 0) > 0).sort((x, y) => x.buyPrice! - y.buyPrice!)[0];
      c.setGold(shop.buyPrice!);
      await c.act('buyShopEquipment', [shop.id]);
      const bought = c.session.game.getState().inventory.find(i => i.templateId === shop.id)!;

      await c.act('sellEquipmentInstances', [bought.id], [{ id: shop.id, buyPrice: 1e12 }]);

      expect(c.gold()).toBe(Math.floor(shop.buyPrice! * 0.5));
      expect(c.session.game.getState().inventory.some(i => i.id === bought.id)).toBe(false);
    });

    it('新手裝不會被賣掉', async () => {
      const c = await enter();
      const helmet = c.session.game.getState().equippedGear.helmet!;
      await c.act('unequipItem', 'helmet');
      c.setGold(0);

      await c.act('sellEquipmentInstances', [helmet.id], [{ id: helmet.templateId, buyPrice: 1e12, acquireType: 'shop' }]);

      expect(c.gold()).toBe(0);
      expect(c.session.game.getState().inventory.some(i => i.id === helmet.id)).toBe(true);
    });
  });

  describe('acceptAdventurerQuest', () => {
    it('偽造的任務接不到', async () => {
      const c = await enter();

      await c.act('acceptAdventurerQuest', { id: 'evil', type: 'deliver', difficulty: 'D', status: 'available', targetCount: 0, targetItemId: 1, reward: { type: 'gold', amount: 1e12 }, contributionPoints: 1e9 });

      expect(c.session.game.getState().adventurerQuests).toEqual([]);
    });

    it('任務板上的任務：接到的是任務板的版本，附帶的偽造欄位不採用', async () => {
      const c = await enter();
      const real = c.session.game.getState().adventurerQuestBoard.D[0];

      await c.act('acceptAdventurerQuest', { ...real, reward: { type: 'gold', amount: 1e12 }, contributionPoints: 1e9 });

      const [accepted] = c.session.game.getState().adventurerQuests;
      expect(accepted.id).toBe(real.id);
      expect(accepted.reward).toEqual(real.reward);
      expect(accepted.contributionPoints).toBe(real.contributionPoints);
    });
  });
});

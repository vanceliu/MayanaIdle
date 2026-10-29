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
import { getDismantleYield } from '../../../client/src/systems/crafting';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';
import type { PlayerSession } from '../playerSession';

/** 鐵匠鋪拆解經遠端 action（`06-equipment-acquire.md` § 6A.3「拆解」、`97-selfhosted-server.md` § 97.2） */
const KNIGHT_BONUS = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
const RECIPE = EQUIPMENT_SEEDS.find(t => t.acquireType === 'craft' && t.tier === 4 && !t.craftPrerequisiteWeapon && t.type !== 'armor')!;

interface Client {
  session: PlayerSession;
  act(name: string, ...args: unknown[]): Promise<ServerMessage>;
}

describe('拆解（遠端 action）', () => {
  let db: DatabaseSync;
  let repo: SqliteRepository;
  let auth: AuthService;
  let server: GameServer;
  let fire: (socket: unknown, req: unknown) => void;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
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

  it('拆解製作品：資料庫刪除實例、背包加入一半材料', async () => {
    const c = await enter();
    const game = c.session.game;
    game.setState({ bagItems: RECIPE.craftMaterials!.map(m => makeBagItem(m.itemId, m.amount)!) });
    await c.act('craftEquipment', RECIPE.id);
    const item = game.getState().inventory.find(i => i.templateId === RECIPE.id)!;

    const reply = await c.act('dismantleEquipment', item.id);
    expect(reply).toMatchObject({ t: 'action_ok', result: { ok: true } });
    expect(game.getState().inventory.some(i => i.id === item.id)).toBe(false);

    const charId = game.getState().character!.id!;
    expect((await repo.listEquipmentByOwner(charId)).some(i => i.id === item.id)).toBe(false);
    const bag = game.getState().bagItems;
    for (const m of getDismantleYield(RECIPE)!) expect(bag.find(b => b.itemId === m.itemId)?.amount).toBe(m.amount);
  });

  it('不在自己背包的實例 id 不受理', async () => {
    const c = await enter();
    const before = c.session.game.getState();
    const reply = await c.act('dismantleEquipment', 99999);
    expect(reply).toMatchObject({ t: 'action_ok', result: { ok: false } });
    expect(c.session.game.getState().bagItems).toEqual(before.bagItems);
    expect(c.session.game.getState().inventory).toEqual(before.inventory);
  });
});

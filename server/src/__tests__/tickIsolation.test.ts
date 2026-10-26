import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer, TICK_FAULT_REASON } from '../ws';
import { defaultSession } from '../../../client/src/stores/session';
import { loadTemplateCache } from '../../../client/src/systems/templateSync';
import { EQUIPMENT_SEEDS } from '../../../client/src/db/seed/equipmentSeeds';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';
import type { PlayerSession } from '../playerSession';

/** tick 錯誤隔離與同連線訊息依序處理（`97-selfhosted-server.md` § 97.2 硬性要求） */
const KNIGHT_BONUS = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };

interface Client {
  session: PlayerSession;
  sent: ServerMessage[];
  closedWith: number | null;
  send(msg: unknown): void;
}

describe('tick 錯誤隔離與訊息依序處理', () => {
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

  async function enter(name: string): Promise<Client> {
    const user = await auth.register(name.toLowerCase(), 'password1');
    const handlers: Record<string, (raw: unknown) => void> = {};
    const client = { sent: [] as ServerMessage[], closedWith: null as number | null } as Client;
    fire({
      readyState: 1,
      OPEN: 1,
      on(ev: string, h: (raw: unknown) => void) { handlers[ev] = h; },
      send(raw: string) { client.sent.push(JSON.parse(raw) as ServerMessage); },
      close(code: number) { client.closedWith = code; },
    }, { socket: { remoteAddress: '1.2.3.4' } });
    client.session = [...server.sessions].at(-1)!;
    client.send = msg => handlers.message(JSON.stringify(msg));
    client.send({ t: 'hello', version: PROTOCOL_VERSION, release: 'test' });
    client.send({ t: 'resume', token: auth.issueSession(user.id) });
    client.send({ t: 'create_character', name, className: 'knight', bonusAttrs: KNIGHT_BONUS });
    await vi.waitFor(() => expect(client.session.game.getState().character?.name).toBe(name));
    return client;
  }

  function kicked(client: Client): boolean {
    return client.sent.some(m => m.t === 'kicked' && m.reason === TICK_FAULT_REASON);
  }

  it('玩家狀態壞掉：tick 不拋錯、其他玩家照常推進，出錯的玩家被踢除且不再進 tick', async () => {
    const bad = await enter('Broken');
    const good = await enter('Healthy');
    bad.session.game.setState({ activeEffects: 5 as never });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => server.world.tick()).not.toThrow();
    const visuals = server.world.tick();

    expect(visuals.has(good.session)).toBe(true);
    expect(kicked(good)).toBe(false);
    await vi.waitFor(() => expect(bad.closedWith).toBe(4000));
    expect(kicked(bad)).toBe(true);
    expect(errorLog.mock.calls.filter(c => String(c[0]).includes(`tick session #${bad.session.connectionId}`))).toHaveLength(1);
    errorLog.mockRestore();
  });

  it('同一連線同時送兩次購買：依序處理，金幣只夠一件就只成交一件', async () => {
    const buyer = await enter('Buyer');
    const shop = EQUIPMENT_SEEDS.filter(t => t.acquireType === 'shop' && (t.buyPrice ?? 0) > 0).sort((x, y) => x.buyPrice! - y.buyPrice!)[0];
    const owned = () => buyer.session.game.getState().inventory.filter(i => i.templateId === shop.id).length;
    const before = owned();
    buyer.session.game.setState({ character: { ...buyer.session.game.getState().character!, gold: shop.buyPrice! } });

    buyer.send({ t: 'action', store: 'game', name: 'buyShopEquipment', args: [[shop.id]], id: 1 });
    buyer.send({ t: 'action', store: 'game', name: 'buyShopEquipment', args: [[shop.id]], id: 2 });
    await vi.waitFor(() => expect(buyer.sent.filter(m => 'id' in m && (m.id === 1 || m.id === 2))).toHaveLength(2));

    expect(buyer.session.game.getState().character!.gold).toBe(0);
    expect(owned() - before).toBe(1);
  });

  it('同一連線同時送 claim 與 claimAll：同一封信只領一次', async () => {
    const player = await enter('Mailer');
    const characterId = player.session.game.getState().character!.id!;
    await repo.bulkAddMail([{ characterId, sourceKey: 'test', title: 'test', items: [{ type: 'talent_slot', slotTier: 1 }], createdAt: Date.now(), claimedAt: null } as never]);
    player.send({ t: 'action', store: 'mailbox', name: 'refresh', args: [], id: 1 });
    await vi.waitFor(() => expect(player.sent.some(m => 'id' in m && m.id === 1)).toBe(true));
    const mail = (await repo.listMail(characterId)).find(m => m.sourceKey === 'test')!;
    const before = await repo.countTalentSlots(characterId);

    player.send({ t: 'action', store: 'mailbox', name: 'claim', args: [mail.id], id: 2 });
    player.send({ t: 'action', store: 'mailbox', name: 'claimAll', args: [], id: 3 });
    await vi.waitFor(() => expect(player.sent.filter(m => 'id' in m && (m.id === 2 || m.id === 3))).toHaveLength(2));

    expect(await repo.countTalentSlots(characterId) - before).toBe(1);
  });
});

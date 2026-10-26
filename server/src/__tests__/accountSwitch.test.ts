import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer } from '../ws';
import { defaultSession } from '../../../client/src/stores/session';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';

/** 同一連線換帳號前先卸下角色，角色資料不跨帳號（`97-selfhosted-server.md` § 97.5） */
const KNIGHT_BONUS = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };

describe('同一連線換帳號', () => {
  let db: DatabaseSync;
  let auth: AuthService;
  let server: GameServer;
  let fire: (socket: unknown, req: unknown) => void;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    auth = new AuthService(db);
    const config = { ...buildConfig(new Map(), '/tmp').config, bind: '0.0.0.0' };
    server = new GameServer({ repo, auth, config: () => config, version: 'test', hostUsername: 'host', mode: 'open', leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }) });
    server.attach({ on: (_ev: string, handler: typeof fire) => { fire = handler; } } as never);
  });

  it('登入另一個帳號：原角色卸下，原角色的裝備不會存進新帳號的共用倉庫', async () => {
    const alice = await auth.register('alice', 'password1');
    const bob = await auth.register('bobby', 'password1');
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
    const replied = (id: number) => vi.waitFor(() => expect(sent.some(m => 'id' in m && m.id === id)).toBe(true));

    send({ t: 'hello', version: PROTOCOL_VERSION, release: 'test' });
    send({ t: 'resume', token: auth.issueSession(alice.id) });
    send({ t: 'create_character', name: 'Alice', className: 'knight', bonusAttrs: KNIGHT_BONUS });
    await vi.waitFor(() => expect(session.game.getState().character?.name).toBe('Alice'));
    const helmet = session.game.getState().equippedGear.helmet!;
    send({ t: 'action', store: 'game', name: 'unequipItem', args: ['helmet'], id: 1 });
    await replied(1);

    send({ t: 'login', username: 'bobby', password: 'password1' });
    await vi.waitFor(() => expect(sent.filter(m => m.t === 'auth_ok')).toHaveLength(2));

    expect(session.userId).toBe(bob.id);
    expect(session.game.getState().character).toBeNull();

    send({ t: 'action', store: 'game', name: 'depositToWarehouse', args: [{ warehouse: 'shared', equipmentIds: [helmet.id] }], id: 2 });
    await replied(2);
    const row = db.prepare('SELECT owner_id, data FROM equipment_instances WHERE id = ?').get(helmet.id!) as { owner_id: number; data: string };
    expect(row.owner_id).not.toBe(bob.id);
    expect(JSON.parse(row.data).storageType).toBeUndefined();
  });
});

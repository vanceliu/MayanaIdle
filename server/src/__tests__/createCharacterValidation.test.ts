import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer } from '../ws';
import { defaultSession } from '../../../client/src/stores/session';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';
import type { PlayerSession } from '../playerSession';

/** 建角參數由 server 把關（`04-character.md` § 4.2、`19-account-character.md` § 19.4） */
const KNIGHT_OK = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };

describe('create_character 參數驗證', () => {
  let db: DatabaseSync;
  let repo: SqliteRepository;
  let auth: AuthService;
  let fire: (socket: unknown, req: unknown) => void;
  let server: GameServer;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    auth = new AuthService(db);
    const config = { ...buildConfig(new Map(), '/tmp').config, bind: '0.0.0.0' };
    server = new GameServer({ repo, auth, config: () => config, version: 'test', hostUsername: 'host', mode: 'open', leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }) });
    server.attach({ on: (_ev: string, handler: typeof fire) => { fire = handler; } } as never);
  });

  async function connect() {
    const user = await auth.register('alice', 'alicepw1');
    const handlers: Record<string, (raw: unknown) => void> = {};
    const sent: ServerMessage[] = [];
    fire({
      readyState: 1,
      OPEN: 1,
      on(ev: string, h: (raw: unknown) => void) { handlers[ev] = h; },
      send(raw: string) { sent.push(JSON.parse(raw) as ServerMessage); },
      close() {},
    }, { socket: { remoteAddress: '1.2.3.4' } });
    const session: PlayerSession = [...server.sessions].at(-1)!;
    const send = (msg: unknown) => handlers.message(JSON.stringify(msg));
    send({ t: 'hello', version: PROTOCOL_VERSION, release: 'test' });
    send({ t: 'resume', token: await auth.issueSession(user.id) });
    await vi.waitFor(() => expect(sent.some(m => m.t === 'auth_ok')).toBe(true));
    return { userId: user.id, session, sent, send };
  }

  async function createAndGetError(client: Awaited<ReturnType<typeof connect>>, msg: Record<string, unknown>) {
    client.send({ t: 'create_character', className: 'knight', name: 'Alpha', bonusAttrs: KNIGHT_OK, ...msg });
    await vi.waitFor(() => expect(client.sent.some(m => m.t === 'error')).toBe(true));
    return client.sent.find(m => m.t === 'error') as Extract<ServerMessage, { t: 'error' }>;
  }

  it.each([
    ['null', null],
    ['巨大數值', { STR: 100000, AGI: 100000, VIT: 100000, SPI: 100000, INT: 100000, CHA: 100000 }],
    ['沒分配完', { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 }],
    ['超過 18', { STR: 0, AGI: 1, VIT: 3, SPI: 0, INT: 0, CHA: 0 }],
    ['負數', { STR: 5, AGI: -1, VIT: 0, SPI: 0, INT: 0, CHA: 0 }],
    ['多出鍵', { ...KNIGHT_OK, LUK: 0 }],
  ])('加點%s：回 bad_character，不建角', async (_label, bonusAttrs) => {
    const client = await connect();
    const error = await createAndGetError(client, { bonusAttrs });

    expect(error.code).toBe('bad_character');
    expect(client.session.game.getState().character).toBeNull();
    expect(await repo.countCharacters(client.userId)).toBe(0);
  });

  it.each([
    ['非字串', 123],
    ['缺少', undefined],
    ['含空白', 'Al pha'],
    ['HTML 字元', '<b>x</b>'],
    ['過長', 'a'.repeat(65536)],
    ['純符號', '..'],
  ])('名稱%s：回 bad_character，不建角', async (_label, name) => {
    const client = await connect();
    const error = await createAndGetError(client, { name });

    expect(error.code).toBe('bad_character');
    expect(await repo.countCharacters(client.userId)).toBe(0);
  });

  it('職業不是字串：回 bad_class', async () => {
    const client = await connect();
    const error = await createAndGetError(client, { className: { knight: true } });

    expect(error.code).toBe('bad_class');
  });

  it('合法參數照常建角，屬性等於初始 + 加點', async () => {
    const client = await connect();
    client.send({ t: 'create_character', className: 'knight', name: 'Alpha', bonusAttrs: KNIGHT_OK, appearance: 'garbage' });
    await vi.waitFor(() => expect(client.session.game.getState().character?.name).toBe('Alpha'));

    const character = client.session.game.getState().character!;
    expect(character.bonusAttributes).toEqual(KNIGHT_OK);
    expect(client.sent.some(m => m.t === 'error')).toBe(false);
  });
});

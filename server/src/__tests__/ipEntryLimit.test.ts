import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { SqliteIpAllowlist } from '../db/ipAllowlist';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { DUPLICATE_ENTRY_REASON, GameServer, IP_LIMIT_MESSAGE } from '../ws';
import { IpEntryLimit, MAX_IN_GAME_ACCOUNTS_PER_IP } from '../ipEntryLimit';
import { defaultSession } from '../../../client/src/stores/session';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '../../../client/src/net/protocol';
import type { PlayerSession } from '../playerSession';

/** 同 IP 同時在場（`97-selfhosted-server.md` § 97.5） */
// 騎士可分配 4 點（`04-character.md` § 4.2）
const ATTRS = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };

describe('IpEntryLimit', () => {
  it('同 IP 其他帳號達 2 個時拒絕，進場中的帳號計入', () => {
    expect(MAX_IN_GAME_ACCOUNTS_PER_IP).toBe(2);
    const limit = new IpEntryLimit();
    expect(limit.begin('ip', 3, [1])).toBe(true);
    expect(limit.begin('ip', 4, [1])).toBe(false);
    expect(limit.begin('other', 4, [])).toBe(true);
    limit.finish('ip', 3);
    expect(limit.begin('ip', 4, [1])).toBe(true);
  });

  it('同帳號不佔第二個名額', () => {
    const limit = new IpEntryLimit();
    expect(limit.begin('ip', 1, [1, 2])).toBe(true);
    expect(limit.begin('ip', 1, [1, 2])).toBe(true);
    limit.finish('ip', 1);
    limit.finish('ip', 1);
    expect(limit.begin('ip', 3, [2])).toBe(true);
  });
});

interface Client {
  session: PlayerSession;
  sent: ServerMessage[];
  closedWith: number | null;
  send(msg: ClientMessage): void;
}

describe('同 IP 同時在場上限', () => {
  let db: DatabaseSync;
  let auth: AuthService;
  let server: GameServer;
  let fire: (socket: unknown, req: unknown) => void;
  let socketClose: Map<Client, () => void>;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    auth = new AuthService(db);
    socketClose = new Map();
    // bind 非回送位址：避開單機的 host 自動登入
    const config = { ...buildConfig(new Map(), '/tmp').config, bind: '0.0.0.0' };
    server = new GameServer({ repo, auth, config: () => config, version: 'test', hostUsername: 'host', mode: 'open', leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }), ipAllowlist: new SqliteIpAllowlist(db) });
    server.attach({ on: (_ev: string, handler: typeof fire) => { fire = handler; } } as never);
  });

  async function connect(userId: number, ip = '1.2.3.4'): Promise<Client> {
    const handlers: Record<string, (raw?: unknown) => void> = {};
    const client = { sent: [] as ServerMessage[], closedWith: null as number | null } as Client;
    const socket = {
      readyState: 1,
      OPEN: 1,
      on(ev: string, h: (raw?: unknown) => void) { handlers[ev] = h; },
      send(raw: string) { client.sent.push(JSON.parse(raw) as ServerMessage); },
      close(code: number) { client.closedWith = code; },
    };
    fire(socket, { socket: { remoteAddress: ip } });
    client.session = [...server.sessions].at(-1)!;
    client.send = msg => handlers.message(JSON.stringify(msg));
    socketClose.set(client, () => handlers.close());
    client.send({ t: 'hello', version: PROTOCOL_VERSION, release: 'test' });
    client.send({ t: 'resume', token: await auth.issueSession(userId) });
    await vi.waitFor(() => expect(client.sent.some(m => m.t === 'auth_ok')).toBe(true));
    return client;
  }

  function character(client: Client) {
    return client.session.game.getState().character;
  }

  function rejected(client: Client): boolean {
    return client.sent.some(m => m.t === 'error' && m.code === 'ip_limit' && m.message === IP_LIMIT_MESSAGE);
  }

  async function create(client: Client, name: string): Promise<void> {
    client.send({ t: 'create_character', name, className: 'knight', bonusAttrs: ATTRS });
    await vi.waitFor(() => expect(character(client)?.name).toBe(name));
  }

  async function createRejected(client: Client, name: string): Promise<void> {
    client.send({ t: 'create_character', name, className: 'knight', bonusAttrs: ATTRS });
    await vi.waitFor(() => expect(rejected(client)).toBe(true));
  }

  async function players(ip = '1.2.3.4'): Promise<Client[]> {
    const out: Client[] = [];
    for (const name of ['amy', 'ben', 'cid']) {
      const user = await auth.register(`${name}${ip.replace(/\D/g, '')}`, `${name}pass12`);
      out.push(await connect(user.id, ip));
    }
    return out;
  }

  it('第 3 個帳號進場被拒，停在角色選擇，已在遊戲中的不受影響', async () => {
    const [a, b, c] = await players();
    await create(a, 'Aaa');
    await create(b, 'Bbb');
    await createRejected(c, 'Ccc');

    expect(character(c)).toBeNull();
    expect(await defaultSession.repo.nameTaken('Ccc')).toBe(false);
    expect(character(a)?.name).toBe('Aaa');
    expect(character(b)?.name).toBe('Bbb');
    expect(a.closedWith).toBeNull();
    expect(b.closedWith).toBeNull();
  });

  it('停在角色選擇畫面的連線不計；其他 IP 不受影響', async () => {
    const [a, b, c] = await players();
    await create(a, 'Aaa');
    await create(c, 'Ccc');
    expect(character(b)).toBeNull();

    const [x] = await players('5.6.7.8');
    await create(x, 'Xxx');
  });

  it('卸下角色或斷線後釋出名額', async () => {
    const [a, b, c] = await players();
    await create(a, 'Aaa');
    await create(b, 'Bbb');

    a.send({ t: 'leave_character' });
    await vi.waitFor(() => expect(character(a)).toBeNull());
    await create(c, 'Ccc');

    const d = await connect((await auth.register('dan1234', 'danpass12')).id);
    await createRejected(d, 'Ddd');
    socketClose.get(b)!();
    await vi.waitFor(() => expect(server.sessions.has(b.session)).toBe(false));
    await create(d, 'Ddd2');
  });

  it('同帳號重複進場不佔第二個名額，被拒時不踢同帳號的其他連線', async () => {
    const [a, b, c] = await players();
    await create(a, 'Aaa');
    await create(b, 'Bbb');

    const a2 = await connect(a.session.userId!);
    await create(a2, 'Aaa2');
    expect(a.sent.some(m => m.t === 'kicked' && m.reason === DUPLICATE_ENTRY_REASON)).toBe(true);

    const cElsewhere = await connect(c.session.userId!, '9.9.9.9');
    await create(cElsewhere, 'Ccc');
    await createRejected(c, 'Ccc2');
    expect(character(cElsewhere)?.name).toBe('Ccc');
    expect(cElsewhere.closedWith).toBeNull();
  });

  it('不同帳號同時進場，不會超過上限', async () => {
    const [a, b, c] = await players();
    a.send({ t: 'create_character', name: 'Aaa', className: 'knight', bonusAttrs: ATTRS });
    b.send({ t: 'create_character', name: 'Bbb', className: 'knight', bonusAttrs: ATTRS });
    c.send({ t: 'create_character', name: 'Ccc', className: 'knight', bonusAttrs: ATTRS });
    await vi.waitFor(() => expect([a, b, c].filter(x => character(x) || rejected(x))).toHaveLength(3));

    expect([a, b, c].filter(x => character(x))).toHaveLength(2);
    expect([a, b, c].filter(rejected)).toHaveLength(1);
  });

  it('放行名單上的 IP 不受限；移除後已在遊戲中的不踢除，新進場照上限', async () => {
    await server.ipAllowlist.add('1.2.3.4', '宿舍', 1);
    const [a, b, c] = await players();
    await create(a, 'Aaa');
    await create(b, 'Bbb');
    await create(c, 'Ccc');

    await server.ipAllowlist.remove('1.2.3.4');
    expect([a, b, c].every(x => character(x) && x.closedWith === null)).toBe(true);
    const d = await connect((await auth.register('dan1234', 'danpass12')).id);
    await createRejected(d, 'Ddd');
  });

  it('放行名單存在 SQLite，重開後仍在；重複新增只更新備註', async () => {
    await server.ipAllowlist.add('1.2.3.4', '宿舍', 100);
    await server.ipAllowlist.add('1.2.3.4', '宿舍 3 人', 200);
    const reopened = new SqliteIpAllowlist(db);
    expect(reopened.has('1.2.3.4')).toBe(true);
    expect(reopened.list()).toEqual([{ ip: '1.2.3.4', note: '宿舍 3 人', addedAt: 100 }]);

    await reopened.remove('1.2.3.4');
    expect(new SqliteIpAllowlist(db).has('1.2.3.4')).toBe(false);
  });
});

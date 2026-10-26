import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer } from '../ws';
import { defaultSession } from '../../../client/src/stores/session';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '../../../client/src/net/protocol';

/** 並行的認證請求受限制約束（`97-selfhosted-server.md` § 97.5） */
interface Client {
  sent: ServerMessage[];
  send(msg: ClientMessage): void;
}

describe('並行認證請求', () => {
  let db: DatabaseSync;
  let auth: AuthService;
  let fire: (socket: unknown, req: unknown) => void;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    auth = new AuthService(db);
    const config = { ...buildConfig(new Map(), '/tmp').config, bind: '0.0.0.0' };
    const server = new GameServer({ repo, auth, config: () => config, version: 'test', hostUsername: 'host', mode: 'open', leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }) });
    server.attach({ on: (_ev: string, handler: typeof fire) => { fire = handler; } } as never);
  });

  function connect(remoteAddress = '1.2.3.4'): Client {
    const handlers: Record<string, (raw: unknown) => void> = {};
    const client = { sent: [] as ServerMessage[] } as Client;
    fire({
      readyState: 1,
      OPEN: 1,
      on(ev: string, h: (raw: unknown) => void) { handlers[ev] = h; },
      send(raw: string) { client.sent.push(JSON.parse(raw) as ServerMessage); },
      close() {},
    }, { socket: { remoteAddress } });
    client.send = msg => handlers.message(JSON.stringify(msg));
    client.send({ t: 'hello', version: PROTOCOL_VERSION, release: 'test' });
    return client;
  }

  /** 回應依 `auth_ok` 或錯誤碼分組計數 */
  async function outcomes(clients: Client[], expected: number): Promise<Record<string, number>> {
    const results = () => clients.flatMap(c => c.sent).filter(m => m.t === 'auth_ok' || m.t === 'error');
    await vi.waitFor(() => expect(results()).toHaveLength(expected));
    const counts: Record<string, number> = {};
    for (const m of results()) {
      const key = m.t === 'error' ? m.code : m.t;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  it('同一連線一次送 30 則錯誤密碼：只驗證 5 次，其餘直接拒絕，之後鎖定', async () => {
    await auth.register('alice', 'alicepw1');
    const client = connect();
    for (let i = 0; i < 30; i++) client.send({ t: 'login', username: 'alice', password: 'wrongpass' });

    expect(await outcomes([client], 30)).toEqual({ invalid_credentials: 5, rate_limited: 25 });

    client.send({ t: 'login', username: 'alice', password: 'alicepw1' });
    await vi.waitFor(() => expect(client.sent.filter(m => m.t === 'error')).toHaveLength(31));
    expect(client.sent.some(m => m.t === 'auth_ok')).toBe(false);
  });

  it('同 IP 多條連線並行：合計只驗證 5 次', async () => {
    await auth.register('alice', 'alicepw1');
    const clients = Array.from({ length: 10 }, () => connect());
    for (const c of clients) for (let i = 0; i < 3; i++) c.send({ t: 'login', username: 'alice', password: 'wrongpass' });

    expect(await outcomes(clients, 30)).toEqual({ invalid_credentials: 5, rate_limited: 25 });
  });

  it('不同 IP 各自計數', async () => {
    await auth.register('alice', 'alicepw1');
    const a = connect('1.1.1.1');
    const b = connect('2.2.2.2');
    for (let i = 0; i < 10; i++) a.send({ t: 'login', username: 'alice', password: 'wrongpass' });
    await outcomes([a], 10);
    b.send({ t: 'login', username: 'alice', password: 'alicepw1' });

    await vi.waitFor(() => expect(b.sent.some(m => m.t === 'auth_ok')).toBe(true));
  });

  it('同 IP 註冊：第 3 個帳號被拒，其他 IP 不受影響', async () => {
    for (const name of ['user1', 'user2', 'user3']) {
      const c = connect();
      c.send({ t: 'register', username: name, password: 'password1' });
      await outcomes([c], 1);
    }
    expect(auth.findByUsername('user1')).not.toBeNull();
    expect(auth.findByUsername('user2')).not.toBeNull();
    expect(auth.findByUsername('user3')).toBeNull();

    const other = connect('5.6.7.8');
    other.send({ t: 'register', username: 'user4', password: 'password1' });
    expect(await outcomes([other], 1)).toEqual({ auth_ok: 1 });
  });

  it('同 IP 一次並行送 10 個註冊：只建立 2 個帳號', async () => {
    const clients = Array.from({ length: 10 }, (_, i) => {
      const c = connect();
      c.send({ t: 'register', username: `user${i}`, password: 'password1' });
      return c;
    });

    expect(await outcomes(clients, 10)).toEqual({ auth_ok: 2, rate_limited: 8 });
  });

  it('被拒的註冊（帳號已存在）不佔名額', async () => {
    await auth.register('taken', 'password1');
    for (let i = 0; i < 5; i++) {
      const c = connect();
      c.send({ t: 'register', username: 'taken', password: 'password1' });
      expect(await outcomes([c], 1)).toEqual({ username_taken: 1 });
    }
    const c = connect();
    c.send({ t: 'register', username: 'fresh', password: 'password1' });

    expect(await outcomes([c], 1)).toEqual({ auth_ok: 1 });
  });
});

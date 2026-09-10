import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate, DB_FILE } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { createAdminHandler } from '../admin';
import { GameServer } from '../ws';
import { buildConfig, type ServerConfig } from '../config';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession } from '../playerSession';

/** 管理介面 API（`97-selfhosted-server.md` § 97.8） */

interface Reply { status: number; body: any }

function fakeReq(method: string, token: string | null, body?: unknown): IncomingMessage {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
  return req as unknown as IncomingMessage;
}

function fakeRes(): { res: ServerResponse; reply: Reply } {
  const reply: Reply = { status: 0, body: null };
  const res = {
    writeHead(status: number) { reply.status = status; return this; },
    end(payload?: string) {
      // 管理頁回的是 HTML，其餘 API 一律 JSON
      if (!payload) { reply.body = null; return; }
      reply.body = payload.startsWith('{') ? JSON.parse(payload) : payload;
    },
  };
  return { res: res as unknown as ServerResponse, reply };
}

describe('管理介面 API', () => {
  let db: DatabaseSync;
  let auth: AuthService;
  let server: GameServer;
  let handler: ReturnType<typeof createAdminHandler>;
  let config: ServerConfig;
  let dataDir: string;
  let token: string;

  async function call(path: string, opts: { token?: string | null; body?: unknown; method?: string } = {}): Promise<Reply> {
    const { res, reply } = fakeRes();
    const authToken = opts.token === undefined ? token : opts.token;
    const handled = await handler(fakeReq(opts.method ?? (opts.body ? 'POST' : 'GET'), authToken, opts.body), res, new URL(`http://x${path}`));
    expect(handled).toBe(true);
    return reply;
  }

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'mayana-admin-'));
    db = openDatabase(join(dataDir, DB_FILE));
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    auth = new AuthService(db);
    config = { ...buildConfig(new Map(), dataDir).config, adminUser: 'ops', adminPassword: 'opspw123' };
    auth.ensureHost('host');
    server = new GameServer({ repo, auth, config: () => config, version: 'test', hostUsername: 'host', leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }) });
    handler = createAdminHandler({
      db, dataDir, dbPath: join(dataDir, DB_FILE), auth, server,
      stats: () => ({ samples: 1, avgMs: 0.5, p99Ms: 1, overruns: 0, lastMs: 0.5 }),
      config: () => config,
      setConfig: next => { config = next; },
      version: 'test',
    });
    const login = await call('/admin/api/login', { token: null, body: { username: 'ops', password: 'opspw123' } });
    token = login.body.token;
  });

  it('不是 /admin 的路徑不接手', async () => {
    const { res } = fakeRes();
    expect(await handler(fakeReq('GET', null), res, new URL('http://x/api/version'))).toBe(false);
  });

  it('管理頁本身不需要 token；API 一律要管理員憑證', async () => {
    const { res, reply } = fakeRes();
    await handler(fakeReq('GET', null), res, new URL('http://x/admin'));
    expect(reply.status).toBe(200);
    expect(String(reply.body)).toContain('管理介面');
    expect(await call('/admin/api/status', { token: null })).toMatchObject({ status: 401 });

    // 遊戲帳號不是管理員：帳號密碼對也登不進管理介面（§ 97.8）
    const player = await auth.register('player', 'playerpw');
    const playerToken = auth.issueSession(player.id);
    expect(await call('/admin/api/status', { token: playerToken })).toMatchObject({ status: 401 });
    expect((await call('/admin/api/login', { token: null, body: { username: 'player', password: 'playerpw' } })).status).toBe(401);
  });

  it('admin-password 留空時管理介面停用', async () => {
    config = { ...config, adminPassword: '' };
    expect((await call('/admin/api/login', { token: null, body: { username: 'ops', password: '' } })).status).toBe(403);
  });

  it('設定檔的憑證改掉，既有的管理登入立刻失效', async () => {
    expect((await call('/admin/api/status')).status).toBe(200);
    config = { ...config, adminPassword: 'rotated456' };
    expect((await call('/admin/api/status')).status).toBe(401);
  });

  it('狀態總覽帶 tick 耗時、連線數與 SQLite 檔大小', async () => {
    const reply = await call('/admin/api/status');
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ version: 'test', online: 0, connections: 0, instances: 0, bind: '127.0.0.1' });
    expect(reply.body.tick.avgMs).toBe(0.5);
    expect(reply.body.dbBytes).toBeGreaterThan(0);
  });

  it('玩家列表與踢除連線', async () => {
    const session = createPlayerSession(new SqliteRepository(db), '127.0.0.1', () => {});
    let closed = '';
    session.close = (_code, reason) => { closed = reason; };
    session.userId = 1;
    session.username = 'host';
    server.sessions.add(session);

    const list = await call('/admin/api/players');
    expect(list.body.players).toHaveLength(1);
    expect(list.body.players[0].username).toBe('host');

    const kick = await call('/admin/api/kick', { body: { connectionId: session.connectionId, reason: '測試' } });
    expect(kick.status).toBe(200);
    expect(closed).toBe('測試');
    expect((await call('/admin/api/kick', { body: { connectionId: 999 } })).status).toBe(404);
  });

  it('封鎖帳號會作廢 session 並解除封鎖', async () => {
    const user = await auth.register('bad', 'badpw123');
    const userToken = auth.issueSession(user.id);
    expect(await call('/admin/api/ban', { body: { userId: user.id } })).toMatchObject({ status: 200 });
    expect(auth.findById(user.id)!.bannedUntil).not.toBeNull();
    expect(auth.resolveSession(userToken)).toBeNull();
    await call('/admin/api/unban', { body: { userId: user.id } });
    expect(auth.findById(user.id)!.bannedUntil).toBeNull();
  });

  it('帳號列表與密碼重設；重設後舊 session 失效', async () => {
    const user = await auth.register('someone', 'oldpw123');
    const oldToken = auth.issueSession(user.id);
    const users = await call('/admin/api/users');
    expect(users.body.users.map((u: any) => u.username)).toEqual(['host', 'someone']);
    expect(users.body.registration).toBe('open');

    expect((await call('/admin/api/set-password', { body: { userId: user.id, password: 'short' } })).status).toBe(500);
    expect((await call('/admin/api/set-password', { body: { userId: user.id, password: 'newpw12345' } })).status).toBe(200);
    expect(auth.resolveSession(oldToken)).toBeNull();
    await expect(auth.login('someone', 'newpw12345')).resolves.toMatchObject({ username: 'someone' });
  });

  it('角色查詢是唯讀的：列表、搜尋、明細', async () => {
    db.prepare('INSERT INTO characters (user_id, uuid, name_key, data) VALUES (?, ?, ?, ?)')
      .run(1, 'uuid-1', '測試角', JSON.stringify({ name: '測試角', className: 'knight', level: 7, gold: 123, currentRegion: 'dawn-plains', createdAt: 1 }));
    const id = Number((db.prepare('SELECT id FROM characters').get() as { id: number }).id);
    db.prepare('INSERT INTO character_prefs (character_id, data) VALUES (?, ?)')
      .run(id, JSON.stringify({ statistics: { monstersKilled: 42 } }));

    const list = await call('/admin/api/characters');
    expect(list.body.characters[0]).toMatchObject({ name: '測試角', level: 7, gold: 123 });
    expect((await call('/admin/api/characters?q=不存在')).body.characters).toEqual([]);

    const detail = await call(`/admin/api/character?id=${id}`);
    expect(detail.body.character.name).toBe('測試角');
    expect(detail.body.statistics.monstersKilled).toBe(42);
    expect((await call('/admin/api/character?id=999')).status).toBe(404);
  });

  it('信箱補償：同一個 sourceKey 只發一次，可指定單一角色', async () => {
    for (const name of ['A', 'B']) {
      db.prepare('INSERT INTO characters (user_id, uuid, name_key, data) VALUES (?, ?, ?, ?)')
        .run(1, `uuid-${name}`, name.toLowerCase(), JSON.stringify({ name, className: 'knight', level: 1, gold: 0, currentRegion: 'neutral-town', createdAt: 1 }));
    }
    const first = await call('/admin/api/send-mail', { body: { title: '補償', sourceKey: 'comp-1', slotTier: 2 } });
    expect(first.body).toMatchObject({ sent: 2, targets: 2 });
    const again = await call('/admin/api/send-mail', { body: { title: '補償', sourceKey: 'comp-1', slotTier: 2 } });
    expect(again.body.sent).toBe(0);

    const one = Number((db.prepare('SELECT id FROM characters ORDER BY id').get() as { id: number }).id);
    const single = await call('/admin/api/send-mail', { body: { title: '單發', sourceKey: 'comp-2', slotTier: 1, characterId: one } });
    expect(single.body).toMatchObject({ sent: 1, targets: 1 });
    expect((await call('/admin/api/send-mail', { body: { title: '', sourceKey: 'x', slotTier: 1 } })).status).toBe(400);
    expect((await call('/admin/api/send-mail', { body: { title: 't', sourceKey: 'y', slotTier: 9 } })).status).toBe(400);

    const rows = db.prepare('SELECT character_id, source_key, data FROM mailbox ORDER BY id').all() as { character_id: number; source_key: string; data: string }[];
    expect(rows).toHaveLength(3);
    expect(JSON.parse(rows[0].data).items).toEqual([{ type: 'talent_slot', slotTier: 2 }]);
  });

  it('備份：WAL checkpoint 後複製到 backup-dir', async () => {
    const reply = await call('/admin/api/backup', { body: {} });
    expect(reply.status).toBe(200);
    expect(reply.body.file.startsWith(config.backupDir)).toBe(true);
    expect(reply.body.bytes).toBeGreaterThan(0);
  });

  it('設定頁：讀寫 server.properties，restart 的鍵回報需重啟', async () => {
    const read = await call('/admin/api/config');
    expect(read.body.keys.find((k: any) => k.key === 'port')).toMatchObject({ value: '25580', timing: 'restart' });

    const saved = await call('/admin/api/config/save', { body: { values: { 'exp-rate': '2', port: '25599' } } });
    expect(saved.body.needsRestart).toEqual(['port']);
    expect(config.expRate).toBe(2);
    expect(config.port).toBe(25599);

    const bad = await call('/admin/api/config/save', { body: { values: { port: '不是數字' } } });
    expect(bad.status).toBe(400);
  });
});

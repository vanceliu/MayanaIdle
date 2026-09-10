/**
 * 管理介面的 API（`97-selfhosted-server.md` § 97.8）。路由 `/admin`，與遊戲同一個 HTTP server。
 *
 * 身分沿用 § 97.5 的帳號密碼與 session token，另驗 admin 旗標。
 * 不做：改角色資料、改靜態模板、改資料目錄、由介面重啟（§ 97.8「不做」）。
 */
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { Character } from '../../client/src/models/character';
import type { Mail } from '../../client/src/models/mailbox';
import { normalizeStatistics } from '../../client/src/models/statistics';
import { randomBytes } from 'node:crypto';
import type { AuthService } from './auth';
import { CONFIG_SPECS, buildConfig, saveConfig, type ServerConfig } from './config';
import type { GameServer } from './ws';
import type { TickStats } from './tick';
import { adminPage } from './adminPage';
import { log } from './log';

export interface AdminDeps {
  db: DatabaseSync;
  dataDir: string;
  dbPath: string;
  auth: AuthService;
  server: GameServer;
  stats: () => TickStats;
  config: () => ServerConfig;
  setConfig: (config: ServerConfig) => void;
  version: string;
}

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
}

/**
 * 管理介面的登入（`97-selfhosted-server.md` § 97.8）。
 *
 * 憑證來自 `server.properties`，**不在 `users` 表裡** —— 管理員是開服者，不是玩家。
 * session 只存在記憶體：重啟即失效，這對一個管理介面來說是正確的預設。
 */
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

class AdminSessions {
  private readonly tokens = new Map<string, number>();

  issue(): string {
    const token = randomBytes(32).toString('hex');
    this.tokens.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
    return token;
  }

  valid(token: string): boolean {
    const expires = this.tokens.get(token);
    if (expires === undefined) return false;
    if (expires < Date.now()) {
      this.tokens.delete(token);
      return false;
    }
    return true;
  }

  /** 設定檔的憑證換過就把所有人請出去 */
  clear(): void {
    this.tokens.clear();
  }
}

export class AdminError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 256 * 1024) throw new AdminError(413, '請求內容過大');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Record<string, unknown>;
  } catch {
    throw new AdminError(400, '請求不是合法 JSON');
  }
}

export function createAdminHandler(deps: AdminDeps) {
  const routes = buildRoutes(deps);
  const sessions = new AdminSessions();
  let lastCredential = credentialOf(deps.config());

  return async function handleAdmin(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return false;

    // 管理頁本身不需要 token：登入表單就在頁面上
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(adminPage(deps.config().serverName, deps.version));
      return true;
    }

    try {
      // 憑證改過（管理介面自己改的設定也算）就作廢既有登入
      const credential = credentialOf(deps.config());
      if (credential !== lastCredential) {
        lastCredential = credential;
        sessions.clear();
      }

      if (url.pathname === '/admin/api/login') {
        const body = await readBody(req);
        const config = deps.config();
        if (!config.adminPassword) throw new AdminError(403, '尚未設定 admin-password，管理介面停用');
        if (String(body.username ?? '') !== config.adminUser || String(body.password ?? '') !== config.adminPassword) {
          throw new AdminError(401, '帳號或密碼錯誤');
        }
        json(res, 200, { token: sessions.issue(), username: config.adminUser });
        return true;
      }

      const route = routes[url.pathname];
      if (!route) throw new AdminError(404, '找不到這個 API');
      authorize(sessions, req);
      await route({ req, res, url });
    } catch (e) {
      const status = e instanceof AdminError ? e.status : 500;
      if (status >= 500) log.error(`admin ${url.pathname} failed`, e);
      json(res, status, { error: (e as Error).message });
    }
    return true;
  };
}

function credentialOf(config: ServerConfig): string {
  return `${config.adminUser}\u0000${config.adminPassword}`;
}

function authorize(sessions: AdminSessions, req: IncomingMessage): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new AdminError(401, '請先登入');
  if (!sessions.valid(token)) throw new AdminError(401, '登入已過期');
}

function buildRoutes(deps: AdminDeps): Record<string, (ctx: Ctx) => Promise<void>> {
  const { db, auth, server } = deps;

  const characterRow = (id: number): { row: { id: number; user_id: number; uuid: string; data: string }; char: Character } => {
    const row = db.prepare('SELECT id, user_id, uuid, data FROM characters WHERE id = ?').get(id) as { id: number; user_id: number; uuid: string; data: string } | undefined;
    if (!row) throw new AdminError(404, '找不到這個角色');
    return { row, char: { ...(JSON.parse(row.data) as Character), id: row.id } };
  };

  return {
    // ---------- 狀態總覽 ----------
    '/admin/api/status': async ({ res }) => {
      const config = deps.config();
      let dbBytes = 0;
      try {
        dbBytes = statSync(deps.dbPath).size;
      } catch {
        dbBytes = 0;
      }
      json(res, 200, {
        version: deps.version,
        serverName: config.serverName,
        bind: config.bind,
        port: config.port,
        online: server.onlineCount(),
        connections: server.sessions.size,
        instances: server.world.instances.count(),
        parties: server.world.parties.parties.size,
        maxPlayers: config.maxPlayers,
        dbBytes,
        tick: deps.stats(),
      });
    },

    // ---------- 玩家管理 ----------
    '/admin/api/players': async ({ res }) => {
      const players = [...server.sessions].map(s => {
        const ch = s.game.getState().character;
        return {
          connectionId: s.connectionId,
          userId: s.userId,
          username: s.username,
          remoteAddress: s.remoteAddress,
          characterId: ch?.id ?? null,
          characterName: ch?.name ?? null,
          level: ch?.level ?? null,
          regionId: ch?.currentRegion ?? null,
          floor: ch?.currentFloor ?? null,
          instanceKey: s.instance?.key ?? null,
          partyId: ch?.id ? server.world.parties.partyOf(ch.id)?.id ?? null : null,
        };
      });
      json(res, 200, { players });
    },

    '/admin/api/kick': async ({ req, res }) => {
      const body = await readBody(req);
      const connectionId = Number(body.connectionId);
      const target = [...server.sessions].find(s => s.connectionId === connectionId);
      if (!target) throw new AdminError(404, '找不到這個連線');
      await server.kick(target, String(body.reason ?? '被管理員踢除'));
      json(res, 200, { ok: true });
    },

    '/admin/api/ban': async ({ req, res }) => {
      const body = await readBody(req);
      const userId = Number(body.userId);
      if (!auth.findById(userId)) throw new AdminError(404, '找不到這個帳號');
      const until = body.until === null || body.until === undefined ? null : Number(body.until);
      auth.ban(userId, until);
      auth.revokeAllSessions(userId);
      const kicked = await server.kickUser(userId, '此帳號已被封鎖');
      json(res, 200, { ok: true, kicked });
    },

    '/admin/api/unban': async ({ req, res }) => {
      const body = await readBody(req);
      const userId = Number(body.userId);
      if (!auth.findById(userId)) throw new AdminError(404, '找不到這個帳號');
      auth.unban(userId);
      json(res, 200, { ok: true });
    },

    // ---------- 帳號管理 ----------
    '/admin/api/users': async ({ res }) => {
      const counts = new Map<number, number>();
      for (const r of db.prepare('SELECT user_id, COUNT(*) AS n FROM characters GROUP BY user_id').all() as { user_id: number; n: number }[]) {
        counts.set(r.user_id, r.n);
      }
      const online = new Set([...server.sessions].map(s => s.userId));
      json(res, 200, {
        users: auth.listUsers().map(u => ({
          id: u.id,
          username: u.username,
          hasPassword: u.hasPassword,
          bannedUntil: u.bannedUntil,
          characters: counts.get(u.id) ?? 0,
          online: online.has(u.id),
        })),
        registration: deps.config().registration,
      });
    },

    '/admin/api/set-password': async ({ req, res }) => {
      const body = await readBody(req);
      const userId = Number(body.userId);
      if (!auth.findById(userId)) throw new AdminError(404, '找不到這個帳號');
      await auth.setPassword(userId, String(body.password ?? ''));
      // 密碼重設後舊的 session 一律作廢，玩家下次登入生效（§ 97.8 操作規則）
      auth.revokeAllSessions(userId);
      json(res, 200, { ok: true });
    },

    // ---------- 角色查詢（唯讀） ----------
    '/admin/api/characters': async ({ res, url }) => {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const rows = db.prepare('SELECT id, user_id, uuid, data FROM characters ORDER BY id').all() as { id: number; user_id: number; uuid: string; data: string }[];
      const list = rows.map(r => {
        const c = JSON.parse(r.data) as Character;
        return { id: r.id, userId: r.user_id, uuid: r.uuid, name: c.name, className: c.className, level: c.level, regionId: c.currentRegion, gold: c.gold };
      }).filter(c => !q || c.name.toLowerCase().includes(q));
      json(res, 200, { characters: list });
    },

    '/admin/api/character': async ({ res, url }) => {
      const { row, char } = characterRow(Number(url.searchParams.get('id')));
      const bag = (db.prepare('SELECT data FROM character_bag WHERE character_id = ?').all(row.id) as { data: string }[])
        .map(b => JSON.parse(b.data) as { name?: string; itemTemplateId?: number; amount?: number });
      const equipment = (db.prepare('SELECT id, data FROM equipment_instances WHERE owner_id = ?').all(row.id) as { id: number; data: string }[])
        .map(e => ({ id: e.id, ...(JSON.parse(e.data) as Record<string, unknown>) }));
      const prefRow = db.prepare('SELECT data FROM character_prefs WHERE character_id = ?').get(row.id) as { data: string } | undefined;
      const prefs = prefRow ? JSON.parse(prefRow.data) as { statistics?: Record<string, number> } : {};
      json(res, 200, {
        character: {
          id: row.id, uuid: row.uuid, userId: row.user_id,
          name: char.name, className: char.className, level: char.level, exp: char.exp,
          gold: char.gold, regionId: char.currentRegion, floor: char.currentFloor,
          createdAt: char.createdAt, lastSeenAt: char.lastSeenAt ?? null,
        },
        bag,
        equipment,
        statistics: normalizeStatistics(prefs.statistics),
      });
    },

    // ---------- 信箱補償（`52-mailbox.md`） ----------
    '/admin/api/send-mail': async ({ req, res }) => {
      const body = await readBody(req);
      const title = String(body.title ?? '').trim();
      const sourceKey = String(body.sourceKey ?? '').trim();
      const tier = Number(body.slotTier ?? 1);
      if (!title) throw new AdminError(400, '標題不可為空');
      if (!sourceKey) throw new AdminError(400, 'sourceKey 不可為空');
      if (![1, 2, 3, 4].includes(tier)) throw new AdminError(400, '天賦格階級只能是 1~4');
      const targets: number[] = body.characterId
        ? [Number(body.characterId)]
        : (db.prepare('SELECT id FROM characters').all() as { id: number }[]).map(r => r.id);
      if (targets.length === 0) throw new AdminError(404, '沒有可發送的角色');

      // `sourceKey` 對 `characterId` 唯一，重複發放靠它擋（§ 52.7）
      const stmt = db.prepare('INSERT OR IGNORE INTO mailbox (character_id, source_key, data) VALUES (?, ?, ?)');
      let sent = 0;
      db.exec('BEGIN');
      try {
        for (const characterId of targets) {
          const mail: Mail = { characterId, sourceKey, title, items: [{ type: 'talent_slot', slotTier: tier as 1 | 2 | 3 | 4 }], createdAt: Date.now(), claimedAt: null };
          const { changes } = stmt.run(characterId, sourceKey, JSON.stringify({ ...mail, id: undefined }));
          sent += Number(changes);
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      // 在線的收件者要立刻看到信：refresh 會經 patch 鏡像回 client
      for (const session of server.sessions) {
        const id = session.game.getState().character?.id;
        if (id && targets.includes(id)) void session.mailbox.getState().refresh();
      }
      json(res, 200, { ok: true, sent, targets: targets.length });
    },

    // ---------- 備份 ----------
    '/admin/api/backup': async ({ res }) => {
      const dir = deps.config().backupDir;
      mkdirSync(dir, { recursive: true });
      // WAL checkpoint 後複製，不停服（§ 97.8 操作規則）
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = join(dir, `mayana-${stamp}.sqlite`);
      copyFileSync(deps.dbPath, file);
      json(res, 200, { ok: true, file, bytes: statSync(file).size });
    },

    '/admin/api/shutdown': async ({ res }) => {
      json(res, 200, { ok: true });
      log.info('管理介面要求 graceful shutdown');
      setTimeout(() => process.kill(process.pid, 'SIGTERM'), 100);
    },

    // ---------- 設定（`server.properties`） ----------
    '/admin/api/config': async ({ res }) => {
      const config = deps.config();
      json(res, 200, {
        keys: CONFIG_SPECS.map(s => ({
          key: s.key,
          timing: s.timing,
          value: s.format(config[s.field] as never),
        })),
      });
    },

    '/admin/api/config/save': async ({ req, res }) => {
      const body = await readBody(req);
      const entries = new Map<string, string>();
      const incoming = (body.values ?? {}) as Record<string, unknown>;
      for (const spec of CONFIG_SPECS) {
        const raw = incoming[spec.key];
        entries.set(spec.key, raw === undefined ? spec.format(deps.config()[spec.field] as never) : String(raw));
      }
      let next: ServerConfig;
      try {
        next = buildConfig(entries, deps.dataDir).config;
      } catch (e) {
        throw new AdminError(400, (e as Error).message);
      }
      const previous = deps.config();
      saveConfig(deps.dataDir, next);
      deps.setConfig(next);
      // `restart` 的鍵改了要標示需重啟（§ 97.8 設定頁）
      const needsRestart = CONFIG_SPECS
        .filter(s => s.timing === 'restart' && s.format(previous[s.field] as never) !== s.format(next[s.field] as never))
        .map(s => s.key);
      json(res, 200, { ok: true, needsRestart });
    },
  };
}

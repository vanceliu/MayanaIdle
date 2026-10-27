import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { LoginThrottle } from '../loginThrottle';
import { GameServer, PASSWORD_CHANGED_REASON } from '../ws';
import { defaultSession } from '../../../client/src/stores/session';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '../../../client/src/net/protocol';
import type { PlayerSession } from '../playerSession';

/** 救援碼、改密碼撤銷 session、登入嘗試限制（`97-selfhosted-server.md` § 97.5） */
interface Client {
  session: PlayerSession;
  sent: ServerMessage[];
  closedWith: number | null;
  send(msg: ClientMessage): void;
}

type AuthOk = Extract<ServerMessage, { t: 'auth_ok' }>;

describe('救援碼與登入保護', () => {
  let db: DatabaseSync;
  let auth: AuthService;
  let server: GameServer;
  let fire: (socket: unknown, req: unknown) => void;
  let config: ReturnType<typeof buildConfig>['config'];

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    auth = new AuthService(db);
    config = { ...buildConfig(new Map(), '/tmp').config, bind: '0.0.0.0' };
    server = new GameServer(
      { repo, auth, config: () => config, version: 'test', hostUsername: 'host', mode: 'open', leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }) },
      new LoginThrottle(),
    );
    server.attach({ on: (_ev: string, handler: typeof fire) => { fire = handler; } } as never);
  });

  function connect(remoteAddress = '1.2.3.4', headers: Record<string, string> = {}): Client {
    const handlers: Record<string, (raw: unknown) => void> = {};
    const client = { sent: [] as ServerMessage[], closedWith: null as number | null } as Client;
    const socket = {
      readyState: 1,
      OPEN: 1,
      on(ev: string, h: (raw: unknown) => void) { handlers[ev] = h; },
      send(raw: string) { client.sent.push(JSON.parse(raw) as ServerMessage); },
      close(code: number) { client.closedWith = code; },
    };
    fire(socket, { socket: { remoteAddress }, headers });
    client.session = [...server.sessions].at(-1)!;
    client.send = msg => handlers.message(JSON.stringify(msg));
    client.send({ t: 'hello', version: PROTOCOL_VERSION, release: 'test' });
    return client;
  }

  async function next<T extends ServerMessage['t']>(client: Client, t: T, from: number): Promise<Extract<ServerMessage, { t: T }>> {
    let found: ServerMessage | undefined;
    await vi.waitFor(() => {
      found = client.sent.slice(from).find(m => m.t === t || m.t === 'error');
      expect(found).toBeDefined();
    });
    if (found!.t !== t) throw new Error(`expected ${t}, got ${JSON.stringify(found)}`);
    return found as Extract<ServerMessage, { t: T }>;
  }

  async function request<T extends ServerMessage['t']>(client: Client, msg: ClientMessage, t: T) {
    const from = client.sent.length;
    client.send(msg);
    return next(client, t, from);
  }

  async function requestError(client: Client, msg: ClientMessage): Promise<Extract<ServerMessage, { t: 'error' }>> {
    const from = client.sent.length;
    client.send(msg);
    let found: ServerMessage | undefined;
    await vi.waitFor(() => {
      found = client.sent.slice(from).find(m => m.t === 'error' || m.t === 'auth_ok');
      expect(found).toBeDefined();
    });
    if (found!.t !== 'error') throw new Error(`expected error, got ${JSON.stringify(found)}`);
    return found as Extract<ServerMessage, { t: 'error' }>;
  }

  async function register(username: string, password: string): Promise<AuthOk> {
    return request(connect(), { t: 'register', username, password }, 'auth_ok');
  }

  it('註冊時發救援碼，auth_ok 帶 hasRecoveryCode', async () => {
    const ok = await register('alice', 'alicepw1');
    expect(ok.recoveryCode).toMatch(new RegExp(`^${ok.userId}-`));
    expect(ok.hasRecoveryCode).toBe(true);

    const login = await request(connect(), { t: 'login', username: 'alice', password: 'alicepw1' }, 'auth_ok');
    expect(login.hasRecoveryCode).toBe(true);
    expect(login.recoveryCode).toBeUndefined();
  });

  it('救援碼重設：設新密碼、撤銷全部 session、踢除在線連線、換發救援碼並登入', async () => {
    const reg = await register('bob', 'bobpw123');
    const other = connect('5.6.7.8');
    await request(other, { t: 'resume', token: reg.token }, 'auth_ok');

    const recover = connect('9.9.9.9');
    const ok = await request(recover, { t: 'recover', code: reg.recoveryCode!.toLowerCase(), password: 'newpass1' }, 'auth_ok');

    expect(ok.username).toBe('bob');
    expect(ok.recoveryCode).toBeDefined();
    expect(ok.recoveryCode).not.toBe(reg.recoveryCode);
    expect(other.sent.some(m => m.t === 'kicked' && m.reason === PASSWORD_CHANGED_REASON)).toBe(true);
    expect(auth.resolveSession(reg.token)).toBeNull();
    expect(auth.resolveSession(ok.token)?.username).toBe('bob');
    await expect(auth.login('bob', 'bobpw123')).rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(auth.login('bob', 'newpass1')).resolves.toMatchObject({ username: 'bob' });

    const reuse = await requestError(connect('9.9.9.8'), { t: 'recover', code: reg.recoveryCode!, password: 'another1' });
    expect(reuse.code).toBe('invalid_recovery_code');
  });

  it('新密碼不合規則先擋，不驗救援碼也不計失敗', async () => {
    const reg = await register('carol', 'carolpw1');
    const client = connect();
    for (let i = 0; i < 6; i++) {
      expect((await requestError(client, { t: 'recover', code: reg.recoveryCode!, password: '123' })).code).toBe('weak_password');
    }
    await request(client, { t: 'recover', code: reg.recoveryCode!, password: 'carolpw2' }, 'auth_ok');
  });

  it('被封鎖的帳號不能重設', async () => {
    const reg = await register('dave', 'davepw12');
    await auth.ban(reg.userId, null);
    const err = await requestError(connect(), { t: 'recover', code: reg.recoveryCode!, password: 'davepw34' });
    expect(err.code).toBe('banned');
  });

  it('沒有救援碼的帳號（既有帳號）重設失敗，產生後才能用', async () => {
    const user = await auth.register('erin', 'erinpw12');
    const bad = await requestError(connect(), { t: 'recover', code: `${user.id}-ABCD-EFGH-JKMN-PQRS`, password: 'erinpw34' });
    expect(bad.code).toBe('invalid_recovery_code');

    const client = connect();
    const login = await request(client, { t: 'login', username: 'erin', password: 'erinpw12' }, 'auth_ok');
    expect(login.hasRecoveryCode).toBe(false);
    expect((await requestError(client, { t: 'regenerate_recovery_code', current: 'wrong123' })).code).toBe('invalid_credentials');
    const { code } = await request(client, { t: 'regenerate_recovery_code', current: 'erinpw12' }, 'recovery_code');
    await request(connect(), { t: 'recover', code, password: 'erinpw34' }, 'auth_ok');
  });

  it('已有救援碼時，重新產生要驗目前的救援碼；知道密碼也換不掉', async () => {
    const reg = await register('fay', 'faypw123');
    const client = connect();
    await request(client, { t: 'resume', token: reg.token }, 'auth_ok');
    expect((await requestError(client, { t: 'regenerate_recovery_code', current: 'faypw123' })).code).toBe('invalid_recovery_code');
    await request(connect(), { t: 'recover', code: reg.recoveryCode!, password: 'faypw123' }, 'auth_ok');
    const owner = connect();
    const ownerOk = await request(owner, { t: 'login', username: 'fay', password: 'faypw123' }, 'auth_ok');
    expect(ownerOk.hasRecoveryCode).toBe(true);
  });

  it('重新產生救援碼後舊碼失效', async () => {
    const reg = await register('fay2', 'faypw123');
    const client = connect();
    await request(client, { t: 'resume', token: reg.token }, 'auth_ok');
    const { code } = await request(client, { t: 'regenerate_recovery_code', current: reg.recoveryCode! }, 'recovery_code');

    expect((await requestError(connect(), { t: 'recover', code: reg.recoveryCode!, password: 'faypw456' })).code).toBe('invalid_recovery_code');
    await request(connect(), { t: 'recover', code, password: 'faypw456' }, 'auth_ok');
  });

  it('host 帳號不發救援碼', async () => {
    const host = await auth.ensureHost('host');
    const client = connect();
    await request(client, { t: 'resume', token: await auth.issueSession(host.id) }, 'auth_ok');
    expect((await requestError(client, { t: 'regenerate_recovery_code', current: '' })).code).toBe('host_no_recovery');
  });

  it('改密碼撤銷其他 session 並踢除其他連線，保留目前這條', async () => {
    const reg = await register('gus', 'guspw123');
    const otherToken = await auth.issueSession(reg.userId);
    const current = connect();
    await request(current, { t: 'resume', token: reg.token }, 'auth_ok');
    const other = connect('5.6.7.8');
    await request(other, { t: 'resume', token: otherToken }, 'auth_ok');

    await request(current, { t: 'set_password', id: 1, current: 'guspw123', password: 'guspw456' }, 'action_ok');
    expect(other.sent.some(m => m.t === 'kicked' && m.reason === PASSWORD_CHANGED_REASON)).toBe(true);

    expect(other.closedWith).toBe(4000);
    expect(current.closedWith).toBeNull();
    expect(auth.resolveSession(otherToken)).toBeNull();
    expect(auth.resolveSession(reg.token)?.username).toBe('gus');
  });

  it('改密碼要驗目前的密碼或救援碼；驗證失敗不改密碼、不踢人', async () => {
    const reg = await register('kim', 'kimpw123');
    const current = connect();
    await request(current, { t: 'resume', token: reg.token }, 'auth_ok');
    const other = connect('5.6.7.8');
    await request(other, { t: 'resume', token: await auth.issueSession(reg.userId) }, 'auth_ok');

    expect((await requestError(current, { t: 'set_password', id: 1, current: 'wrong123', password: 'kimpw456' })).code).toBe('invalid_credentials');
    expect(other.sent.some(m => m.t === 'kicked')).toBe(false);
    await expect(auth.login('kim', 'kimpw123')).resolves.toMatchObject({ username: 'kim' });

    await request(current, { t: 'set_password', id: 2, current: reg.recoveryCode!, password: 'kimpw456' }, 'action_ok');
    await expect(auth.login('kim', 'kimpw456')).resolves.toMatchObject({ username: 'kim' });
  });

  it('改密碼與產生救援碼的驗證失敗也計入嘗試限制', async () => {
    const reg = await register('lee', 'leepw123');
    const client = connect('4.4.4.4');
    await request(client, { t: 'resume', token: reg.token }, 'auth_ok');
    for (let i = 0; i < 3; i++) await requestError(client, { t: 'set_password', current: 'wrong123', password: 'leepw456' });
    for (let i = 0; i < 2; i++) await requestError(client, { t: 'regenerate_recovery_code', current: 'wrong123' });
    expect((await requestError(client, { t: 'set_password', current: 'leepw123', password: 'leepw456' })).code).toBe('rate_limited');
  });

  it('同 IP 登入失敗 5 次即鎖定，正確密碼也被拒；其他 IP 不受影響', async () => {
    await register('hank', 'hankpw12');
    const client = connect('7.7.7.7');
    for (let i = 0; i < 5; i++) {
      expect((await requestError(client, { t: 'login', username: 'hank', password: 'wrong123' })).code).toBe('invalid_credentials');
    }
    expect((await requestError(client, { t: 'login', username: 'hank', password: 'hankpw12' })).code).toBe('rate_limited');
    await request(connect('8.8.8.8'), { t: 'login', username: 'hank', password: 'hankpw12' }, 'auth_ok');
  });

  it('登入與救援碼重設共用計數', async () => {
    const reg = await register('ivy', 'ivypw123');
    const client = connect('6.6.6.6');
    for (let i = 0; i < 3; i++) await requestError(client, { t: 'login', username: 'ivy', password: 'wrong123' });
    for (let i = 0; i < 2; i++) await requestError(client, { t: 'recover', code: `${reg.userId}-ABCD-EFGH-JKMN-PQRS`, password: 'ivypw456' });
    expect((await requestError(client, { t: 'recover', code: reg.recoveryCode!, password: 'ivypw456' })).code).toBe('rate_limited');
  });

  it('trust-proxy 開啟時依 X-Forwarded-For 分開計數；關閉時忽略該 header', async () => {
    await register('jack', 'jackpw12');
    const proxy = '10.0.0.1';
    const fail = async (client: Client) => (await requestError(client, { t: 'login', username: 'jack', password: 'wrong123' })).code;

    config.trustProxy = true;
    const a = connect(proxy, { 'x-forwarded-for': '1.1.1.1' });
    for (let i = 0; i < 5; i++) expect(await fail(a)).toBe('invalid_credentials');
    expect(await fail(a)).toBe('rate_limited');
    expect(a.session.clientAddress).toBe('1.1.1.1');
    await request(connect(proxy, { 'x-forwarded-for': '2.2.2.2' }), { t: 'login', username: 'jack', password: 'jackpw12' }, 'auth_ok');

    config.trustProxy = false;
    const b = connect(proxy, { 'x-forwarded-for': '3.3.3.3' });
    expect(b.session.clientAddress).toBe(proxy);
    for (let i = 0; i < 5; i++) expect(await fail(b)).toBe('invalid_credentials');
    expect(await fail(connect(proxy, { 'x-forwarded-for': '4.4.4.4' }))).toBe('rate_limited');
  });

  it('登出帳號：撤銷這條 session，連線回到未登入（`19-account-character.md` § 19.6）', async () => {
    const reg = await register('mia', 'miapw123');
    const client = connect();
    await request(client, { t: 'resume', token: reg.token }, 'auth_ok');
    client.send({ t: 'logout' });
    await vi.waitFor(() => expect(client.session.userId).toBeNull());
    expect(auth.resolveSession(reg.token)).toBeNull();
    expect((await requestError(client, { t: 'characters' })).code).toBe('unauthenticated');
  });

  it('schema v3 遷移補上 recovery_hash 欄位', () => {
    const columns = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(c => c.name);
    expect(columns).toContain('recovery_hash');
  });
});

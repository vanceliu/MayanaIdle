import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate, hashExistingSessionTokens } from '../db/sqlite';
import { AuthService, hashSessionToken } from '../auth';

/** session token 只存 SHA-256（`97-selfhosted-server.md` § 97.5） */
describe('session token 雜湊', () => {
  let db: DatabaseSync;
  let auth: AuthService;
  let userId: number;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    migrate(db);
    auth = new AuthService(db);
    userId = (await auth.register('alice', 'password1')).id;
  });

  const storedTokens = () => (db.prepare('SELECT token FROM sessions').all() as { token: string }[]).map(r => r.token);

  it('資料庫只存雜湊；明文 token 可登入，資料庫裡的值不能拿來登入', () => {
    const token = auth.issueSession(userId);

    expect(storedTokens()).toEqual([hashSessionToken(token)]);
    expect(storedTokens()).not.toContain(token);
    expect(auth.resolveSession(token)?.id).toBe(userId);
    expect(auth.resolveSession(storedTokens()[0])).toBeNull();
  });

  it('撤銷與「保留目前這條」都以明文 token 操作', () => {
    const keep = auth.issueSession(userId);
    const other = auth.issueSession(userId);

    auth.revokeOtherSessions(userId, keep);
    expect(auth.resolveSession(keep)?.id).toBe(userId);
    expect(auth.resolveSession(other)).toBeNull();

    auth.revokeSession(keep);
    expect(auth.resolveSession(keep)).toBeNull();
  });

  it('簽發時清掉過期列', () => {
    db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run('stale', userId, 0, 1);

    auth.issueSession(userId);

    expect(storedTokens()).not.toContain('stale');
  });

  it('非字串 token：不拋錯，回 null', () => {
    expect(auth.resolveSession(123 as never)).toBeNull();
  });

  it('v5 遷移：既有明文 token 原地雜湊，原 token 照常登入；過期列刪除', () => {
    const insert = db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
    insert.run('legacy-plain', userId, Date.now(), Date.now() + 60_000);
    insert.run('legacy-expired', userId, 0, 1);

    hashExistingSessionTokens(db);

    expect(storedTokens()).toEqual([hashSessionToken('legacy-plain')]);
    expect(auth.resolveSession('legacy-plain')?.id).toBe(userId);
  });
});

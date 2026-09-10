/**
 * 帳號與 session（`97-selfhosted-server.md` § 97.5）：username + password，argon2id；server 簽發 session token。
 */
import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { argon2id, argon2Verify } from 'hash-wasm';

/**
 * 遊戲帳號（`97-selfhosted-server.md` § 97.5）。
 * **沒有管理員旗標** —— 管理介面走設定檔的獨立憑證（§ 97.8），管理員不是玩家。
 */
export interface UserRecord {
  id: number;
  username: string;
  hasPassword: boolean;
  bannedUntil: number | null;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[A-Za-z0-9_\-.]{2,32}$/;

export function validUsername(name: string): boolean {
  return USERNAME_RE.test(name);
}

export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: randomBytes(16),
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'encoded',
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash });
  } catch {
    return false;
  }
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string | null;
  banned_until: number | null;
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    hasPassword: row.password_hash !== null,
    bannedUntil: row.banned_until,
  };
}

export class AuthService {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findByUsername(username: string): UserRecord | null {
    const row = this.db.prepare('SELECT id, username, password_hash, banned_until FROM users WHERE username = ?').get(username) as UserRow | undefined;
    return row ? toRecord(row) : null;
  }

  findById(id: number): UserRecord | null {
    const row = this.db.prepare('SELECT id, username, password_hash, banned_until FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? toRecord(row) : null;
  }

  listUsers(): UserRecord[] {
    return (this.db.prepare('SELECT id, username, password_hash, banned_until FROM users ORDER BY id').all() as unknown as UserRow[]).map(toRecord);
  }

  /**
   * 單機世界的 host 帳號：首次啟動自動建立，**不設密碼**。
   * 只有本機連得進來，而且單機世界永遠不會變成開放（§ 97.1），沒有密碼可保護的對象。
   */
  ensureHost(username: string): UserRecord {
    const existing = this.findByUsername(username);
    if (existing) return existing;
    this.db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, NULL, ?)').run(username, Date.now());
    return this.findByUsername(username)!;
  }

  async register(username: string, password: string): Promise<UserRecord> {
    if (!validUsername(username)) throw new AuthError('invalid_username', '帳號只能用英數字、_ - .，長度 2~32');
    if (password.length < 6) throw new AuthError('weak_password', '密碼至少 6 個字元');
    if (this.findByUsername(username)) throw new AuthError('username_taken', '帳號已存在');
    const hash = await hashPassword(password);
    this.db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run(username, hash, Date.now());
    return this.findByUsername(username)!;
  }

  async login(username: string, password: string): Promise<UserRecord> {
    const row = this.db.prepare('SELECT id, username, password_hash, banned_until FROM users WHERE username = ?').get(username) as UserRow | undefined;
    if (!row || row.password_hash === null) throw new AuthError('invalid_credentials', '帳號或密碼錯誤');
    if (!(await verifyPassword(password, row.password_hash))) throw new AuthError('invalid_credentials', '帳號或密碼錯誤');
    const user = toRecord(row);
    this.assertNotBanned(user);
    return user;
  }

  async setPassword(userId: number, password: string): Promise<void> {
    if (password.length < 6) throw new AuthError('weak_password', '密碼至少 6 個字元');
    const hash = await hashPassword(password);
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  }

  ban(userId: number, until: number | null): void {
    this.db.prepare('UPDATE users SET banned_until = ? WHERE id = ?').run(until ?? Number.MAX_SAFE_INTEGER, userId);
  }

  unban(userId: number): void {
    this.db.prepare('UPDATE users SET banned_until = NULL WHERE id = ?').run(userId);
  }

  assertNotBanned(user: UserRecord): void {
    if (user.bannedUntil !== null && user.bannedUntil > Date.now()) throw new AuthError('banned', '此帳號已被封鎖');
  }

  issueSession(userId: number): string {
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    this.db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, now, now + SESSION_TTL_MS);
    return token;
  }

  resolveSession(token: string): UserRecord | null {
    const row = this.db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as { user_id: number; expires_at: number } | undefined;
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.revokeSession(token);
      return null;
    }
    return this.findById(row.user_id);
  }

  revokeSession(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  revokeAllSessions(userId: number): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

export class AuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

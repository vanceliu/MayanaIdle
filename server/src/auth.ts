/**
 * 帳號與 session（`97-selfhosted-server.md` § 97.5）：username + password，argon2id；server 簽發 session token。
 */
import { log } from './log';
import { writeGateOf, type WriteGate } from './db/writeGate';
import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { argon2id, argon2Verify } from 'hash-wasm';
import { generateRecoveryCode, parseRecoveryCode } from './recoveryCode';

/**
 * 遊戲帳號（`97-selfhosted-server.md` § 97.5）。
 * **沒有管理員旗標** —— 管理介面走設定檔的獨立憑證（§ 97.8），管理員不是玩家。
 */
export interface UserRecord {
  id: number;
  username: string;
  hasPassword: boolean;
  hasRecoveryCode: boolean;
  bannedUntil: number | null;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USER_COLUMNS = 'id, username, password_hash, recovery_hash, banned_until';
const USERNAME_RE = /^[A-Za-z0-9_\-.]{2,32}$/;

export function validUsername(name: string): boolean {
  return USERNAME_RE.test(name);
}

export interface PasswordHashCost {
  iterations: number;
  /** KiB */
  memorySize: number;
}

/** 正式參數 */
export const PASSWORD_HASH_COST: PasswordHashCost = { iterations: 3, memorySize: 65536 };

let hashCost: PasswordHashCost = PASSWORD_HASH_COST;

/** 只供測試 setup 降低成本；雜湊字串自帶參數，驗證不受影響 */
export function setPasswordHashCost(cost: PasswordHashCost): void {
  hashCost = cost;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: randomBytes(16),
    parallelism: 1,
    iterations: hashCost.iterations,
    memorySize: hashCost.memorySize,
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
  recovery_hash: string | null;
  banned_until: number | null;
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    hasPassword: row.password_hash !== null,
    hasRecoveryCode: row.recovery_hash !== null,
    bannedUntil: row.banned_until,
  };
}

export class AuthService {
  private readonly db: DatabaseSync;
  /** 寫入一律走關卡：交易開著時不得併入別人的交易（`db/writeGate.ts`） */
  private readonly gate: WriteGate;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.gate = writeGateOf(db);
  }

  findByUsername(username: string): UserRecord | null {
    const row = this.db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ?`).get(username) as UserRow | undefined;
    return row ? toRecord(row) : null;
  }

  findById(id: number): UserRecord | null {
    const row = this.row(id);
    return row ? toRecord(row) : null;
  }

  private row(id: number): UserRow | undefined {
    return this.db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id) as UserRow | undefined;
  }

  listUsers(): UserRecord[] {
    return (this.db.prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY id`).all() as unknown as UserRow[]).map(toRecord);
  }

  /**
   * 單機世界的 host 帳號：首次啟動自動建立，**不設密碼**。
   * 只有本機連得進來，而且單機世界永遠不會變成開放（§ 97.1），沒有密碼可保護的對象。
   */
  async ensureHost(username: string): Promise<UserRecord> {
    const existing = this.findByUsername(username);
    if (existing) return existing;
    await this.gate.write(() => this.db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, NULL, ?)').run(username, Date.now()));
    return this.findByUsername(username)!;
  }

  async register(username: string, password: string): Promise<UserRecord> {
    if (!validUsername(username)) throw new AuthError('invalid_username', '帳號只能用英數字、_ - .，長度 2~32');
    assertPasswordStrength(password);
    if (this.findByUsername(username)) throw new AuthError('username_taken', '帳號已存在');
    const hash = await hashPassword(password);
    await this.gate.write(() => this.db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run(username, hash, Date.now()));
    return this.findByUsername(username)!;
  }

  async login(username: string, password: string): Promise<UserRecord> {
    const row = this.db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ?`).get(username) as UserRow | undefined;
    if (!row || row.password_hash === null) throw new AuthError('invalid_credentials', '帳號或密碼錯誤');
    if (!(await verifyPassword(password, row.password_hash))) throw new AuthError('invalid_credentials', '帳號或密碼錯誤');
    const user = toRecord(row);
    this.assertNotBanned(user);
    return user;
  }

  async setPassword(userId: number, password: string): Promise<void> {
    assertPasswordStrength(password);
    const hash = await hashPassword(password);
    await this.gate.write(() => this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId));
  }

  /** 產生新救援碼並取代舊的（§ 97.5）。回傳只顯示這一次的明碼 */
  async issueRecoveryCode(userId: number): Promise<string> {
    const { code, secret } = generateRecoveryCode(userId);
    const hash = await hashPassword(secret);
    await this.gate.write(() => this.db.prepare('UPDATE users SET recovery_hash = ? WHERE id = ?').run(hash, userId));
    return code;
  }

  /** 設定視窗改密碼（§ 97.5）：`current` 為目前的密碼或救援碼 */
  async changePassword(userId: number, current: string, newPassword: string): Promise<void> {
    assertPasswordStrength(newPassword);
    const row = this.row(userId);
    const parsed = parseRecoveryCode(current);
    const byRecovery = !!row?.recovery_hash && parsed?.userId === userId && await verifyPassword(parsed.secret, row.recovery_hash);
    const byPassword = !byRecovery && row?.password_hash != null && await verifyPassword(current, row.password_hash);
    if (!byRecovery && !byPassword) throw new AuthError('invalid_credentials', '目前的密碼或救援碼錯誤');
    await this.setPassword(userId, newPassword);
  }

  /** 設定視窗產生救援碼（§ 97.5）：已有救援碼要驗目前的救援碼，沒有則驗密碼 */
  async regenerateRecoveryCode(userId: number, current: string): Promise<string> {
    const row = this.row(userId);
    if (!row) throw new AuthError('invalid_credentials', '帳號不存在');
    if (row.recovery_hash !== null) {
      const parsed = parseRecoveryCode(current);
      if (!parsed || parsed.userId !== userId || !(await verifyPassword(parsed.secret, row.recovery_hash))) {
        throw new AuthError('invalid_recovery_code', '目前的救援碼錯誤');
      }
    } else if (row.password_hash === null || !(await verifyPassword(current, row.password_hash))) {
      throw new AuthError('invalid_credentials', '密碼錯誤');
    }
    return this.issueRecoveryCode(userId);
  }

  /** 以救援碼重設密碼（§ 97.5）：設新密碼、撤銷全部 session、換發救援碼 */
  async recover(code: string, newPassword: string): Promise<{ user: UserRecord; recoveryCode: string }> {
    assertPasswordStrength(newPassword);
    const parsed = parseRecoveryCode(code);
    if (!parsed) throw new AuthError('invalid_recovery_code', '救援碼錯誤');
    const row = this.row(parsed.userId);
    if (!row || row.recovery_hash === null) throw new AuthError('invalid_recovery_code', '救援碼錯誤');
    if (!(await verifyPassword(parsed.secret, row.recovery_hash))) throw new AuthError('invalid_recovery_code', '救援碼錯誤');
    this.assertNotBanned(toRecord(row));
    await this.setPassword(row.id, newPassword);
    await this.revokeAllSessions(row.id);
    const recoveryCode = await this.issueRecoveryCode(row.id);
    return { user: this.findById(row.id)!, recoveryCode };
  }

  async ban(userId: number, until: number | null): Promise<void> {
    await this.gate.write(() => this.db.prepare('UPDATE users SET banned_until = ? WHERE id = ?').run(until ?? Number.MAX_SAFE_INTEGER, userId));
  }

  async unban(userId: number): Promise<void> {
    await this.gate.write(() => this.db.prepare('UPDATE users SET banned_until = NULL WHERE id = ?').run(userId));
  }

  assertNotBanned(user: UserRecord): void {
    if (user.bannedUntil !== null && user.bannedUntil > Date.now()) throw new AuthError('banned', '此帳號已被封鎖');
  }

  /** 簽發 session；資料庫只存 token 的 SHA-256（§ 97.5），順手清掉過期列 */
  async issueSession(userId: number): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    await this.gate.atomic(() => {
      this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
      this.db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(hashSessionToken(token), userId, now, now + SESSION_TTL_MS);
    });
    return token;
  }

  resolveSession(token: string): UserRecord | null {
    if (typeof token !== 'string') return null;
    const row = this.db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(hashSessionToken(token)) as { user_id: number; expires_at: number } | undefined;
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.revokeSession(token).catch(e => log.error('revoke expired session failed', e));
      return null;
    }
    return this.findById(row.user_id);
  }

  async revokeSession(token: string): Promise<void> {
    await this.gate.write(() => this.db.prepare('DELETE FROM sessions WHERE token = ?').run(hashSessionToken(token)));
  }

  async revokeAllSessions(userId: number): Promise<void> {
    await this.gate.write(() => this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId));
  }

  async revokeOtherSessions(userId: number, keepToken: string): Promise<void> {
    await this.gate.write(() => this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(userId, hashSessionToken(keepToken)));
  }
}

/** session token 在資料庫中的形式（§ 97.5）：SHA-256 hex */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function assertPasswordStrength(password: string): void {
  if (password.length < 6) throw new AuthError('weak_password', '密碼至少 6 個字元');
}

export class AuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

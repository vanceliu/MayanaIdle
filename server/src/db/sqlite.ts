/**
 * SQLite（WAL）與遷移（`97-selfhosted-server.md` § 97.4、`18-data-schema.md` § 18.12）。
 * 遷移必須冪等；失敗即中止啟動。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { WorldMode } from '../../../client/src/net/protocol';

export const DB_FILE = 'mayana.sqlite';

const MIGRATIONS: ReadonlyArray<{ version: number; up: (db: DatabaseSync) => void }> = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT,
          banned_until INTEGER,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE TABLE IF NOT EXISTS characters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          uuid TEXT NOT NULL UNIQUE,
          season_id INTEGER NOT NULL DEFAULT 0,
          pool TEXT NOT NULL DEFAULT 'standard',
          -- 名稱唯一性的比對鍵（19-account-character.md § 19.4）：NFC 正規化後轉小寫
          name_key TEXT NOT NULL,
          data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_name ON characters(name_key);
        CREATE TABLE IF NOT EXISTS equipment_instances (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_id INTEGER NOT NULL,
          data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_equipment_owner ON equipment_instances(owner_id);
        CREATE TABLE IF NOT EXISTS character_bag (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          character_id INTEGER NOT NULL,
          item_template_id INTEGER,
          data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_bag_character ON character_bag(character_id);
        CREATE TABLE IF NOT EXISTS warehouses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          character_id INTEGER,
          storage_type TEXT NOT NULL,
          data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_warehouses_user ON warehouses(user_id);
        CREATE INDEX IF NOT EXISTS idx_warehouses_character ON warehouses(character_id);
        CREATE TABLE IF NOT EXISTS warehouse_gold (
          user_id INTEGER PRIMARY KEY,
          amount INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS talent_slots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          character_id INTEGER NOT NULL,
          data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_talent_character ON talent_slots(character_id);
        CREATE TABLE IF NOT EXISTS mailbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          character_id INTEGER NOT NULL,
          source_key TEXT NOT NULL,
          data TEXT NOT NULL,
          UNIQUE(character_id, source_key)
        );
        CREATE TABLE IF NOT EXISTS character_prefs (
          character_id INTEGER PRIMARY KEY,
          data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS bag_layouts (
          character_id INTEGER PRIMARY KEY,
          data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS mail_purge (
          character_id INTEGER PRIMARY KEY,
          version TEXT NOT NULL
        );
        -- 這個世界是單機還是開放，首次啟動時寫入後就不再變（97-selfhosted-server.md § 97.1）
        CREATE TABLE IF NOT EXISTS server_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    },
  },
];

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  return db;
}

export function currentSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null } | undefined;
  return row?.v ?? 0;
}

export function migrate(db: DatabaseSync): { from: number; to: number } {
  const from = currentSchemaVersion(db);
  let to = from;
  for (const m of MIGRATIONS) {
    if (m.version <= from) continue;
    db.exec('BEGIN');
    try {
      m.up(db);
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(m.version);
      db.exec('COMMIT');
      to = m.version;
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`schema migration v${m.version} failed: ${(e as Error).message}`);
    }
  }
  return { from, to };
}

export type { WorldMode };

const MODE_KEY = 'mode';
const MODE_LABEL: Record<WorldMode, string> = { solo: '單機', open: '開放' };

/**
 * 世界的形態一經建立即固定（`97-selfhosted-server.md` § 97.1）。
 *
 * 首次啟動依 `bind` 寫入；之後 `bind` 改成另一種形態一律**拒絕啟動**。
 * 單機世界是在「只有自己會連進來」的前提下養出來的：沒有帳號密碼、host 自動登入，
 * 直接對外等於把那個世界連同帳號一起曝出去，所以不能是「照常跑」。
 */
export function resolveWorldMode(db: DatabaseSync, current: WorldMode): WorldMode {
  const row = db.prepare('SELECT value FROM server_meta WHERE key = ?').get(MODE_KEY) as { value: string } | undefined;
  if (!row) {
    db.prepare('INSERT INTO server_meta (key, value) VALUES (?, ?)').run(MODE_KEY, current);
    return current;
  }
  const stored = row.value as WorldMode;
  if (stored !== current) {
    throw new Error(
      `這個資料目錄是${MODE_LABEL[stored]}世界，不能以${MODE_LABEL[current]}形態啟動。`
      + `${stored === 'solo' ? '單機世界沒有帳號密碼保護，改成開放等於直接曝出去。' : ''}`
      + `要開${MODE_LABEL[current]}世界請換一個乾淨的資料目錄（--data-dir）。`,
    );
  }
  return stored;
}

/**
 * 這個資料庫是不是這一版程式認得的形狀。
 *
 * 上線前 schema 還會直接改在 v1 上（不補遷移），所以舊資料目錄會缺欄位。
 * 不擋的話症狀會延到「建立角色時 SQLite 報 no such column」，看不出是資料目錄的問題。
 */
export function assertSchemaIntact(db: DatabaseSync): void {
  const columns = (db.prepare('PRAGMA table_info(characters)').all() as { name: string }[]).map(c => c.name);
  const missing = ['name_key', 'season_id', 'pool'].filter(c => !columns.includes(c));
  if (missing.length > 0) {
    throw new Error(`資料目錄是舊版 schema（characters 缺少 ${missing.join('、')}）。上線前不做遷移，請刪除資料目錄後重新啟動。`);
  }
}

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

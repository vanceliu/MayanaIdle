/**
 * SQLite（WAL）與遷移（`97-selfhosted-server.md` § 97.4、`18-data-schema.md` § 18.12）。
 * 遷移必須冪等；失敗即中止啟動。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { restrictFile } from '../secretFile';
import { dirname } from 'node:path';
import type { WorldMode } from '../../../client/src/net/protocol';
import { EQUIPMENT_SEEDS } from '../../../client/src/db/seed/equipmentSeeds';
import { getAbilityDefinition, getAbilityWeaponValue, resolveParamRange, type AbilityTemplate } from '../../../client/src/models/ability';

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
          created_at INTEGER NOT NULL,
          -- 救援碼雜湊（97-selfhosted-server.md § 97.5）。null ＝ 未產生
          recovery_hash TEXT
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
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
        -- 天賦分頁的格子位置（35-inventory-constraints.md § 35.21.1），與一般分頁分開
        CREATE TABLE IF NOT EXISTS talent_bag_layouts (
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
        -- 公會（11-guild.md）。guild_members.character_id 為主鍵：一個角色只屬一個公會（§ 11.5）
        CREATE TABLE IF NOT EXISTS guilds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          name_key TEXT NOT NULL UNIQUE,
          leader_character_id INTEGER NOT NULL,
          leader_cha INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          warehouse_gold INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS guild_members (
          character_id INTEGER PRIMARY KEY,
          guild_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          class_name TEXT NOT NULL,
          level INTEGER NOT NULL,
          joined_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON guild_members(guild_id);
        -- 公會倉庫（11-guild.md § 11.8）。裝備沿用 equipment_instances（storageType = 'guild'、owner_id 為公會 id）
        CREATE TABLE IF NOT EXISTS guild_warehouse_items (
          guild_id INTEGER NOT NULL,
          item_id INTEGER NOT NULL,
          amount INTEGER NOT NULL,
          PRIMARY KEY (guild_id, item_id)
        );
      `);
    },
  },
  {
    /** 追加傷害新區間（`07-affix-ability.md` § 7S.5）：既有追加傷害依舊區間內的位置換到新區間 */
    version: 12,
    up: rescaleBonusDamageAbilities,
  },
  {
    /** 命中燃燒改為專注打擊（`07-affix-ability.md` § 7S.5）：裝備與技能結晶換成專注打擊，位置取燃燒兩參數較高者 */
    version: 13,
    up: convertBurnToFocus,
  },
  {
    /** 競技場排行榜（`55-arena.md` § 55.7）：每角色每段位 × 單人／組隊一筆最佳紀錄 */
    version: 14,
    up: db => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS arena_records (
          character_id INTEGER NOT NULL,
          tier INTEGER NOT NULL,
          party INTEGER NOT NULL,
          name TEXT NOT NULL,
          class_name TEXT NOT NULL,
          wave INTEGER NOT NULL,
          time_ms INTEGER NOT NULL,
          achieved_at INTEGER NOT NULL,
          PRIMARY KEY (character_id, tier, party)
        );
        CREATE INDEX IF NOT EXISTS idx_arena_records_board ON arena_records(tier, party, wave DESC, time_ms);
      `);
    },
  },
];

/** v12 之前追加傷害的區間：A 5~10、B 5~武器值（上限 ≤ 5 時固定 5） */
function legacyBonusDamageRange(key: string, template: AbilityTemplate): [number, number] {
  return key === 'chance' ? [5, 10] : [5, Math.max(5, getAbilityWeaponValue(template))];
}

/** 舊區間內的位置換到新區間，依參數單位四捨五入；舊區間寬度 0 時位置為 0 */
export function rescaleBonusDamageParams(params: Record<string, number>, template: AbilityTemplate): Record<string, number> {
  const out = { ...params };
  for (const def of getAbilityDefinition('bonus_damage')!.params) {
    const value = params[def.key];
    if (value == null) continue;
    const [fromMin, fromMax] = legacyBonusDamageRange(def.key, template);
    const [toMin, toMax] = resolveParamRange(def, template);
    const ratio = fromMax > fromMin ? Math.min(1, Math.max(0, (value - fromMin) / (fromMax - fromMin))) : 0;
    const step = def.step ?? 1;
    out[def.key] = toMin + Math.round((ratio * (toMax - toMin)) / step) * step;
  }
  return out;
}

export function rescaleBonusDamageAbilities(db: DatabaseSync): void {
  const templates = new Map(EQUIPMENT_SEEDS.map(t => [t.id!, t]));
  const rows = db.prepare('SELECT id, data FROM equipment_instances').all() as { id: number; data: string }[];
  const update = db.prepare('UPDATE equipment_instances SET data = ? WHERE id = ?');
  for (const row of rows) {
    const data = JSON.parse(row.data) as { templateId?: number; ability?: { type?: string; params?: Record<string, number> } };
    if (data.ability?.type !== 'bonus_damage' || !data.ability.params) continue;
    const template = data.templateId != null ? templates.get(data.templateId) : undefined;
    if (!template) continue;
    const params = rescaleBonusDamageParams(data.ability.params, template);
    update.run(JSON.stringify({ ...data, ability: { ...data.ability, params } }), row.id);
  }
}

/** 命中燃燒的區間：A 5~10、B 5~武器值（上限 ≤ 5 時固定 5） */
function legacyBurnRange(key: string, template: AbilityTemplate): [number, number] {
  return key === 'chance' ? [5, 10] : [5, Math.max(5, getAbilityWeaponValue(template))];
}

/** 燃燒兩參數在原區間內位置的較高者；區間寬度 0 時位置為 0 */
export function burnPosition(params: Record<string, number>, template: AbilityTemplate): number {
  let best = 0;
  for (const key of ['chance', 'damage']) {
    const value = params[key];
    if (value == null) continue;
    const [min, max] = legacyBurnRange(key, template);
    if (max > min) best = Math.max(best, Math.min(1, Math.max(0, (value - min) / (max - min))));
  }
  return best;
}

/** 位置換到專注打擊的區間，依 0.1% 單位四捨五入 */
export function focusParamsAt(position: number): Record<string, number> {
  const def = getAbilityDefinition('focus_strike')!.params[0];
  const [min, max] = [def.min, def.max as number];
  return { [def.key]: min + Math.round(position * (max - min)) };
}

export function convertBurnToFocus(db: DatabaseSync): void {
  const templates = new Map(EQUIPMENT_SEEDS.map(t => [t.id!, t]));
  const gear = db.prepare('SELECT id, data FROM equipment_instances').all() as { id: number; data: string }[];
  const updateGear = db.prepare('UPDATE equipment_instances SET data = ? WHERE id = ?');
  for (const row of gear) {
    const data = JSON.parse(row.data) as { templateId?: number; ability?: { type?: string; params?: Record<string, number> } };
    if (data.ability?.type !== 'hit_burn') continue;
    const template = data.templateId != null ? templates.get(data.templateId) : undefined;
    const position = template && data.ability.params ? burnPosition(data.ability.params, template) : 0;
    updateGear.run(JSON.stringify({ ...data, ability: { type: 'focus_strike', params: focusParamsAt(position) } }), row.id);
  }

  const prefs = db.prepare('SELECT character_id, data FROM character_prefs').all() as { character_id: number; data: string }[];
  const updatePrefs = db.prepare('UPDATE character_prefs SET data = ? WHERE character_id = ?');
  for (const row of prefs) {
    const data = JSON.parse(row.data) as { abilityCrystals?: { type?: string; positions?: Record<string, number> }[] };
    if (!data.abilityCrystals?.some(c => c.type === 'hit_burn')) continue;
    const abilityCrystals = data.abilityCrystals.map(c => (c.type === 'hit_burn'
      ? { type: 'focus_strike', positions: { percent: Math.max(0, c.positions?.chance ?? 0, c.positions?.damage ?? 0) } }
      : c));
    updatePrefs.run(JSON.stringify({ ...data, abilityCrystals }), row.character_id);
  }
}

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // 收緊權限要在建 WAL 之前：SQLite 建 -wal／-shm 時沿用主檔權限
  if (path !== ':memory:') for (const file of [path, `${path}-wal`, `${path}-shm`]) restrictFile(file);
  db.exec('PRAGMA journal_mode = WAL');
  /*
   * WAL 下的常規設定：提交不再每次 fsync。
   * 資料庫不會因此損壞，最壞情況是主機**斷電**時掉最後幾筆已提交的交易 ——
   * 與 § 97.4「crash 最壞損失 5 秒進度」是同一個量級。
   */
  db.exec('PRAGMA synchronous = NORMAL');
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

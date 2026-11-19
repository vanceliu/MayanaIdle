/**
 * 星盤大改版的清檔遷移（`45-legacy-archive.md` § 45.1、§ 45.2）：
 * 所有角色、帳號倉庫、公會產生完整文字快照寫入 `legacy_archives`，再清空遊玩資料；帳號保留。
 */
import type { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { restrictFile } from '../secretFile';

/** 執行清檔的 schema 版本 */
export const LEGACY_RESET_VERSION = 15;

/** 清檔前把資料庫整份複製到備份目錄；回傳備份檔路徑 */
export function backupBeforeLegacyReset(db: DatabaseSync, dbPath: string, backupDir: string, now = new Date()): string {
  mkdirSync(backupDir, { recursive: true });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const file = join(backupDir, `mayana-before-star-chart-${now.toISOString().replace(/[:.]/g, '-')}.sqlite`);
  copyFileSync(dbPath, file);
  restrictFile(file);
  return file;
}

/** 清空的遊玩資料表；`users`、`sessions`、`server_meta`、`schema_version`、`legacy_archives` 保留 */
export const LEGACY_RESET_TABLES = [
  'characters', 'equipment_instances', 'character_bag', 'warehouses', 'warehouse_gold',
  'talent_slots', 'mailbox', 'character_prefs', 'bag_layouts', 'talent_bag_layouts', 'mail_purge',
  'guilds', 'guild_members', 'guild_warehouse_items', 'arena_records',
] as const;

type Row = Record<string, unknown>;
const parse = (rows: Row[]) => rows.map(r => ({ id: r.id, ...JSON.parse(String(r.data)) as Row }));

export function createLegacyArchiveTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS legacy_archives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      class_name TEXT,
      level INTEGER,
      data_version INTEGER NOT NULL,
      season INTEGER NOT NULL,
      archived_at INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_legacy_archives_user ON legacy_archives(user_id);
  `);
}

/** `dataVersion`：封存時的 server schema 版本；`season`：被封存的這一季（遺產頁以 `Season N` 分組） */
export function archiveAndResetForStarChart(db: DatabaseSync, dataVersion: number, season: number, now = Date.now()): void {
  createLegacyArchiveTable(db);
  const insertRow = db.prepare(`INSERT INTO legacy_archives
    (user_id, type, label, class_name, level, data_version, season, archived_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insert = {
    run: (userId: number, type: string, label: string, cls: string | null, level: number | null, version: number, at: number, payload: string) =>
      insertRow.run(userId, type, label, cls, level, version, season, at, payload),
  };
  const all = (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as Row[];

  // equipment_instances.owner_id 依 storageType 指向角色、帳號（shared）或公會（guild）
  const equipment: (Row & { ownerId: number })[] = all('SELECT id, owner_id, data FROM equipment_instances')
    .map(r => ({ ...JSON.parse(String(r.data)) as Row, id: r.id, ownerId: Number(r.owner_id) }));
  const ofCharacter = (id: number) => equipment.filter(e => e.ownerId === id && e.storageType !== 'shared' && e.storageType !== 'guild');
  const guildMembers = all('SELECT character_id, guild_id, name, class_name, level, joined_at FROM guild_members');
  const guilds = all('SELECT id, name, leader_character_id, created_at, warehouse_gold FROM guilds');

  for (const c of all('SELECT id, user_id, data FROM characters')) {
    const id = Number(c.id);
    const character = JSON.parse(String(c.data)) as Row;
    const membership = guildMembers.find(m => Number(m.character_id) === id);
    const guild = membership ? guilds.find(g => g.id === membership.guild_id) : undefined;
    const payload = {
      character,
      equipment: ofCharacter(id),
      bag: parse(all('SELECT id, data FROM character_bag WHERE character_id = ?', id)),
      personalWarehouse: parse(all("SELECT id, data FROM warehouses WHERE character_id = ? AND storage_type = 'personal'", id)),
      talentSlots: parse(all('SELECT id, data FROM talent_slots WHERE character_id = ?', id)),
      mail: parse(all('SELECT id, data FROM mailbox WHERE character_id = ?', id)),
      // 角色偏好含統計、技能結晶、競技場槽等遊玩資料（`18-data-schema.md` § 18.6）
      prefs: JSON.parse(String(all('SELECT data FROM character_prefs WHERE character_id = ?', id)[0]?.data ?? 'null')) as unknown,
      guild: guild ? { name: guild.name, role: Number(guild.leader_character_id) === id ? 'leader' : 'member' } : null,
      arena: all('SELECT tier, party, wave, time_ms, achieved_at FROM arena_records WHERE character_id = ?', id),
    };
    insert.run(Number(c.user_id), 'character', String(character.name ?? ''), String(character.className ?? ''),
      Number(character.level ?? 0), dataVersion, now, JSON.stringify(payload));
  }

  const userIds = new Set([
    ...all("SELECT DISTINCT user_id FROM warehouses WHERE storage_type = 'shared'").map(r => Number(r.user_id)),
    ...all('SELECT user_id FROM warehouse_gold WHERE amount > 0').map(r => Number(r.user_id)),
    ...equipment.filter(e => e.storageType === 'shared').map(e => e.ownerId),
  ]);
  for (const userId of userIds) {
    const payload = {
      items: parse(all("SELECT id, data FROM warehouses WHERE user_id = ? AND storage_type = 'shared'", userId)),
      equipment: equipment.filter(e => e.ownerId === userId && e.storageType === 'shared'),
      gold: Number(all('SELECT amount FROM warehouse_gold WHERE user_id = ?', userId)[0]?.amount ?? 0),
    };
    insert.run(userId, 'sharedWarehouse', '帳號倉庫', null, null, dataVersion, now, JSON.stringify(payload));
  }

  for (const g of guilds) {
    const leaderUser = all('SELECT user_id FROM characters WHERE id = ?', Number(g.leader_character_id))[0]?.user_id;
    if (leaderUser == null) continue;
    const gid = Number(g.id);
    const payload = {
      guild: { name: g.name, createdAt: g.created_at, gold: g.warehouse_gold },
      members: guildMembers.filter(m => Number(m.guild_id) === gid),
      items: all('SELECT item_id, amount FROM guild_warehouse_items WHERE guild_id = ?', gid),
      equipment: equipment.filter(e => e.ownerId === gid && e.storageType === 'guild'),
    };
    insert.run(Number(leaderUser), 'guild', String(g.name), null, null, dataVersion, now, JSON.stringify(payload));
  }

  for (const table of LEGACY_RESET_TABLES) db.exec(`DELETE FROM ${table}`);
}

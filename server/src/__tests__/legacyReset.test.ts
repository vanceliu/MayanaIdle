/**
 * 星盤大改版的清檔遷移（`45-legacy-archive.md` § 45.1、§ 45.2）。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, migrate, LATEST_SCHEMA_VERSION } from '../db/sqlite';
import { LEGACY_RESET_TABLES, LEGACY_RESET_VERSION, backupBeforeLegacyReset } from '../db/legacyReset';
import { SqliteRepository } from '../db/sqliteRepository';

const BEFORE_RESET = LEGACY_RESET_VERSION - 1;

/** v14 的世界：兩個帳號、三隻角色、帳號倉庫、一個公會 */
function seededWorld(path = ':memory:') {
  const db = openDatabase(path);
  migrate(db, BEFORE_RESET);
  const run = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).run(...args);
  run("INSERT INTO users (id, username, password_hash, created_at) VALUES (1, 'alice', 'x', 0), (2, 'bob', 'x', 0)");
  const char = (id: number, userId: number, name: string, level: number) => run(
    'INSERT INTO characters (id, user_id, uuid, name_key, data) VALUES (?, ?, ?, ?, ?)',
    id, userId, `u${id}`, name.toLowerCase(), JSON.stringify({ name, className: 'knight', level, gold: 100 * id, statistics: { kills: id } }),
  );
  char(10, 1, 'Alpha', 70);
  char(11, 1, 'Beta', 40);
  char(20, 2, 'Gamma', 55);
  // owner_id：角色 10 的裝備、帳號 1 的共用倉庫裝備、公會 1 的公會倉庫裝備（id 撞號也要分得開）
  run('INSERT INTO equipment_instances (owner_id, data) VALUES (?, ?)', 10, JSON.stringify({ templateId: 1, equipped: true }));
  run('INSERT INTO equipment_instances (owner_id, data) VALUES (?, ?)', 1, JSON.stringify({ templateId: 2, inStorage: true, storageType: 'shared' }));
  run('INSERT INTO equipment_instances (owner_id, data) VALUES (?, ?)', 1, JSON.stringify({ templateId: 3, inStorage: true, storageType: 'guild' }));
  run('INSERT INTO character_bag (character_id, item_template_id, data) VALUES (10, 1, ?)', JSON.stringify({ itemTemplateId: 1, amount: 5 }));
  run("INSERT INTO warehouses (user_id, character_id, storage_type, data) VALUES (1, 10, 'personal', ?)", JSON.stringify({ itemId: 7, amount: 2 }));
  run("INSERT INTO warehouses (user_id, character_id, storage_type, data) VALUES (1, NULL, 'shared', ?)", JSON.stringify({ itemId: 8, amount: 3 }));
  run('INSERT INTO warehouse_gold (user_id, amount) VALUES (1, 999)');
  run('INSERT INTO talent_slots (character_id, data) VALUES (10, ?)', JSON.stringify({ tier: 1 }));
  run("INSERT INTO mailbox (character_id, source_key, data) VALUES (10, 'k', ?)", JSON.stringify({ title: '補償' }));
  run('INSERT INTO character_prefs (character_id, data) VALUES (10, ?)', JSON.stringify({ statistics: { monstersKilled: 321 } }));
  run("INSERT INTO guilds (id, name, name_key, leader_character_id, leader_cha, created_at, warehouse_gold) VALUES (1, '星辰', '星辰', 20, 10, 5, 300)");
  run("INSERT INTO guild_members (character_id, guild_id, name, class_name, level, joined_at) VALUES (20, 1, 'Gamma', 'knight', 55, 5), (10, 1, 'Alpha', 'knight', 70, 6)");
  run('INSERT INTO guild_warehouse_items (guild_id, item_id, amount) VALUES (1, 9, 4)');
  run("INSERT INTO arena_records (character_id, tier, party, name, class_name, wave, time_ms, achieved_at) VALUES (10, 4, 0, 'Alpha', 'knight', 12, 9000, 1)");
  return db;
}

interface ArchiveRow { user_id: number; type: string; label: string; class_name: string | null; level: number | null; data_version: number; season: number; payload: string }
const archives = (db: ReturnType<typeof openDatabase>) =>
  (db.prepare('SELECT user_id, type, label, class_name, level, data_version, season, payload FROM legacy_archives ORDER BY id').all() as unknown as ArchiveRow[])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map(r => ({ ...r, payload: JSON.parse(r.payload) as any }));

describe('清檔遷移', () => {
  it('每隻角色封存完整快照：角色資料、裝備、背包、個人倉庫、天賦、信箱、公會、競技場', () => {
    const db = seededWorld();
    expect(migrate(db)).toEqual({ from: BEFORE_RESET, to: LATEST_SCHEMA_VERSION });
    const alpha = archives(db).find(a => a.label === 'Alpha')!;
    expect(alpha).toMatchObject({ user_id: 1, type: 'character', class_name: 'knight', level: 70, data_version: BEFORE_RESET, season: 0 });
    expect(alpha.payload.character).toMatchObject({ name: 'Alpha', gold: 1000, statistics: { kills: 10 } });
    expect(alpha.payload.equipment.map((e: { templateId: number }) => e.templateId)).toEqual([1]);
    expect(alpha.payload.bag).toHaveLength(1);
    expect(alpha.payload.personalWarehouse).toHaveLength(1);
    expect(alpha.payload.talentSlots).toHaveLength(1);
    expect(alpha.payload.mail[0]).toMatchObject({ title: '補償' });
    expect(alpha.payload.guild).toEqual({ name: '星辰', role: 'member' });
    expect(alpha.payload.arena[0]).toMatchObject({ tier: 4, wave: 12 });
    expect(alpha.payload.prefs).toEqual({ statistics: { monstersKilled: 321 } });
  });

  it('帳號倉庫歸該帳號；公會歸會長的帳號；沒有東西的帳號倉庫不封存', () => {
    const db = seededWorld();
    migrate(db);
    const list = archives(db);
    const shared = list.filter(a => a.type === 'sharedWarehouse');
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ user_id: 1, label: '帳號倉庫' });
    expect(shared[0].payload).toMatchObject({ gold: 999, items: [{ itemId: 8 }], equipment: [{ templateId: 2 }] });
    const guild = list.find(a => a.type === 'guild')!;
    expect(guild).toMatchObject({ user_id: 2, label: '星辰' });
    expect(guild.payload.members).toHaveLength(2);
    expect(guild.payload.items).toEqual([{ item_id: 9, amount: 4 }]);
    expect(guild.payload.equipment.map((e: { templateId: number }) => e.templateId)).toEqual([3]);
  });

  it('遊玩資料全部清空；帳號保留；角色名稱可重新使用', async () => {
    const db = seededWorld();
    migrate(db);
    for (const table of LEGACY_RESET_TABLES) {
      expect((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, table).toBe(0);
    }
    expect((db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n).toBe(2);
    expect(new SqliteRepository(db).nameTaken('Alpha')).toBe(false);
  });

  it('清檔前整份備份資料庫', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mayana-legacy-'));
    const dbPath = join(dir, 'game.sqlite');
    const db = seededWorld(dbPath);
    const file = backupBeforeLegacyReset(db, dbPath, join(dir, 'backups'), new Date(0));
    expect(existsSync(file)).toBe(true);
    const copy = openDatabase(file);
    expect((copy.prepare('SELECT COUNT(*) AS n FROM characters').get() as { n: number }).n).toBe(3);
  });
});

describe('遺產紀錄讀取（只看得到自己帳號的）', () => {
  it('列表、讀取、刪除都限定帳號', async () => {
    const db = seededWorld();
    migrate(db);
    const repo = new SqliteRepository(db);
    const mine = await repo.listLegacyArchives(1);
    expect(mine.map(a => a.label).sort()).toEqual(['Alpha', 'Beta', '帳號倉庫']);
    expect(mine[0]).not.toHaveProperty('payload');
    const alpha = mine.find(a => a.label === 'Alpha')!;
    expect(await repo.getLegacyArchive(alpha.id, 2)).toBeUndefined();
    expect(JSON.parse((await repo.getLegacyArchive(alpha.id, 1))!.payload).character.name).toBe('Alpha');
    expect(await repo.deleteLegacyArchive(alpha.id, 2)).toBe(false);
    expect(await repo.deleteLegacyArchive(alpha.id, 1)).toBe(true);
    expect((await repo.listLegacyArchives(1)).map(a => a.label)).not.toContain('Alpha');
  });
});

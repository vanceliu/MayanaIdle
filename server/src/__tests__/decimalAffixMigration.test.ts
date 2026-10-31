import { describe, it, expect } from 'vitest';
import { openDatabase, migrate, LATEST_SCHEMA_VERSION } from '../db/sqlite';

/** schema v9：百分比詞綴改小數連續區間（`07-affix.md` § 7.3、`97-selfhosted-server.md` § 97.4） */
describe('百分比詞綴小數區間遷移', () => {
  const OLD_AFFIXES = [
    { type: 'attack_power', tier: 1, value: 3 },
    { type: 'crit_rate', tier: 7, value: 19 },
    { type: 'defense', tier: 1, value: 3 },
    { type: 'magic_resist', tier: 1, value: 1, sealed: true },
    { type: 'max_hp', tier: 1, value: 15 },
    { type: 'bonus_attribute', tier: 0, value: 1, attribute: 'STR' },
  ];

  function seededAtV8() {
    const db = openDatabase(':memory:');
    migrate(db);
    db.prepare('DELETE FROM schema_version WHERE version >= 9').run();
    const insert = db.prepare('INSERT INTO equipment_instances (owner_id, data) VALUES (?, ?)');
    insert.run(1, JSON.stringify({ templateId: 1, quality: 10, affixes: OLD_AFFIXES }));
    insert.run(1, JSON.stringify({ templateId: 2, affixes: [{ type: 'attack_power', tier: 4, value: 12 }] }));
    return db;
  }

  const rows = (db: ReturnType<typeof openDatabase>) =>
    (db.prepare('SELECT id, data FROM equipment_instances ORDER BY id').all() as { id: number; data: string }[])
      .map(r => JSON.parse(r.data));

  it('超出新區間者夾回下限，其餘保留原值', () => {
    const db = seededAtV8();
    expect(migrate(db)).toEqual({ from: 8, to: LATEST_SCHEMA_VERSION });
    const [gear, inRange] = rows(db);
    expect(gear.affixes).toEqual([
      { type: 'attack_power', tier: 1, value: 3.1 },
      { type: 'crit_rate', tier: 7, value: 19 },
      { type: 'defense', tier: 1, value: 3.1 },
      { type: 'magic_resist', tier: 1, value: 1.1, sealed: true },
      { type: 'max_hp', tier: 1, value: 15 },
      { type: 'bonus_attribute', tier: 0, value: 1, attribute: 'STR' },
    ]);
    expect(gear.quality).toBe(10);
    expect(inRange).toEqual({ templateId: 2, affixes: [{ type: 'attack_power', tier: 4, value: 12 }] });
  });

  it('冪等：再跑一次不變', () => {
    const db = seededAtV8();
    migrate(db);
    const first = rows(db);
    expect(migrate(db)).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION });
    expect(rows(db)).toEqual(first);
  });
});

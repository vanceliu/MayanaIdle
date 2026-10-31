import { describe, it, expect } from 'vitest';
import { openDatabase, migrate, LATEST_SCHEMA_VERSION } from '../db/sqlite';
import { EVASION_TIERS } from '../../../client/src/models/affix';

/** schema v8：迴避改迴避值（`07-affix.md` § 7.3.1、`97-selfhosted-server.md` § 97.4） */
describe('迴避值遷移', () => {
  function seededAtV7() {
    const db = openDatabase(':memory:');
    migrate(db);
    db.prepare('DELETE FROM schema_version WHERE version >= 8').run();
    const insert = db.prepare('INSERT INTO equipment_instances (owner_id, data) VALUES (?, ?)');
    insert.run(1, JSON.stringify({
      templateId: 1, quality: 10,
      affixes: [{ type: 'evasion', tier: 7, value: 7 }, { type: 'defense', tier: 3, value: 8 }, { type: 'evasion', tier: 2, value: 2, sealed: true }],
    }));
    insert.run(1, JSON.stringify({ templateId: 2, affixes: [], uniqueAffix: { type: 'evasion', value: 9 } }));
    insert.run(1, JSON.stringify({ templateId: 3, affixes: [{ type: 'crit_rate', tier: 7, value: 20 }], uniqueAffix: { type: 'crit_rate', value: 22 } }));
    return db;
  }

  const rows = (db: ReturnType<typeof openDatabase>) =>
    (db.prepare('SELECT id, data FROM equipment_instances ORDER BY id').all() as { id: number; data: string }[])
      .map(r => JSON.parse(r.data));

  it('一般迴避詞綴依 tier 在新區間重骰（含封印詞綴），其他欄位不動', () => {
    const db = seededAtV7();
    expect(migrate(db)).toEqual({ from: 7, to: LATEST_SCHEMA_VERSION });
    const [gear] = rows(db);
    const [t7, defense, sealed] = gear.affixes;
    expect(t7.value).toBeGreaterThanOrEqual(EVASION_TIERS[6].min);
    expect(t7.value).toBeLessThanOrEqual(EVASION_TIERS[6].max);
    expect(sealed.value).toBeGreaterThanOrEqual(EVASION_TIERS[1].min);
    expect(sealed.value).toBeLessThanOrEqual(EVASION_TIERS[1].max);
    expect(sealed.sealed).toBe(true);
    expect(defense).toEqual({ type: 'defense', tier: 3, value: 8 });
    expect(gear.quality).toBe(10);
  });

  it('T7 獨有迴避 ×100，其他獨有詞綴與裝備不動', () => {
    const db = seededAtV7();
    migrate(db);
    const [, unique, other] = rows(db);
    expect(unique.uniqueAffix).toEqual({ type: 'evasion', value: 900 });
    expect(other).toEqual({ templateId: 3, affixes: [{ type: 'crit_rate', tier: 7, value: 20 }], uniqueAffix: { type: 'crit_rate', value: 22 } });
  });

  it('冪等：再跑一次不變', () => {
    const db = seededAtV7();
    migrate(db);
    const first = rows(db);
    expect(migrate(db)).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION });
    expect(rows(db)).toEqual(first);
  });
});

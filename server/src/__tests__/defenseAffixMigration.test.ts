import { describe, it, expect } from 'vitest';
import { openDatabase, migrate, LATEST_SCHEMA_VERSION } from '../db/sqlite';
import { DEFENSE_TIERS } from '../../../client/src/models/affix';

/** schema v10：防禦力詞綴專屬階級表（`07-affix.md` § 7.3.1、`97-selfhosted-server.md` § 97.4） */
describe('防禦力詞綴遷移', () => {
  function seededAtV9() {
    const db = openDatabase(':memory:');
    migrate(db);
    db.prepare('DELETE FROM schema_version WHERE version >= 10').run();
    const insert = db.prepare('INSERT INTO equipment_instances (owner_id, data) VALUES (?, ?)');
    insert.run(1, JSON.stringify({
      templateId: 1, quality: 10,
      affixes: [
        { type: 'defense', tier: 7, value: 16.5 },
        { type: 'heal_effect', tier: 3, value: 8 },
        { type: 'defense', tier: 2, value: 5, sealed: true },
      ],
    }));
    insert.run(1, JSON.stringify({ templateId: 2, affixes: [{ type: 'crit_rate', tier: 7, value: 20 }] }));
    return db;
  }

  const rows = (db: ReturnType<typeof openDatabase>) =>
    (db.prepare('SELECT id, data FROM equipment_instances ORDER BY id').all() as { id: number; data: string }[])
      .map(r => JSON.parse(r.data));

  it('防禦力詞綴依 tier 在新區間重骰（含封印詞綴），其他詞綴與欄位不動', () => {
    const db = seededAtV9();
    expect(migrate(db)).toEqual({ from: 9, to: LATEST_SCHEMA_VERSION });
    const [gear, other] = rows(db);
    const [t7, heal, sealed] = gear.affixes;
    expect(t7.tier).toBe(7);
    expect(t7.value).toBeGreaterThanOrEqual(DEFENSE_TIERS[6].min);
    expect(t7.value).toBeLessThanOrEqual(DEFENSE_TIERS[6].max);
    expect(sealed.value).toBeGreaterThanOrEqual(DEFENSE_TIERS[1].min);
    expect(sealed.value).toBeLessThanOrEqual(DEFENSE_TIERS[1].max);
    expect(sealed.sealed).toBe(true);
    expect(heal).toEqual({ type: 'heal_effect', tier: 3, value: 8 });
    expect(gear.quality).toBe(10);
    expect(other).toEqual({ templateId: 2, affixes: [{ type: 'crit_rate', tier: 7, value: 20 }] });
  });

  it('冪等：再跑一次不變', () => {
    const db = seededAtV9();
    migrate(db);
    const first = rows(db);
    expect(migrate(db)).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION });
    expect(rows(db)).toEqual(first);
  });
});

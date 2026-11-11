import { describe, it, expect } from 'vitest';
import { openDatabase, migrate, rescaleOnHitValue, LATEST_SCHEMA_VERSION } from '../db/sqlite';
import { ON_HIT_TIERS } from '../../../client/src/models/affix';

/** schema v11：受擊回復專屬階級表（`07-affix.md` § 7.3.1、`97-selfhosted-server.md` § 97.4） */
describe('受擊回復詞綴遷移', () => {
  function seededAtV10() {
    const db = openDatabase(':memory:');
    migrate(db);
    db.prepare('DELETE FROM schema_version WHERE version >= 11').run();
    const insert = db.prepare('INSERT INTO equipment_instances (owner_id, data) VALUES (?, ?)');
    insert.run(1, JSON.stringify({
      templateId: 1, quality: 10,
      affixes: [
        { type: 'on_hit_hp', tier: 7, value: 17, restorePercent: 2 },
        { type: 'heal_effect', tier: 3, value: 8 },
        { type: 'on_hit_mp', tier: 3, value: 7.5, restorePercent: 5, sealed: true },
      ],
    }));
    insert.run(1, JSON.stringify({ templateId: 2, affixes: [{ type: 'crit_rate', tier: 7, value: 20 }] }));
    return db;
  }

  const rows = (db: ReturnType<typeof openDatabase>) =>
    (db.prepare('SELECT id, data FROM equipment_instances ORDER BY id').all() as { id: number; data: string }[])
      .map(r => JSON.parse(r.data));

  it('舊表 Tier 內位置等比例換到新表：下限 → 下限、上限 → 上限、中間取到小數一位', () => {
    expect(rescaleOnHitValue(1, 3.1)).toBe(ON_HIT_TIERS[0].min);
    expect(rescaleOnHitValue(7, 17)).toBe(ON_HIT_TIERS[6].max);
    expect(rescaleOnHitValue(3, 7.5)).toBe(2.9);
    for (let tier = 1; tier <= 7; tier++) {
      for (let tenths = 31; tenths <= 170; tenths++) {
        const v = rescaleOnHitValue(tier, tenths / 10);
        expect(v).toBeGreaterThanOrEqual(ON_HIT_TIERS[tier - 1].min);
        expect(v).toBeLessThanOrEqual(ON_HIT_TIERS[tier - 1].max);
      }
    }
  });

  it('換算受擊回復詞綴並移除 restorePercent（含封印詞綴），其他詞綴與欄位不動', () => {
    const db = seededAtV10();
    expect(migrate(db)).toEqual({ from: 10, to: LATEST_SCHEMA_VERSION });
    const [gear, other] = rows(db);
    expect(gear.affixes).toEqual([
      { type: 'on_hit_hp', tier: 7, value: 7 },
      { type: 'heal_effect', tier: 3, value: 8 },
      { type: 'on_hit_mp', tier: 3, value: 2.9, sealed: true },
    ]);
    expect(gear.quality).toBe(10);
    expect(other).toEqual({ templateId: 2, affixes: [{ type: 'crit_rate', tier: 7, value: 20 }] });
  });

  it('冪等：再跑一次不變', () => {
    const db = seededAtV10();
    migrate(db);
    const first = rows(db);
    expect(migrate(db)).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION });
    expect(rows(db)).toEqual(first);
  });
});

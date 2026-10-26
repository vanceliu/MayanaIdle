import { describe, it, expect } from 'vitest';
import { openDatabase, migrate, LATEST_SCHEMA_VERSION } from '../db/sqlite';
import { getUniqueAffixPool } from '../../../client/src/models/uniqueAffix';
import { EQUIPMENT_SEEDS } from '../../../client/src/db/seed/equipmentSeeds';

/** schema v4：既有 T7 實例補抽獨有詞綴（`07-affix-tier7.md` § 7T.2、`97-selfhosted-server.md` § 97.4） */
describe('T7 獨有詞綴補抽遷移', () => {
  function seededAtV3() {
    const db = openDatabase(':memory:');
    migrate(db);
    db.prepare('DELETE FROM schema_version WHERE version >= 4').run();
    const insert = db.prepare('INSERT INTO equipment_instances (owner_id, data) VALUES (?, ?)');
    insert.run(1, JSON.stringify({ templateId: 1019, quality: 5, affixes: [{ type: 'crit_rate', tier: 7, value: 20 }] }));
    insert.run(1, JSON.stringify({ templateId: 687, quality: 0, affixes: [] }));
    insert.run(1, JSON.stringify({ templateId: 1019, affixes: [], uniqueAffix: { type: 'crit_rate', value: 21 } }));
    insert.run(1, JSON.stringify({ templateId: 1, affixes: [] }));
    return db;
  }

  const rows = (db: ReturnType<typeof openDatabase>) =>
    (db.prepare('SELECT id, data FROM equipment_instances ORDER BY id').all() as { id: number; data: string }[])
      .map(r => JSON.parse(r.data));

  it('沒有獨有詞綴的 T7 補抽一條，其他欄位不動', () => {
    const db = seededAtV3();
    expect(migrate(db)).toEqual({ from: 3, to: LATEST_SCHEMA_VERSION });
    const [sword, necklace] = rows(db);
    const swordTemplate = EQUIPMENT_SEEDS.find(t => t.id === 1019)!;
    const necklaceTemplate = EQUIPMENT_SEEDS.find(t => t.id === 687)!;
    expect(getUniqueAffixPool(swordTemplate)).toContain(sword.uniqueAffix.type);
    expect(getUniqueAffixPool(necklaceTemplate)).toContain(necklace.uniqueAffix.type);
    expect(sword.quality).toBe(5);
    expect(sword.affixes).toEqual([{ type: 'crit_rate', tier: 7, value: 20 }]);
  });

  it('已有的不重抽，非 T7 不加', () => {
    const db = seededAtV3();
    migrate(db);
    const [, , existing, nonT7] = rows(db);
    expect(existing.uniqueAffix).toEqual({ type: 'crit_rate', value: 21 });
    expect(nonT7.uniqueAffix).toBeUndefined();
  });

  it('冪等：再跑一次不變', () => {
    const db = seededAtV3();
    migrate(db);
    const first = rows(db);
    expect(migrate(db)).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION });
    expect(rows(db)).toEqual(first);
  });
});

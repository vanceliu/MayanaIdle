import { describe, it, expect } from 'vitest';
import { openDatabase, migrate, rescaleBonusDamageParams, LATEST_SCHEMA_VERSION } from '../db/sqlite';
import { EQUIPMENT_SEEDS } from '../../../client/src/db/seed/equipmentSeeds';
import { getAbilityWeaponValue } from '../../../client/src/models/ability';

/** schema v12：追加傷害新區間（`07-affix-ability.md` § 7S.5、`97-selfhosted-server.md` § 97.4） */
describe('追加傷害遷移', () => {
  const sword = EQUIPMENT_SEEDS.find(t => t.slot === 'rightHand' && t.tier === 7 && getAbilityWeaponValue(t) === 30)!;
  const weak = { slot: 'rightHand', tier: 3, smallMonsterDamage: 4, largeMonsterDamage: 3 };

  it('舊區間位置換到新區間：A 5~10 → 5~15、B 5~武器值 → 5~武器值×1.5', () => {
    expect(rescaleBonusDamageParams({ chance: 5, damage: 5 }, sword)).toEqual({ chance: 5, damage: 5 });
    expect(rescaleBonusDamageParams({ chance: 10, damage: 30 }, sword)).toEqual({ chance: 15, damage: 45 });
    expect(rescaleBonusDamageParams({ chance: 8, damage: 18 }, sword)).toEqual({ chance: 11, damage: 26 });
  });

  it('舊區間寬度 0（武器值 ≤ 5）時位置為 0', () => {
    expect(rescaleBonusDamageParams({ chance: 7, damage: 5 }, weak)).toEqual({ chance: 9, damage: 5 });
  });

  function seededAtV11() {
    const db = openDatabase(':memory:');
    migrate(db);
    db.prepare('DELETE FROM schema_version WHERE version >= 12').run();
    db.prepare('INSERT INTO schema_version (version) VALUES (11)').run();
    const insert = db.prepare('INSERT INTO equipment_instances (owner_id, data) VALUES (?, ?)');
    insert.run(1, JSON.stringify({ templateId: sword.id, quality: 10, ability: { type: 'bonus_damage', params: { chance: 10, damage: 30 } } }));
    insert.run(1, JSON.stringify({ templateId: sword.id, ability: { type: 'combo_strike', params: { every: 5, bonus: 50 } } }));
    insert.run(1, JSON.stringify({ templateId: sword.id, affixes: [] }));
    return db;
  }

  const rows = (db: ReturnType<typeof openDatabase>) =>
    (db.prepare('SELECT id, data FROM equipment_instances ORDER BY id').all() as { id: number; data: string }[])
      .map(r => JSON.parse(r.data));

  it('只換算追加傷害，其他技能與欄位不動', () => {
    const db = seededAtV11();
    expect(migrate(db)).toEqual({ from: 11, to: LATEST_SCHEMA_VERSION });
    const [bonus, combo, plain] = rows(db);
    expect(bonus).toEqual({ templateId: sword.id, quality: 10, ability: { type: 'bonus_damage', params: { chance: 15, damage: 45 } } });
    expect(combo.ability).toEqual({ type: 'combo_strike', params: { every: 5, bonus: 50 } });
    expect(plain).toEqual({ templateId: sword.id, affixes: [] });
  });

  it('冪等：再跑一次不變', () => {
    const db = seededAtV11();
    migrate(db);
    const first = rows(db);
    expect(migrate(db)).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION });
    expect(rows(db)).toEqual(first);
  });
});

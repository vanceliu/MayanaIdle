import { describe, it, expect } from 'vitest';
import { openDatabase, migrate, burnPosition, focusParamsAt, LATEST_SCHEMA_VERSION } from '../db/sqlite';
import { EQUIPMENT_SEEDS } from '../../../client/src/db/seed/equipmentSeeds';
import { getAbilityWeaponValue } from '../../../client/src/models/ability';

/** schema v13：命中燃燒改為專注打擊（`07-affix-ability.md` § 7S.5、`97-selfhosted-server.md` § 97.4） */
describe('命中燃燒 → 專注打擊遷移', () => {
  const sword = EQUIPMENT_SEEDS.find(t => t.slot === 'rightHand' && t.tier === 7 && getAbilityWeaponValue(t) === 30)!;
  const weak = { slot: 'rightHand', tier: 3, smallMonsterDamage: 4, largeMonsterDamage: 3 };

  it('位置取燃燒兩參數較高者，換到 0.5~1.5%（0.1% 單位）', () => {
    expect(burnPosition({ chance: 5, damage: 5 }, sword)).toBe(0);
    expect(burnPosition({ chance: 6, damage: 30 }, sword)).toBe(1);
    expect(burnPosition({ chance: 8, damage: 10 }, sword)).toBeCloseTo(0.6);
    expect(burnPosition({ chance: 5, damage: 5 }, weak)).toBe(0);
    expect(focusParamsAt(0)).toEqual({ percent: 5 });
    expect(focusParamsAt(1)).toEqual({ percent: 15 });
    expect(focusParamsAt(0.6)).toEqual({ percent: 11 });
    expect(focusParamsAt(0.44)).toEqual({ percent: 9 });
  });

  function seededAtV12() {
    const db = openDatabase(':memory:');
    migrate(db);
    db.prepare('DELETE FROM schema_version WHERE version >= 13').run();
    const insert = db.prepare('INSERT INTO equipment_instances (owner_id, data) VALUES (?, ?)');
    insert.run(1, JSON.stringify({ templateId: sword.id, quality: 10, ability: { type: 'hit_burn', params: { chance: 8, damage: 10 } } }));
    insert.run(1, JSON.stringify({ templateId: sword.id, ability: { type: 'bonus_damage', params: { chance: 15, damage: 45 } } }));
    const prefs = db.prepare('INSERT INTO character_prefs (character_id, data) VALUES (?, ?)');
    prefs.run(1, JSON.stringify({
      other: 1,
      abilityCrystals: [
        { type: 'hit_burn', positions: { chance: 0.2, damage: 0.7 } },
        { type: 'thorns', positions: { percent: 0.5 } },
      ],
    }));
    prefs.run(2, JSON.stringify({ abilityCrystals: [{ type: 'rage', positions: { decay: 1 } }] }));
    return db;
  }

  const rows = (db: ReturnType<typeof openDatabase>) => ({
    gear: (db.prepare('SELECT data FROM equipment_instances ORDER BY id').all() as { data: string }[]).map(r => JSON.parse(r.data)),
    prefs: (db.prepare('SELECT data FROM character_prefs ORDER BY character_id').all() as { data: string }[]).map(r => JSON.parse(r.data)),
  });

  it('裝備與結晶的命中燃燒換成專注打擊，其他技能與欄位不動', () => {
    const db = seededAtV12();
    expect(migrate(db)).toEqual({ from: 12, to: LATEST_SCHEMA_VERSION });
    const { gear, prefs } = rows(db);
    expect(gear[0]).toEqual({ templateId: sword.id, quality: 10, ability: { type: 'focus_strike', params: { percent: 11 } } });
    expect(gear[1].ability).toEqual({ type: 'bonus_damage', params: { chance: 15, damage: 45 } });
    expect(prefs[0]).toEqual({
      other: 1,
      abilityCrystals: [
        { type: 'focus_strike', positions: { percent: 0.7 } },
        { type: 'thorns', positions: { percent: 0.5 } },
      ],
    });
    expect(prefs[1]).toEqual({ abilityCrystals: [{ type: 'rage', positions: { decay: 1 } }] });
  });

  it('冪等：再跑一次不變', () => {
    const db = seededAtV12();
    migrate(db);
    const first = rows(db);
    expect(migrate(db)).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION });
    expect(rows(db)).toEqual(first);
  });
});

import { describe, it, expect } from 'vitest';
import { useWeaponList, useArmorList, getWikiEquipmentPath } from '../useWikiData';
import { EQUIPMENT_SEEDS } from '../../../db/seed';
import { OFFHAND_DEFENSE_TYPES, isOffhandDefenseType } from '../../../models/equipment';

/**
 * 盾牌／魔導書／臂甲的分類是**防具**（`06-equipment.md` § 副手裝備），
 * 因此 Wiki 列在防具頁、詳細頁走 `/wiki/armor/:name`。
 */
describe('Wiki 武器／防具分頁', () => {
  const weapons = useWeaponList();
  const armors = useArmorList();

  it('武器頁不含盾牌／魔導書／臂甲', () => {
    expect(weapons.filter(w => isOffhandDefenseType(w.type))).toEqual([]);
  });

  it('防具頁含全部盾牌／魔導書／臂甲', () => {
    for (const type of OFFHAND_DEFENSE_TYPES) {
      const seedCount = EQUIPMENT_SEEDS.filter(e => e.type === type).length;
      expect(seedCount).toBeGreaterThan(0);
      expect(armors.filter(a => a.type === type).length).toBe(seedCount);
    }
  });

  it('兩頁互斥且合起來涵蓋所有裝備', () => {
    expect(weapons.length + armors.length).toBe(EQUIPMENT_SEEDS.length);
    const armorNames = new Set(armors.map(a => a.name));
    expect(weapons.filter(w => armorNames.has(w.name))).toEqual([]);
  });

  it('副手防具的詳細頁連結指向防具頁', () => {
    const shield = EQUIPMENT_SEEDS.find(e => e.type === 'shield')!;
    const sword = EQUIPMENT_SEEDS.find(e => e.type === 'sword')!;
    const armor = EQUIPMENT_SEEDS.find(e => e.type === 'armor')!;

    expect(getWikiEquipmentPath(shield.name)).toBe(`/wiki/armor/${encodeURIComponent(shield.name)}`);
    expect(getWikiEquipmentPath(armor.name)).toBe(`/wiki/armor/${encodeURIComponent(armor.name)}`);
    expect(getWikiEquipmentPath(sword.name)).toBe(`/wiki/weapons/${encodeURIComponent(sword.name)}`);
  });
});

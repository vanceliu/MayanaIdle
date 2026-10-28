import { describe, it, expect } from 'vitest';
import { EQUIPMENT_SEEDS } from '../seed/equipmentSeeds';
import { buildWeaponSeeds, WEAPON_SPEC_TYPES } from '../seed/weaponSeedSpec';
import type { EquipmentTemplate } from '../../models/equipment';

describe('武器產生規格與 seed 一致（`weaponSeedSpec.ts`）', () => {
  const seedWeapons = EQUIPMENT_SEEDS.filter(e => WEAPON_SPEC_TYPES.has(e.type));
  const generated = buildWeaponSeeds(EQUIPMENT_SEEDS);

  it('產生的武器與 seed 的武器逐件、逐欄位相同', () => {
    expect(generated).toEqual(seedWeapons);
  });

  it('欄位順序與 seed 相同', () => {
    const keys = (list: EquipmentTemplate[]) => list.map(t => `${t.name}: ${Object.keys(t).join(',')}`);
    expect(keys(generated)).toEqual(keys(seedWeapons));
  });

  it('規格不含盾牌／魔導書／臂甲', () => {
    for (const type of ['shield', 'magicBook', 'armGuard']) expect(WEAPON_SPEC_TYPES.has(type)).toBe(false);
  });

  it('T6 同類型每隔一件可製作，只有第一件有前置', () => {
    const t6 = generated.filter(t => t.tier === 6);
    for (const type of new Set(t6.map(t => t.type))) {
      t6.filter(t => t.type === type).forEach((t, i) => {
        expect(t.acquireType, t.name).toBe(i % 2 === 0 ? 'craft' : 'drop_only');
        expect(t.craftPrerequisiteWeapon != null, t.name).toBe(i === 0);
      });
    }
  });

  it('新武器的售價與配方材料為空值，待後續腳本填入', () => {
    const fresh = buildWeaponSeeds(EQUIPMENT_SEEDS.filter(e => e.name !== '月牙雙刀'))
      .find(t => t.name === '月牙雙刀');
    expect(fresh?.buyPrice).toBe(0);
    expect(fresh?.craftMaterials).toEqual([]);
    expect(fresh?.craftPrerequisiteWeapon).toEqual({ templateId: 1124, quantity: 1 });
  });
});

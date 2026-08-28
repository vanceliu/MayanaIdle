// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { getWeaponAttributeBonus } from '../../systems/combat';
import { isRangedWeapon } from '../../models/equipment';
import type { EquipmentInstance } from '../../models/equipment';
import type { Attributes } from '../../models/attributes';

const attrs = (p: Partial<Attributes> = {}): Attributes =>
  ({ STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0, ...p });

const weapon = (type: string) =>
  ({ type, slot: 'rightHand' } as unknown as EquipmentInstance);

/**
 * `21-combat-formula.md` § 21.3。詳細狀態面板與戰鬥必須算出同一個屬性加成 ——
 * 面板原本自己寫了一份 `floor(effectiveSTR / 2)`，妖精拿弓時會與實際傷害對不上。
 */
describe('詳細狀態的普攻屬性加成與戰鬥一致', () => {
  const a = attrs({ STR: 30, AGI: 21 });

  it('弓走敏捷，不是力量', () => {
    expect(isRangedWeapon('bow')).toBe(true);
    expect(getWeaponAttributeBonus(weapon('bow'), a)).toBe(10); // 有效AGI 21 / 2
  });

  it('近戰武器走力量', () => {
    for (const t of ['sword', 'axe', 'mace', 'staff', 'dualBlade', 'claw']) {
      expect(isRangedWeapon(t)).toBe(false);
      expect(getWeaponAttributeBonus(weapon(t), a)).toBe(15); // 有效STR 30 / 2
    }
  });
});

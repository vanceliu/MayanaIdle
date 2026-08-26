import { describe, it, expect } from 'vitest';
import { getTotalDefense } from '../combat';
import type { EquipmentInstance, EquipSlot } from '../../models/equipment';

/**
 * 強化計入防禦的條件（`21-combat-formula.md` § 21.5）：看裝備分類，不看基礎防禦數值。
 * T4 上衣的基礎防禦是 0（`06-equipment.md` § 6A.8.9），防禦全部來自強化 ——
 * 用「defense > 0」當條件的話那 4 點會靜默消失。
 */
function gear(
  slot: EquipSlot, type: string, defense: number, enhancement: number,
): EquipmentInstance {
  return {
    templateId: 1, name: `${slot}-test`, type, slot, isTwoHanded: false,
    defense, enhancement, quality: 0, affixes: [], ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

describe('強化計入防禦的分類判斷（§ 21.5）', () => {
  it('基礎防禦 0 的上衣，強化照樣給防禦', () => {
    expect(getTotalDefense([gear('shirt', 'armor', 0, 4)])).toBe(4);
  });

  it('有基礎防禦的防具＝基礎＋強化', () => {
    expect(getTotalDefense([gear('cloak', 'armor', 7, 4)])).toBe(11);
    expect(getTotalDefense([gear('chest', 'armor', 14, 4)])).toBe(18);
  });

  it('副手防具（盾牌／魔導書／臂甲）計入', () => {
    expect(getTotalDefense([gear('leftHand', 'shield', 8, 4)])).toBe(12);
    expect(getTotalDefense([gear('leftHand', 'magicBook', 8, 4)])).toBe(12);
    expect(getTotalDefense([gear('leftHand', 'armGuard', 8, 4)])).toBe(12);
  });

  it('飾品不計入 —— 強化走 § 6.10.1 的魔抗與數值倍率', () => {
    expect(getTotalDefense([gear('necklace', 'armor', 0, 8)])).toBe(0);
    expect(getTotalDefense([gear('ring1', 'armor', 0, 8)])).toBe(0);
    expect(getTotalDefense([gear('ring2', 'armor', 0, 8)])).toBe(0);
  });

  it('武器不計入 —— 武器強化不產生防禦', () => {
    expect(getTotalDefense([gear('rightHand', 'sword', 0, 8)])).toBe(0);
    expect(getTotalDefense([gear('rightHand', 'staff', 0, 8)])).toBe(0);
  });
});

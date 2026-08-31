import { describe, it, expect } from 'vitest';
import { getEffectiveDefense, getUnclampedDefense, BASE_CHARACTER_DEFENSE } from '../combat';
import type { EquipmentInstance } from '../../models/equipment';

const armor = (defense: number, over: Partial<EquipmentInstance> = {}): EquipmentInstance => ({
  templateId: 1, name: 'x', type: 'armor', slot: 'chest', isTwoHanded: false,
  defense, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true, ...over,
} as EquipmentInstance);

/**
 * `21-combat-formula.md` § 21.5：戰鬥用的最終防禦夾底於 0，
 * 但面板顯示未夾底 —— 新手裝一整套仍在負值區，夾底顯示會讓前幾件防具看起來沒作用。
 */
describe('防禦的顯示值與戰鬥值', () => {
  it('裸裝：顯示 -10，戰鬥用 0', () => {
    expect(getUnclampedDefense([], [], 0)).toBe(BASE_CHARACTER_DEFENSE);
    expect(getEffectiveDefense([], [], 0)).toBe(0);
  });

  it('負值區內每件防具都看得到變化（顯示值），戰鬥值仍是 0', () => {
    expect(getUnclampedDefense([armor(3)], [], 0)).toBe(-7);
    expect(getUnclampedDefense([armor(3), armor(2, { slot: 'helmet' })], [], 0)).toBe(-5);
    expect(getEffectiveDefense([armor(3)], [], 0)).toBe(0);
    expect(getEffectiveDefense([armor(3), armor(2, { slot: 'helmet' })], [], 0)).toBe(0);
  });

  it('超過起始防禦後兩者一致', () => {
    expect(getUnclampedDefense([armor(25)], [], 0)).toBe(15);
    expect(getEffectiveDefense([armor(25)], [], 0)).toBe(15);
  });

  it('三段組成與防禦力%都算進顯示值', () => {
    // (9 基礎 + 2 隨機 + 5 強化) × 1.5 = 24 → 24 - 10 = 14
    const item = armor(9, { defenseBonus: 2, enhancement: 5 });
    expect(getUnclampedDefense([item], [], 50)).toBe(14);
  });
});

import { describe, it, expect } from 'vitest';
import {
  ARMOR_REQUIREMENT_LADDER,
  areAffixesActive,
  getArmorRequirement,
  getItemDefense,
  meetsAttributeRequirement,
  resolveActiveGear,
  rollArmorStability,
  rollDefenseBonus,
} from '../equipment';
import type { EquipmentInstance } from '../equipment';
import type { Attributes } from '../character';
import { collectAffixAttributes } from '../affix';

const ZERO: Attributes = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
const attrs = (partial: Partial<Attributes>): Attributes => ({ ...ZERO, ...partial });

function armor(over: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    templateId: 1, name: 'x', type: 'armor', slot: 'chest', isTwoHanded: false,
    quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true, ...over,
  } as EquipmentInstance;
}

/** `06-equipment.md` § 6A.8.8 */
describe('防具素質需求（§ 6A.8.8）', () => {
  it('需求階梯：主需求 T2~T7 為 10/12/14/16/18/24，第二需求 T4 起為 12/14/16/18', () => {
    expect(ARMOR_REQUIREMENT_LADDER.slice(2).map(l => l.primary)).toEqual([10, 12, 14, 16, 18, 24]);
    expect(ARMOR_REQUIREMENT_LADDER.slice(2).map(l => l.secondary)).toEqual([0, 0, 12, 14, 16, 18]);
  });

  it('路線決定看哪個屬性：布=INT/SPI、輕=AGI/VIT、重=STR/VIT', () => {
    expect(getArmorRequirement('robe', 7)).toEqual({ INT: 24, SPI: 18 });
    expect(getArmorRequirement('light', 7)).toEqual({ AGI: 24, VIT: 18 });
    expect(getArmorRequirement('heavy', 7)).toEqual({ STR: 24, VIT: 18 });
  });

  it('T2~T3 只有主需求，T1 新手裝完全無需求', () => {
    expect(getArmorRequirement('heavy', 3)).toEqual({ STR: 12 });
    expect(getArmorRequirement('heavy', 1)).toEqual({});
  });

  it('每個屬性都要達標才算滿足', () => {
    const req = getArmorRequirement('heavy', 7);
    expect(meetsAttributeRequirement(req, attrs({ STR: 24, VIT: 18 }))).toBe(true);
    expect(meetsAttributeRequirement(req, attrs({ STR: 24, VIT: 17 }))).toBe(false);
    expect(meetsAttributeRequirement(undefined, ZERO)).toBe(true);
  });
});

describe('需求判定的最小固定點（§ 6A.8.8）', () => {
  it('無需求的裝備一律生效', () => {
    const w = armor({ slot: 'rightHand' });
    expect(resolveActiveGear([w], ZERO).has(w)).toBe(true);
  });

  it('A 撐起 B：A 給的屬性算進 B 的需求', () => {
    const a = armor({ requiredAttributes: { STR: 10 }, affixes: [{ type: 'bonus_attribute', tier: 0, value: 1, attribute: 'STR' }] });
    const b = armor({ requiredAttributes: { STR: 11 } });
    const active = resolveActiveGear([a, b], attrs({ STR: 10 }));
    expect(active.has(a)).toBe(true);
    expect(active.has(b)).toBe(true);
  });

  it('判定結果與穿戴順序無關', () => {
    const a = armor({ requiredAttributes: { STR: 10 }, affixes: [{ type: 'bonus_attribute', tier: 0, value: 1, attribute: 'STR' }] });
    const b = armor({ requiredAttributes: { STR: 11 } });
    const forward = resolveActiveGear([a, b], attrs({ STR: 10 }));
    const backward = resolveActiveGear([b, a], attrs({ STR: 10 }));
    expect(forward.size).toBe(backward.size);
    expect(backward.has(b)).toBe(true);
  });

  it('兩件互相認證不成立：起算值不含任何裝備', () => {
    const a = armor({ requiredAttributes: { STR: 1 }, affixes: [{ type: 'bonus_attribute', tier: 0, value: 1, attribute: 'AGI' }] });
    const b = armor({ requiredAttributes: { AGI: 1 }, affixes: [{ type: 'bonus_attribute', tier: 0, value: 1, attribute: 'STR' }] });
    const active = resolveActiveGear([a, b], ZERO);
    expect(active.has(a)).toBe(false);
    expect(active.has(b)).toBe(false);
  });

  it('需求未滿足時詞綴凍結，但件本身仍在裝備欄上', () => {
    const item = armor({ requiredAttributes: { STR: 24 } });
    const active = resolveActiveGear([item], attrs({ STR: 10 }));
    expect(areAffixesActive(item, active)).toBe(false);
  });

  it('凍結的件不貢獻額外屬性，撐不起下一件', () => {
    const a = armor({ requiredAttributes: { STR: 99 }, affixes: [{ type: 'bonus_attribute', tier: 0, value: 1, attribute: 'AGI' }] });
    const b = armor({ requiredAttributes: { AGI: 1 } });
    const active = resolveActiveGear([a, b], ZERO);
    expect(active.has(b)).toBe(false);
  });
});

describe('防禦的三段組成（§ 6A.8.8）', () => {
  it('基礎 + 隨機額外 + 強化', () => {
    expect(getItemDefense({ defense: 9, defenseBonus: 2, enhancement: 5 })).toBe(16);
  });

  it('基礎防禦 0 的防具（T4 上衣）照樣吃隨機額外與強化', () => {
    expect(getItemDefense({ defense: 0, defenseBonus: 1, enhancement: 4 })).toBe(5);
  });

  it('隨機額外落在 0~2，安定值落在 4~6', () => {
    const bonuses = new Set<number>();
    const stabilities = new Set<number>();
    for (let i = 0; i < 500; i++) {
      bonuses.add(rollDefenseBonus());
      stabilities.add(rollArmorStability());
    }
    expect([...bonuses].sort()).toEqual([0, 1, 2]);
    expect([...stabilities].sort()).toEqual([4, 5, 6]);
  });
});

describe('額外屬性詞綴的加總（§ 7.3.1）', () => {
  it('同屬性跨件相加', () => {
    const gear = [
      { affixes: [{ type: 'bonus_attribute' as const, tier: 0, value: 1, attribute: 'STR' as const }] },
      { affixes: [{ type: 'bonus_attribute' as const, tier: 0, value: 1, attribute: 'STR' as const }] },
      { affixes: [{ type: 'bonus_attribute' as const, tier: 0, value: 1, attribute: 'INT' as const }] },
    ];
    expect(collectAffixAttributes(gear)).toEqual({ STR: 2, INT: 1 });
  });
});

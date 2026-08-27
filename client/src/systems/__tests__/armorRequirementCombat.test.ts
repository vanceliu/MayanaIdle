import { describe, it, expect } from 'vitest';
import { getTotalDefense, getWeaponAttributeBonus, getAffixBonusesFromGear } from '../combat';
import { getEffectiveGear, getEffectiveGearArray, getFrozenGear, isGearRequirementMet } from '../gear';
import { rollNewInstanceFields } from '../templateSync';
import { getTotalAttributes } from '../../models/character';
import { getHpRegen, getMpRegen } from '../regen';
import type { Character } from '../../models/character';
import type { Attributes } from '../../models/attributes';
import type { EquipmentInstance } from '../../models/equipment';
import type { Affix } from '../../models/affix';

const attrs = (p: Partial<Attributes> = {}): Attributes =>
  ({ STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0, ...p });

function character(over: Partial<Attributes> = {}): Character {
  return {
    id: 1, userId: 1, name: 'T', className: 'knight', level: 50, exp: 0, expToNext: 0,
    hp: 100, maxHp: 100, mp: 50, maxMp: 50,
    baseAttributes: attrs(over), bonusAttributes: attrs(), unspentAttributePoints: 0,
  } as Character;
}

function armor(over: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    templateId: 1, name: 'x', type: 'armor', slot: 'chest', isTwoHanded: false,
    quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true, ...over,
  } as EquipmentInstance;
}

const weapon = (type: string) => armor({ slot: 'rightHand', type: type as never });

/** `21-combat-formula.md` § 21.5 */
describe('防禦的三段組成', () => {
  it('基礎 + 隨機額外 + 強化', () => {
    expect(getTotalDefense([armor({ defense: 9, defenseBonus: 2, enhancement: 5 })])).toBe(16);
  });

  it('基礎 0 的防具（T4 上衣）照樣吃隨機額外與強化', () => {
    expect(getTotalDefense([armor({ slot: 'shirt', defense: 0, defenseBonus: 1, enhancement: 4 })])).toBe(5);
  });

  it('飾品的隨機額外與強化都不計入（走 § 6.10.1）', () => {
    expect(getTotalDefense([armor({ slot: 'necklace', defense: 0, defenseBonus: 2, enhancement: 8 })])).toBe(0);
  });

  it('素質需求未滿足時三段照算 —— 凍結的只有詞綴', () => {
    const item = armor({ defense: 9, defenseBonus: 2, enhancement: 5, requiredAttributes: { STR: 99 } });
    const gear = getEffectiveGear(character(), [], [item]);
    expect(getTotalDefense(gear)).toBe(16);
  });
});

/** § 21.3 */
describe('普攻的屬性加成', () => {
  const a = attrs({ STR: 20, AGI: 21 });

  it('近戰吃力量：有效力量 / 2', () => {
    expect(getWeaponAttributeBonus(weapon('sword'), a)).toBe(10);
    expect(getWeaponAttributeBonus(weapon('dualBlade'), a)).toBe(10);
    expect(getWeaponAttributeBonus(weapon('claw'), a)).toBe(10);
  });

  it('遠程（弓）吃敏捷：有效敏捷 / 2', () => {
    // 有效敏捷走每 3 點門檻：21 → 21，/2 取整 = 10
    expect(getWeaponAttributeBonus(weapon('bow'), a)).toBe(10);
    // 22 落回 21，仍是 10；力量 22 則是 11 —— 遠程的邊際比較鈍
    expect(getWeaponAttributeBonus(weapon('bow'), attrs({ AGI: 22 }))).toBe(10);
    expect(getWeaponAttributeBonus(weapon('sword'), attrs({ STR: 22 }))).toBe(11);
  });

  it('沒有武器時退回力量', () => {
    expect(getWeaponAttributeBonus(null, a)).toBe(10);
  });
});

/** `06-equipment.md` § 6A.8.8 */
describe('素質需求未滿足時詞綴凍結', () => {
  const defenseAffix: Affix[] = [{ type: 'defense', tier: 7, value: 17 }];

  it('凍結的件不貢獻詞綴加成', () => {
    const item = armor({ defense: 10, affixes: defenseAffix, requiredAttributes: { STR: 99 } });
    const gear = getEffectiveGear(character({ STR: 10 }), [], [item]);
    expect(getAffixBonusesFromGear(gear as EquipmentInstance[]).defense).toBe(0);
  });

  it('滿足需求就照常生效', () => {
    const item = armor({ defense: 10, affixes: defenseAffix, requiredAttributes: { STR: 10 } });
    const gear = getEffectiveGear(character({ STR: 10 }), [], [item]);
    expect(getAffixBonusesFromGear(gear as EquipmentInstance[]).defense).toBe(17);
  });

  it('凍結的件不貢獻額外屬性，也撐不起下一件', () => {
    const giver = armor({
      requiredAttributes: { STR: 99 },
      affixes: [{ type: 'bonus_attribute', tier: 0, value: 1, attribute: 'AGI' }],
    });
    const taker = armor({ slot: 'helmet', requiredAttributes: { AGI: 1 } });
    const char = character();
    expect(getTotalAttributes(char, [], getEffectiveGear(char, [], [giver, taker])).AGI).toBe(0);
    expect(isGearRequirementMet(char, [], [giver, taker], taker)).toBe(false);
  });

  it('A 撐起 B：A 的額外屬性詞綴讓 B 解凍', () => {
    const giver = armor({
      requiredAttributes: { STR: 10 },
      affixes: [{ type: 'bonus_attribute', tier: 0, value: 1, attribute: 'AGI' }],
    });
    const taker = armor({ slot: 'helmet', requiredAttributes: { AGI: 1 }, affixes: defenseAffix });
    const char = character({ STR: 10 });
    expect(isGearRequirementMet(char, [], [giver, taker], taker)).toBe(true);
    const gear = getEffectiveGear(char, [], [giver, taker]);
    expect(getAffixBonusesFromGear(gear as EquipmentInstance[]).defense).toBe(17);
  });

  it('沒有任何件帶需求時回傳原陣列，不產生新物件', () => {
    const list = [armor({ defense: 5 })];
    expect(getEffectiveGear(character(), [], list)).toBe(list);
  });

  it('getEffectiveGearArray 吃的是裝備欄物件', () => {
    const item = armor({ affixes: defenseAffix, requiredAttributes: { STR: 99 } });
    const out = getEffectiveGearArray(character(), [], { chest: item, helmet: null });
    expect(out).toHaveLength(1);
    expect(out[0].affixes).toEqual([]);
  });
});

/** `06-equipment.md` § 6A.8.8：拔掉撐住需求的那件會連鎖 */
describe('凍結的連鎖', () => {
  const giver = (attr: 'STR', req: number) => armor({
    slot: 'gloves', requiredAttributes: { STR: req },
    affixes: [{ type: 'bonus_attribute', tier: 0, value: 1, attribute: attr }],
  });

  it('拔掉撐住需求的那件，下游整串跟著凍結', () => {
    const char = character({ STR: 22 });
    const g1 = giver('STR', 18);
    const g2 = { ...giver('STR', 18), slot: 'boots' } as EquipmentInstance;
    const t1 = armor({ slot: 'chest', requiredAttributes: { STR: 24 } });
    const t2 = armor({ slot: 'helmet', requiredAttributes: { STR: 24 } });

    // 22 + 兩件各 +1 = 24，兩件 T7 都解鎖
    expect(getFrozenGear(char, [], [g1, g2, t1, t2]).size).toBe(0);
    // 少一件支撐 → 只剩 23，兩件 T7 一起凍結
    expect([...getFrozenGear(char, [], [g2, t1, t2])]).toEqual([t1, t2]);
  });

  it('連鎖可以多層：A 撐 B、B 撐 C', () => {
    const char = character({ STR: 10 });
    const a = armor({ slot: 'gloves', requiredAttributes: { STR: 10 },
      affixes: [{ type: 'bonus_attribute', tier: 0, value: 1, attribute: 'STR' }] });
    const b = armor({ slot: 'boots', requiredAttributes: { STR: 11 },
      affixes: [{ type: 'bonus_attribute', tier: 0, value: 1, attribute: 'STR' }] });
    const c = armor({ slot: 'chest', requiredAttributes: { STR: 12 } });

    expect(getFrozenGear(char, [], [a, b, c]).size).toBe(0);
    // 抽掉最底層的 A，B 與 C 一起垮
    expect([...getFrozenGear(char, [], [b, c])]).toEqual([b, c]);
  });
});

/** `06-equipment.md` § 6.10 */
describe('安定值的取得管道分流', () => {
  const armorTpl = (acquireType: string) =>
    ({ slot: 'chest', type: 'armor', acquireType } as never);

  it('商店防具固定 4，不抽', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) seen.add(rollNewInstanceFields(armorTpl('shop')).stability!);
    expect([...seen]).toEqual([4]);
  });

  it('製作與掉落的防具抽 4~6', () => {
    for (const src of ['craft', 'drop_only']) {
      const seen = new Set<number>();
      for (let i = 0; i < 300; i++) seen.add(rollNewInstanceFields(armorTpl(src)).stability!);
      expect([...seen].sort()).toEqual([4, 5, 6]);
    }
  });

  it('模板有安定值就照抄，也不給隨機額外防禦（武器／飾品／腰帶／新手裝）', () => {
    expect(rollNewInstanceFields({ slot: 'rightHand', type: 'sword', stability: 6 } as never))
      .toEqual({ stability: 6 });
    expect(rollNewInstanceFields({ slot: 'belt', type: 'armor', stability: -1 } as never))
      .toEqual({ stability: -1 });
  });

  it('防具的隨機額外防禦一律抽 0~2，不分管道', () => {
    for (const src of ['shop', 'craft', 'drop_only']) {
      const seen = new Set<number>();
      for (let i = 0; i < 300; i++) seen.add(rollNewInstanceFields(armorTpl(src)).defenseBonus!);
      expect([...seen].sort()).toEqual([0, 1, 2]);
    }
  });
});

/** `29-regen.md` § 29.1~29.2 */
describe('回血／回魔詞綴接進自然回復', () => {
  const char = character({ VIT: 10, SPI: 10 });

  it('詞綴的固定值加算至裝備回復加總', () => {
    const item = armor({ affixes: [{ type: 'hp_regen', tier: 7, value: 12 }] });
    // 基礎 = floor(有效VIT 10 / 2) = 5，加上詞綴 12
    expect(getHpRegen(char, false, [item])).toBe(17);
  });

  it('回魔同理', () => {
    const item = armor({ affixes: [{ type: 'mp_regen', tier: 5, value: 8 }] });
    expect(getMpRegen(char, false, [item])).toBe(13);
  });

  it('凍結的件不給回復', () => {
    const item = armor({
      affixes: [{ type: 'hp_regen', tier: 7, value: 12 }],
      requiredAttributes: { STR: 99 },
    });
    expect(getHpRegen(char, false, getEffectiveGear(char, [], [item]))).toBe(5);
  });
});

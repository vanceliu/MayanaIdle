// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { getEffectiveMaxHp, getEffectiveMaxMp } from '../../stores/gameStore';
import type { Character } from '../../models/character';
import type { EquipmentInstance } from '../../models/equipment';
import type { Attributes } from '../../models/attributes';

const attrs = (): Attributes => ({ STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 });
const char = {
  id: 1, userId: 1, name: 'T', className: 'knight', level: 50, exp: 0, expToNext: 0,
  hp: 600, maxHp: 600, mp: 300, maxMp: 300,
  baseAttributes: attrs(), bonusAttributes: attrs(), unspentAttributePoints: 0,
} as Character;

const item = (over: Partial<EquipmentInstance>): EquipmentInstance => ({
  templateId: 1, name: 'x', type: 'armor', slot: 'chest', isTwoHanded: false,
  quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true, ...over,
} as EquipmentInstance);

/** `07-affix.md` § 7.3.1：最大 HP／MP 是固定值，不是百分比 */
describe('最大 HP／MP 詞綴改固定值', () => {
  it('直接加算，不隨基礎血量放大', () => {
    const gear = { chest: item({ affixes: [{ type: 'max_hp', tier: 7, value: 100 }] }) };
    expect(getEffectiveMaxHp(char, gear as never)).toBe(700);
  });

  it('多件相加', () => {
    const gear = {
      chest: item({ affixes: [{ type: 'max_mp', tier: 7, value: 100 }] }),
      helmet: item({ slot: 'helmet', affixes: [{ type: 'max_mp', tier: 4, value: 50 }] }),
    };
    expect(getEffectiveMaxMp(char, gear as never)).toBe(450);
  });

  it('飾品模板的 bonusHp 仍是另一個加算來源', () => {
    const gear = {
      necklace: item({ slot: 'necklace', bonusHp: 100 }),
      chest: item({ affixes: [{ type: 'max_hp', tier: 7, value: 90 }] }),
    };
    expect(getEffectiveMaxHp(char, gear as never)).toBe(790);
  });

  it('素質需求未滿足的件不給 HP', () => {
    const gear = {
      chest: item({
        affixes: [{ type: 'max_hp', tier: 7, value: 100 }],
        requiredAttributes: { STR: 99 },
      }),
    };
    expect(getEffectiveMaxHp(char, gear as never)).toBe(600);
  });
});

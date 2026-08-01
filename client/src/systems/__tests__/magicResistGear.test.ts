import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getAffixCategoryForSlot,
  getAffixPoolForSlot,
  getAffixTierTable,
  rollAffixValue,
  AFFIX_TIERS,
} from '../../models/affix';
import {
  getAccessoryMagicResist,
  getAccessoryStatMultiplier,
  getArmorEnhanceRate,
} from '../enhancement';
import { getGearMagicResist, getTotalMagicResist } from '../combat';
import { rollMonsterDebuff, isMagicResistibleDebuff } from '../playerDebuffSystem';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import type { Character } from '../../models/character';
import type { EquipmentInstance } from '../../models/equipment';
import type { MonsterInstance } from '../../models/monster';

describe('飾品詞綴分類（§ 7.6）', () => {
  it('項鍊／戒指走 accessory 分類', () => {
    expect(getAffixCategoryForSlot('necklace', 'armor')).toBe('accessory');
    expect(getAffixCategoryForSlot('ring1', 'armor')).toBe('accessory');
    expect(getAffixCategoryForSlot('ring2', 'armor')).toBe('accessory');
  });

  it('一般防具走 armor、盾牌走 shield、手部走 weapon', () => {
    expect(getAffixCategoryForSlot('chest', 'armor')).toBe('armor');
    expect(getAffixCategoryForSlot('belt', 'armor')).toBe('armor');
    expect(getAffixCategoryForSlot('leftHand', 'shield')).toBe('shield');
    expect(getAffixCategoryForSlot('rightHand', 'sword')).toBe('weapon');
  });

  it('魔抗詞綴只出現在飾品與盾牌', () => {
    const has = (c: any) => getAffixPoolForSlot(c).some(d => d.type === 'magic_resist');
    expect(has('accessory')).toBe(true);
    expect(has('shield')).toBe(true);
    expect(has('armor')).toBe(false);
    expect(has('weapon')).toBe(false);
  });

  it('飾品可選 8 種、一般防具 7 種、盾牌 9 種', () => {
    expect(getAffixPoolForSlot('accessory')).toHaveLength(8);
    expect(getAffixPoolForSlot('armor')).toHaveLength(7);
    expect(getAffixPoolForSlot('shield')).toHaveLength(9);
  });
});

describe('魔抗詞綴專屬階級表（§ 7.3.1）', () => {
  it('T1~T7 為 2/4/6/8/10/15/20 且為單一值', () => {
    const table = getAffixTierTable('magic_resist');
    expect(table.map(t => t.min)).toEqual([2, 4, 6, 8, 10, 15, 20]);
    for (const t of table) expect(t.min).toBe(t.max);
  });

  it('其他詞綴仍套用通用區間', () => {
    expect(getAffixTierTable('defense')).toBe(AFFIX_TIERS);
    expect(getAffixTierTable(undefined)).toBe(AFFIX_TIERS);
  });

  it('rollAffixValue 依詞綴類型查表', () => {
    for (let tier = 1; tier <= 7; tier++) {
      const v = rollAffixValue(tier, 'magic_resist');
      expect(v).toBe(getAffixTierTable('magic_resist')[tier - 1].min);
    }
  });
});

describe('飾品強化（§ 6.10.1）', () => {
  it('項鍊／戒指 20 件安定值為 0，腰帶維持 -1', () => {
    const accessories = EQUIPMENT_SEEDS.filter(
      e => e.slot === 'necklace' || e.slot === 'ring1' || e.slot === 'ring2'
    );
    expect(accessories).toHaveLength(20);
    for (const a of accessories) expect(a.stability, a.name).toBe(0);

    const belts = EQUIPMENT_SEEDS.filter(e => e.slot === 'belt');
    expect(belts.length).toBeGreaterThan(0);
    for (const b of belts) expect(b.stability, b.name).toBe(-1);
  });

  it('魔抗每 +1 給 2%', () => {
    expect(getAccessoryMagicResist(0)).toBe(0);
    expect(getAccessoryMagicResist(4)).toBe(8);
    expect(getAccessoryMagicResist(8)).toBe(16);
  });

  it('數值倍率：+3 以下無倍率，+4 起每級 +0.1，+8 封頂 ×1.5', () => {
    expect(getAccessoryStatMultiplier(0)).toBe(1);
    expect(getAccessoryStatMultiplier(3)).toBe(1);
    expect(getAccessoryStatMultiplier(4)).toBeCloseTo(1.1);
    expect(getAccessoryStatMultiplier(5)).toBeCloseTo(1.2);
    expect(getAccessoryStatMultiplier(7)).toBeCloseTo(1.4);
    expect(getAccessoryStatMultiplier(8)).toBeCloseTo(1.5);
    expect(getAccessoryStatMultiplier(12)).toBeCloseTo(1.5);
  });

  it('飾品安定值 0 → 強化從 +1 就有失敗風險（§ 6.10）', () => {
    expect(getArmorEnhanceRate(1, 0)).toBeCloseTo(0.5);
    expect(getArmorEnhanceRate(5, 0)).toBeCloseTo(0.25);
  });
});

function ring(overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    templateId: 1, name: '測試戒指', type: 'armor', slot: 'ring1', isTwoHanded: false,
    quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true, ...overrides,
  };
}

describe('魔抗彙總（§ 21.16）', () => {
  it('飾品強化與詞綴相加', () => {
    const gear = [
      ring({ enhancement: 4 }),                                            // 8%
      ring({ slot: 'ring2', affixes: [{ type: 'magic_resist', tier: 5, value: 10 }] }), // 10%
    ];
    expect(getGearMagicResist(gear)).toBe(18);
  });

  it('詞綴受品質放大', () => {
    const gear = [ring({ quality: 20, affixes: [{ type: 'magic_resist', tier: 5, value: 10 }] })];
    expect(getGearMagicResist(gear)).toBe(12);
  });

  it('非飾品的強化不提供魔抗', () => {
    const chest: EquipmentInstance = { ...ring(), slot: 'chest', enhancement: 8 };
    expect(getGearMagicResist([chest])).toBe(0);
  });

  it('總魔抗 = SPI + 裝備', () => {
    const c = {
      baseAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 18, INT: 0, CHA: 0 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    } as unknown as Character;
    expect(getTotalMagicResist(c, [ring({ enhancement: 4 })])).toBe(9 + 8);
  });
});

function monsterWith(type: 'curse' | 'poison', chance: number): MonsterInstance {
  return {
    templateId: 1, name: '測試怪', level: 50, currentHp: 100, maxHp: 100,
    attackMin: 10, attackMax: 10, defense: 0, exp: 1,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
    debuffs: [{ type, chance }],
  };
}

describe('魔抗抵抗 debuff（§ 24.4.2）', () => {
  it('僅詛咒／虛弱／減速受魔抗影響', () => {
    expect(isMagicResistibleDebuff('curse')).toBe(true);
    expect(isMagicResistibleDebuff('weaken')).toBe(true);
    expect(isMagicResistibleDebuff('slow')).toBe(true);
    expect(isMagicResistibleDebuff('poison')).toBe(false);
    expect(isMagicResistibleDebuff('bleed')).toBe(false);
    expect(isMagicResistibleDebuff('stun')).toBe(false);
  });

  it('100% 魔抗 = 免疫詛咒，但仍消耗該次判定', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);   // 觸發必中、抵抗必中
    const r = rollMonsterDebuff(monsterWith('curse', 100), [], [], 1000, 100);
    expect(r.resisted).toBe(true);
    expect(r.effect).toBeNull();
    expect(r.triggered).toBe(true);
  });

  it('0% 魔抗 = 必中', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = rollMonsterDebuff(monsterWith('curse', 100), [], [], 1000, 0);
    expect(r.resisted).toBeUndefined();
    expect(r.effect).not.toBeNull();
  });

  it('中毒不受魔抗影響，即使魔抗 100%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = rollMonsterDebuff(monsterWith('poison', 100), [], [], 1000, 100);
    expect(r.resisted).toBeUndefined();
    expect(r.effect).not.toBeNull();
  });

  it('魔抗 50% 時，抵抗 roll 落在門檻之上會命中', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);  // 60 >= 50 → 未被抵抗
    const r = rollMonsterDebuff(monsterWith('curse', 100), [], [], 1000, 50);
    expect(r.resisted).toBeUndefined();
    expect(r.effect).not.toBeNull();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

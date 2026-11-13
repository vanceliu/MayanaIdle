import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getAffixCategoryForSlot,
  getAffixPoolForSlot,
  getAffixTierTable,
  rollAffixValue,
  generateAffixes,
  AFFIX_TIER_TABLES,
  type AffixCategory,
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

describe('飾品與副手詞綴分類（§ 7.5／§ 7.6）', () => {
  it('項鍊走 necklace、戒指走 ring', () => {
    expect(getAffixCategoryForSlot('necklace', 'armor')).toBe('necklace');
    expect(getAffixCategoryForSlot('ring1', 'armor')).toBe('ring');
    expect(getAffixCategoryForSlot('ring2', 'armor')).toBe('ring');
  });

  it('項鍊／戒指的詞綴池不含防禦力', () => {
    for (const cat of ['necklace', 'ring'] as const) {
      expect(getAffixPoolForSlot(cat).map(d => d.type), cat).not.toContain('defense');
      // 實際生成 200 件也不該出現防禦力（Lv.60 Boss 掉落）
      for (let i = 0; i < 200; i++) {
        for (const affix of generateAffixes(cat, 60, 4, true)) expect(affix.type).not.toBe('defense');
      }
    }
  });

  it('副手（含魔導書）的攻擊類詞綴只有技能元素傷害（§ 7.6）', () => {
    const OFFENSIVE = [
      'attack_power', 'element_brand', 'element_erosion', 'attack_splash',
      'crit_rate', 'crit_damage', 'attack_speed', 'cooldown_reduction', 'hit_down', 'defense_down',
    ];
    const category = getAffixCategoryForSlot('leftHand', 'magicBook');
    const pool = getAffixPoolForSlot(category).map(d => d.type);
    expect(pool.filter(t => OFFENSIVE.includes(t))).toEqual([]);
    expect(pool).toContain('skill_elemental');
    for (let i = 0; i < 200; i++) {
      for (const affix of generateAffixes(category, 60, 4, true)) expect(OFFENSIVE).not.toContain(affix.type);
    }
  });

  it('所有魔導書、盾牌、臂甲模板都解析成副手', () => {
    const offhands = EQUIPMENT_SEEDS.filter(t => ['magicBook', 'shield', 'armGuard'].includes(t.type));
    expect(offhands.length).toBeGreaterThan(0);
    for (const b of offhands) expect(getAffixCategoryForSlot(b.slot, b.type), b.name).toBe('offhand');
  });

  it('魔抗詞綴只出現在副手、項鍊、戒指', () => {
    const has = (c: AffixCategory) => getAffixPoolForSlot(c).some(d => d.type === 'magic_resist');
    for (const c of ['offhand', 'necklace', 'ring'] as const) expect(has(c), c).toBe(true);
    for (const c of ['weapon', 'helmChest', 'shirtCloak', 'gloves', 'boots', 'belt'] as const) expect(has(c), c).toBe(false);
  });

  it('格擋率只出現在副手', () => {
    const has = (c: AffixCategory) => getAffixPoolForSlot(c).some(d => d.type === 'block_rate');
    expect(has('offhand')).toBe(true);
    for (const c of ['weapon', 'helmChest', 'shirtCloak', 'gloves', 'boots', 'belt', 'necklace', 'ring'] as const) {
      expect(has(c), c).toBe(false);
    }
  });

  it('項鍊 15 種、戒指 14 種、副手 15 種', () => {
    expect(getAffixPoolForSlot('necklace')).toHaveLength(15);
    expect(getAffixPoolForSlot('ring')).toHaveLength(14);
    expect(getAffixPoolForSlot('offhand')).toHaveLength(15);
  });
});

describe('魔抗詞綴階級表（§ 7.6：副手／項鍊／戒指皆為 P3）', () => {
  it('T1~T7 為 0.1~3.0 / 3.1~6.0 / … / 18.1~21.0', () => {
    for (const cat of ['offhand', 'necklace', 'ring'] as const) {
      const table = getAffixTierTable('magic_resist', cat);
      expect(table, cat).toBe(AFFIX_TIER_TABLES.P3);
      expect(table.map(t => [t.min, t.max])).toEqual([
        [0.1, 3], [3.1, 6], [6.1, 9], [9.1, 12], [12.1, 15], [15.1, 18], [18.1, 21],
      ]);
    }
  });

  it('rollAffixValue 依分類查表，落在該階級區間內', () => {
    const table = getAffixTierTable('magic_resist', 'ring');
    for (let tier = 1; tier <= 7; tier++) {
      const { min, max } = table[tier - 1];
      for (let i = 0; i < 30; i++) {
        const v = rollAffixValue(tier, 'magic_resist', 'ring');
        expect(v, `T${tier}`).toBeGreaterThanOrEqual(min);
        expect(v, `T${tier}`).toBeLessThanOrEqual(max);
      }
    }
  });
});

describe('飾品強化（§ 6.10.1）', () => {
  it('項鍊／戒指的安定值為 0，腰帶維持 -1', () => {
    const accessories = EQUIPMENT_SEEDS.filter(
      e => e.slot === 'necklace' || e.slot === 'ring1' || e.slot === 'ring2'
    );
    // 不寫死件數 —— 這個測試要驗的是安定值規則，不是飾品有幾件
    expect(accessories.length).toBeGreaterThan(0);
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

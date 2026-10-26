/**
 * T7 獨有詞綴模型（`07-affix-tier7.md`）：池的分派、抽取區間、顯示、受擊 buff。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import {
  UNIQUE_AFFIX_DEFINITIONS,
  UNIQUE_AFFIX_BY_TEMPLATE,
  UNIQUE_STRUCK_CHANCE,
  UNIQUE_STRUCK_DURATION_MS,
  getUniqueAffixPool,
  getUniqueAffixDefinition,
  rollUniqueAffix,
  rollUniqueStruckBuffs,
  formatUniqueAffixDisplay,
  formatUniqueAffixRange,
  sumUniqueAffix,
  type UniqueAffixType,
} from '../uniqueAffix';
import { rollNewInstanceFields } from '../../systems/templateSync';

afterEach(() => { vi.restoreAllMocks(); });

const T7 = EQUIPMENT_SEEDS.filter(t => t.tier === 7);
const typesOf = (pool: string) => UNIQUE_AFFIX_DEFINITIONS.filter(d => d.pool === pool).map(d => d.type);

describe('池的分派（§ 7T.5）', () => {
  it('49 件 T7 全部有獨有詞綴池', () => {
    expect(T7).toHaveLength(49);
    for (const t of T7) expect(getUniqueAffixPool(t).length, t.name).toBeGreaterThan(0);
  });

  it('非 T7 一律沒有', () => {
    for (const t of EQUIPMENT_SEEDS.filter(x => x.tier !== 7)) {
      expect(getUniqueAffixPool(t), t.name).toEqual([]);
      expect(rollUniqueAffix(t)).toBeUndefined();
    }
  });

  it('右手武器走武器池（8 種）', () => {
    const weapons = T7.filter(t => t.slot === 'rightHand');
    expect(weapons).toHaveLength(19);
    for (const t of weapons) expect(getUniqueAffixPool(t)).toEqual(typesOf('weapon'));
    expect(typesOf('weapon')).toHaveLength(8);
  });

  it('頭盔／胸甲／上衣／斗篷／手套／鞋子走防具池（6 種）', () => {
    const armor = T7.filter(t => ['helmet', 'chest', 'shirt', 'cloak', 'gloves', 'boots'].includes(t.slot));
    expect(armor).toHaveLength(18);
    for (const t of armor) expect(getUniqueAffixPool(t)).toEqual(typesOf('armor'));
    expect(typesOf('armor')).toHaveLength(6);
  });

  it('項鍊／戒指走飾品池（5 種）', () => {
    const acc = T7.filter(t => ['necklace', 'ring1', 'ring2'].includes(t.slot));
    expect(acc).toHaveLength(6);
    for (const t of acc) expect(getUniqueAffixPool(t)).toEqual(typesOf('accessory'));
    expect(typesOf('accessory')).toHaveLength(5);
  });

  it('腰帶與左手依模板 id 指定', () => {
    const expected: Record<number, UniqueAffixType> = {
      602: 'struck_str', 603: 'struck_int', 604: 'struck_agi',
      1155: 'struck_block', 1171: 'struck_magic_attack', 1186: 'struck_evasion',
    };
    expect(UNIQUE_AFFIX_BY_TEMPLATE).toEqual(expected);
    for (const [id, type] of Object.entries(expected)) {
      const t = T7.find(x => x.id === Number(id))!;
      expect(getUniqueAffixPool(t)).toEqual([type]);
    }
  });
});

describe('抽取', () => {
  it('數值落在定義的整數區間，兩端都抽得到', () => {
    for (const def of UNIQUE_AFFIX_DEFINITIONS) {
      if (!def.range) continue;
      const seen = new Set<number>();
      const template = def.pool === 'fixed'
        ? T7.find(t => UNIQUE_AFFIX_BY_TEMPLATE[t.id!] === def.type)!
        : T7.find(t => getUniqueAffixPool(t).includes(def.type))!;
      for (let i = 0; i < 4000; i++) {
        const a = rollUniqueAffix(template)!;
        if (a.type === def.type) seen.add(a.value);
      }
      const [min, max] = def.range;
      expect(Math.min(...seen), def.type).toBe(min);
      expect(Math.max(...seen), def.type).toBe(max);
      for (const v of seen) expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('無數值的詞綴存 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4); // 武器池第 4 條＝命中暈眩
    const sword = T7.find(t => t.slot === 'rightHand')!;
    expect(rollUniqueAffix(sword)).toEqual({ type: 'hit_stun', value: 0 });
  });

  it('實例生成欄位只在 T7 帶獨有詞綴', () => {
    for (const t of EQUIPMENT_SEEDS) {
      const fields = rollNewInstanceFields(t);
      expect(!!fields.uniqueAffix, t.name).toBe(t.tier === 7);
    }
  });
});

describe('數值定義（§ 7T.5）', () => {
  it('與規格表一致', () => {
    const ranges = Object.fromEntries(UNIQUE_AFFIX_DEFINITIONS.map(d => [d.type, d.range]));
    expect(ranges).toEqual({
      hit_heal: [10, 15], hit_mana: [10, 15], hit_bonus_damage: [10, 20], hit_stun: null,
      kill_heal: [30, 50], crit_damage: [25, 50], crit_rate: [20, 25], attack_speed: [20, 25],
      struck_defense: [10, 15], struck_spi: [2, 4], struck_vit: [2, 4], extra_defense: [3, 10],
      evasion: [7, 10], drop_rate: [50, 100],
      struck_magic_resist: [5, 20], struck_all_attributes: [2, 4], magic_resist: [5, 15],
      all_attributes: [1, 2], immune_all: null,
      struck_str: [2, 4], struck_int: [2, 4], struck_agi: [2, 4],
      struck_block: [10, 10], struck_magic_attack: [5, 10], struck_evasion: [10, 10],
    });
  });
});

describe('顯示（§ 7T.7）', () => {
  it('以 (獨) 開頭接效果敘述', () => {
    expect(formatUniqueAffixDisplay({ type: 'extra_defense', value: 10 })).toBe('(獨) 額外防禦 +10');
    expect(formatUniqueAffixDisplay({ type: 'hit_bonus_damage', value: 15 })).toBe('(獨) 命中 20% 機率總體增加 15 傷害');
    expect(formatUniqueAffixDisplay({ type: 'immune_all', value: 0 })).toBe('(獨) 免疫中毒、流血、暈眩');
  });

  it('Wiki 數值欄', () => {
    expect(formatUniqueAffixRange(getUniqueAffixDefinition('crit_damage'))).toBe('25~50%');
    expect(formatUniqueAffixRange(getUniqueAffixDefinition('struck_block'))).toBe('固定 10%');
    expect(formatUniqueAffixRange(getUniqueAffixDefinition('hit_stun'))).toBe('—');
  });
});

describe('受擊 buff（§ 7T.4）', () => {
  const belt = { uniqueAffix: { type: 'struck_str' as const, value: 3 } };
  const necklace = { uniqueAffix: { type: 'struck_all_attributes' as const, value: 2 } };

  it(`擲中 ${UNIQUE_STRUCK_CHANCE}% 才給 buff，持續 5 秒`, () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.09);
    const [buff] = rollUniqueStruckBuffs([belt], 1000);
    expect(buff.category).toBe('t7-struck_str');
    expect(buff.duration).toBe(UNIQUE_STRUCK_DURATION_MS);
    expect(buff.modifiers).toEqual([{ stat: 'str', value: 3, isPercent: false }]);
    expect(buff.description).toBe('力量 +3');

    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    expect(rollUniqueStruckBuffs([belt], 1000)).toEqual([]);
  });

  it('全屬性一次給六項', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const [buff] = rollUniqueStruckBuffs([necklace], 1000);
    expect(buff.modifiers!.map(m => m.stat)).toEqual(['str', 'agility', 'vit', 'spi', 'int', 'cha']);
    expect(buff.modifiers!.every(m => m.value === 2)).toBe(true);
  });

  it('常駐類不會產生 buff', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(rollUniqueStruckBuffs([{ uniqueAffix: { type: 'evasion', value: 8 } }], 1000)).toEqual([]);
  });
});

describe('加總', () => {
  it('只加同種類', () => {
    const gear = [
      { uniqueAffix: { type: 'evasion' as const, value: 8 } },
      { uniqueAffix: { type: 'drop_rate' as const, value: 70 } },
      null,
    ];
    expect(sumUniqueAffix(gear, 'evasion')).toBe(8);
    expect(sumUniqueAffix(gear, 'drop_rate')).toBe(70);
    expect(sumUniqueAffix(gear, 'crit_rate')).toBe(0);
  });
});

/**
 * T7 獨有詞綴模型（`07-affix-tier7.md`）：池的分派、抽取區間、顯示、受擊 buff。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import {
  UNIQUE_AFFIX_DEFINITIONS,
  UNIQUE_AFFIX_BY_TEMPLATE,
  UNIQUE_AFFIX_POOLS,
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

  it('各隨機池的種類與 § 7T.5 一致', () => {
    expect(UNIQUE_AFFIX_POOLS).toEqual({
      weapon: ['hit_heal', 'hit_mana', 'kill_heal', 'crit_damage', 'crit_rate', 'attack_speed'],
      helmChest: ['struck_defense', 'struck_vit', 'extra_defense'],
      shirtCloak: ['evasion', 'struck_spi', 'drop_rate'],
      gloves: ['crit_damage', 'crit_rate', 'attack_speed'],
      boots: ['evasion', 'extra_defense', 'drop_rate'],
      accessory: ['struck_magic_resist', 'struck_all_attributes', 'magic_resist', 'all_attributes', 'immune_all'],
    });
  });

  it.each([
    ['右手武器', ['rightHand'], 'weapon', 19],
    ['頭盔／胸甲', ['helmet', 'chest'], 'helmChest', 6],
    ['上衣／斗篷', ['shirt', 'cloak'], 'shirtCloak', 6],
    ['手套', ['gloves'], 'gloves', 3],
    ['鞋子', ['boots'], 'boots', 3],
    ['項鍊／戒指', ['necklace', 'ring1', 'ring2'], 'accessory', 6],
  ] as const)('%s走對應的池', (_label, slots, pool, count) => {
    const items = T7.filter(t => (slots as readonly string[]).includes(t.slot));
    expect(items).toHaveLength(count);
    for (const t of items) expect(getUniqueAffixPool(t), t.name).toEqual(UNIQUE_AFFIX_POOLS[pool]);
  });

  it('手套與武器的爆擊傷害／爆擊率／攻擊速度為同一種類，數值同武器池', () => {
    for (const type of UNIQUE_AFFIX_POOLS.gloves) expect(UNIQUE_AFFIX_POOLS.weapon).toContain(type);
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
      const template = Object.values(UNIQUE_AFFIX_BY_TEMPLATE).includes(def.type)
        ? T7.find(t => UNIQUE_AFFIX_BY_TEMPLATE[t.id!] === def.type)!
        : T7.find(t => getUniqueAffixPool(t).includes(def.type))!;
      const pool = getUniqueAffixPool(template);
      const pick = (pool.indexOf(def.type) + 0.5) / pool.length;
      const rollAt = (r: number) => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(pick).mockReturnValueOnce(r);
        return rollUniqueAffix(template)!;
      };
      const [min, max] = def.range;
      expect(rollAt(0), def.type).toEqual({ type: def.type, value: min });
      expect(rollAt(0.999999), def.type).toEqual({ type: def.type, value: max });
      for (let i = 0; i < 50; i++) {
        const a = rollUniqueAffix(template)!;
        if (a.type !== def.type) continue;
        expect(Number.isInteger(a.value)).toBe(true);
        expect(a.value).toBeGreaterThanOrEqual(min);
        expect(a.value).toBeLessThanOrEqual(max);
      }
      vi.restoreAllMocks();
    }
  });

  it('無數值的詞綴存 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // 飾品池第 5 條＝全免疫
    const necklace = T7.find(t => t.slot === 'necklace')!;
    expect(rollUniqueAffix(necklace)).toEqual({ type: 'immune_all', value: 0 });
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
      hit_heal: [10, 25], hit_mana: [10, 25],
      kill_heal: [30, 50], crit_damage: [25, 50], crit_rate: [20, 25], attack_speed: [20, 25],
      struck_defense: [10, 15], struck_spi: [2, 4], struck_vit: [2, 4], extra_defense: [3, 10],
      evasion: [700, 1000], drop_rate: [50, 100],
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
    expect(formatUniqueAffixDisplay({ type: 'immune_all', value: 0 })).toBe('(獨) 免疫中毒、流血、暈眩');
  });

  it('Wiki 數值欄', () => {
    expect(formatUniqueAffixRange(getUniqueAffixDefinition('crit_damage'))).toBe('25~50%');
    expect(formatUniqueAffixRange(getUniqueAffixDefinition('struck_block'))).toBe('固定 10%');
    expect(formatUniqueAffixRange(getUniqueAffixDefinition('immune_all'))).toBe('—');
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

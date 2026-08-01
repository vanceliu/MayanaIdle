import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SPECIAL_AFFIX_DEFINITIONS,
  getSpecialAffixChance,
  getSpecialAffixPoolForSlot,
  isSpecialAffixType,
  generateAffixes,
  collectAffixBonuses,
  collectSpecialAffixTypes,
  type Affix,
} from '../affix';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('特殊詞綴定義（§ 7.10.1）', () => {
  it('共 3 個免疫/抵抗詞綴，全部僅限防具、盾牌與飾品（不含武器）', () => {
    // 詛咒／虛弱／減速改由魔抗抵抗（§ 24.4.2），對應免疫詞綴已移除
    expect(SPECIAL_AFFIX_DEFINITIONS).toHaveLength(3);
    for (const def of SPECIAL_AFFIX_DEFINITIONS) {
      // 飾品拆出 `accessory` 分類後一併納入，維持「飾品可帶免疫詞綴」的既有行為
      expect(def.category).toEqual(['armor', 'shield', 'accessory']);
      expect(def.category).not.toContain('weapon');
    }
  });

  it('兩種免疫詞綴 Lv.31+、暈眩抵抗 Lv.41+', () => {
    const immunities = SPECIAL_AFFIX_DEFINITIONS.filter(d => d.type.startsWith('immune_'));
    expect(immunities.map(d => d.type)).toEqual(['immune_poison', 'immune_bleed']);
    for (const def of immunities) expect(def.minAreaLevel).toBe(31);
    expect(SPECIAL_AFFIX_DEFINITIONS.find(d => d.type === 'resist_stun')?.minAreaLevel).toBe(41);
  });

  it('isSpecialAffixType 可區分一般與特殊詞綴', () => {
    expect(isSpecialAffixType('immune_poison')).toBe(true);
    expect(isSpecialAffixType('resist_stun')).toBe(true);
    expect(isSpecialAffixType('attack_power')).toBe(false);
  });
});

describe('特殊詞綴掉落權重（§ 7.10.3）', () => {
  it('依區域等級 3% / 5% / 8%', () => {
    expect(getSpecialAffixChance(30)).toBe(0);
    expect(getSpecialAffixChance(31)).toBe(3);
    expect(getSpecialAffixChance(40)).toBe(3);
    expect(getSpecialAffixChance(41)).toBe(5);
    expect(getSpecialAffixChance(50)).toBe(5);
    expect(getSpecialAffixChance(51)).toBe(8);
  });

  it('Boss 掉落機率 ×2', () => {
    expect(getSpecialAffixChance(31, true)).toBe(6);
    expect(getSpecialAffixChance(41, true)).toBe(10);
    expect(getSpecialAffixChance(51, true)).toBe(16);
  });

  it('Lv.31 以下的區域無特殊詞綴可掉', () => {
    expect(getSpecialAffixPoolForSlot('armor', 30)).toHaveLength(0);
    expect(getSpecialAffixPoolForSlot('armor', 31)).toHaveLength(2);
    expect(getSpecialAffixPoolForSlot('armor', 41)).toHaveLength(3);
  });

  it('武器不會出現特殊詞綴', () => {
    expect(getSpecialAffixPoolForSlot('weapon', 60)).toHaveLength(0);
  });
});

describe('generateAffixes 產出特殊詞綴', () => {
  it('低等級區域不產生特殊詞綴', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const affixes = generateAffixes('armor', 10, 4);
    expect(affixes.every(a => !isSpecialAffixType(a.type))).toBe(true);
  });

  it('骰中特殊詞綴時取代一個一般詞綴位置，tier 為 0', () => {
    // random=0 → 一律小於 specialChance，且每次都取 pool 第一個
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const affixes = generateAffixes('armor', 51, 4);
    expect(affixes).toHaveLength(4);
    // 特殊詞綴池只剩 3 種且不可重複，第 4 格必然退回一般詞綴
    const specials = affixes.filter(a => isSpecialAffixType(a.type));
    expect(specials).toHaveLength(3);
    expect(specials.every(a => a.tier === 0 && a.value === 0)).toBe(true);
  });

  it('同一件裝備不會出現重複的特殊詞綴（§ 7.10.2）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const affixes = generateAffixes('armor', 51, 4);
    const types = affixes.map(a => a.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('未骰中特殊詞綴時產出一般詞綴', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const affixes = generateAffixes('armor', 51, 4);
    expect(affixes.every(a => !isSpecialAffixType(a.type))).toBe(true);
  });
});

describe('特殊詞綴不參與數值加總', () => {
  it('collectAffixBonuses 忽略特殊詞綴', () => {
    const affixes: Affix[] = [
      { type: 'defense', tier: 3, value: 12 },
      { type: 'immune_poison', tier: 0, value: 0 },
    ];
    const bonuses = collectAffixBonuses([{ affixes, quality: 0 }]);
    expect(bonuses.defense).toBe(12);
    expect(Object.values(bonuses).every(v => Number.isFinite(v))).toBe(true);
  });

  it('collectSpecialAffixTypes 收集所有裝備的特殊詞綴且不重複', () => {
    const types = collectSpecialAffixTypes([
      { affixes: [{ type: 'immune_poison', tier: 0, value: 0 }, { type: 'defense', tier: 1, value: 5 }] },
      { affixes: [{ type: 'immune_poison', tier: 0, value: 0 }, { type: 'resist_stun', tier: 0, value: 0 }] },
    ]);
    expect(types).toEqual(new Set(['immune_poison', 'resist_stun']));
  });
});

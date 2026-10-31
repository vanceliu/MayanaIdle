import { describe, it, expect } from 'vitest';
import {
  EVASION_POINTS_PER_PERCENT,
  EVASION_TIERS,
  rollAffixValue,
  FLAT_HP_MP_TIERS,
  FLAT_REGEN_TIERS,
  formatAffixDisplay,
  formatAffixName,
  formatAffixValue,
  generateAffixes,
  getAffixTierTable,
  getEffectiveAffixValue,
  isAttributeAffixType,
  isFlatAffixType,
  isMaxRollAffix,
  isTierlessAffixType,
  shouldBoldAffix,
} from '../affix';
import type { Affix } from '../affix';

/** `07-affix.md` § 7.1 / § 7.3.1 */
describe('固定值型詞綴（§ 7.3.1）', () => {
  it('最大 HP／MP 的 T1~T7 為 15~20 … 90~100', () => {
    expect(FLAT_HP_MP_TIERS.map(t => [t.min, t.max])).toEqual(
      [[15, 20], [25, 32], [38, 46], [50, 58], [62, 70], [75, 84], [90, 100]],
    );
    expect(getAffixTierTable('max_hp')).toBe(FLAT_HP_MP_TIERS);
    expect(getAffixTierTable('max_mp')).toBe(FLAT_HP_MP_TIERS);
  });

  it('回血／回魔的 T1~T7 為 1~2 … 11~12', () => {
    expect(FLAT_REGEN_TIERS.map(t => [t.min, t.max])).toEqual(
      [[1, 2], [2, 3], [3, 5], [5, 6], [7, 8], [9, 10], [11, 12]],
    );
    expect(getAffixTierTable('hp_regen')).toBe(FLAT_REGEN_TIERS);
  });

  it('顯示不帶百分號，仍標 Tier', () => {
    const a: Affix = { type: 'max_hp', tier: 7, value: 95 };
    expect(formatAffixDisplay(a)).toBe('最大 HP +95 (T7)');
    expect(formatAffixDisplay({ type: 'hp_regen', tier: 5, value: 8 })).toBe('回血 +8 (T5)');
  });

  // 印記師把名稱與數值拆成兩個元素上樣式，單位規則只有 `formatAffixValue` 一份
  it('拆開輸出的數值同樣不帶百分號，百分比型才帶', () => {
    expect(formatAffixValue({ type: 'max_hp', tier: 7, value: 95 })).toBe('+95');
    expect(formatAffixValue({ type: 'mp_regen', tier: 5, value: 8 })).toBe('+8');
    expect(formatAffixValue({ type: 'attack_power', tier: 5, value: 12 })).toBe('+12.0%');
    expect(formatAffixName({ type: 'max_hp', tier: 7, value: 95 })).toBe('最大 HP');
  });

  it('仍受品質放大，也仍參與滿值判定', () => {
    expect(getEffectiveAffixValue({ type: 'max_hp', tier: 7, value: 90 }, 20)).toBe(108);
    expect(isMaxRollAffix({ type: 'max_hp', tier: 7, value: 100 })).toBe(true);
    expect(isMaxRollAffix({ type: 'max_hp', tier: 7, value: 99 })).toBe(false);
  });

  it('分類正確：只有五種是固定值型', () => {
    for (const t of ['max_hp', 'max_mp', 'hp_regen', 'mp_regen', 'evasion'] as const) {
      expect(isFlatAffixType(t)).toBe(true);
    }
    expect(isFlatAffixType('defense')).toBe(false);
    expect(isFlatAffixType('bonus_attribute')).toBe(false);
  });
});

describe('迴避值（§ 7.3.1）', () => {
  it('T1~T7 為 1~39 … 235~273，各階連續不重疊', () => {
    expect(EVASION_TIERS.map(t => [t.min, t.max])).toEqual(
      [[1, 39], [40, 78], [79, 117], [118, 156], [157, 195], [196, 234], [235, 273]],
    );
    for (let i = 1; i < EVASION_TIERS.length; i++) {
      expect(EVASION_TIERS[i].min).toBe(EVASION_TIERS[i - 1].max + 1);
    }
    expect(getAffixTierTable('evasion')).toBe(EVASION_TIERS);
    expect(EVASION_POINTS_PER_PERCENT).toBe(100);
  });

  it('顯示為迴避值、不帶百分號；吃品質；滿值判定照常', () => {
    expect(formatAffixDisplay({ type: 'evasion', tier: 7, value: 250 })).toBe('迴避 +250 (T7)');
    expect(formatAffixValue({ type: 'evasion', tier: 7, value: 273 }, 20)).toBe('+327');
    expect(isMaxRollAffix({ type: 'evasion', tier: 7, value: 273 })).toBe(true);
    expect(isMaxRollAffix({ type: 'evasion', tier: 7, value: 272 })).toBe(false);
  });

  it('數值依 Tier 區間抽', () => {
    for (let tier = 1; tier <= 7; tier++) {
      for (let i = 0; i < 50; i++) {
        const v = rollAffixValue(tier, 'evasion');
        expect(v).toBeGreaterThanOrEqual(EVASION_TIERS[tier - 1].min);
        expect(v).toBeLessThanOrEqual(EVASION_TIERS[tier - 1].max);
      }
    }
  });
});

describe('額外屬性詞綴（§ 7.3.1）', () => {
  const a: Affix = { type: 'bonus_attribute', tier: 0, value: 1, attribute: 'STR' };

  it('無 Tier、固定 +1，不受品質放大', () => {
    expect(a.tier).toBe(0);
    expect(getEffectiveAffixValue(a, 20)).toBe(1);
  });

  it('顯示成「力量 +1」，不參與滿值判定但一律粗體', () => {
    expect(formatAffixDisplay(a)).toBe('力量 +1');
    expect(isMaxRollAffix(a)).toBe(false);
    expect(shouldBoldAffix(a)).toBe(true);
  });

  it('與特殊詞綴同屬「無 Tier」，印記的升階／重刻不受理', () => {
    expect(isTierlessAffixType('bonus_attribute')).toBe(true);
    expect(isTierlessAffixType('immune_poison')).toBe(true);
    expect(isTierlessAffixType('defense')).toBe(false);
  });

  it('生成時六種屬性都出得來，值恆為 1、Tier 恆為 0', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 800; i++) {
      for (const affix of generateAffixes('armor', 60, 4, false, { noSpecialAffix: true })) {
        if (!isAttributeAffixType(affix.type)) continue;
        expect(affix.tier).toBe(0);
        expect(affix.value).toBe(1);
        seen.add(affix.attribute!);
      }
    }
    expect([...seen].sort()).toEqual(['AGI', 'CHA', 'INT', 'SPI', 'STR', 'VIT']);
  });
});

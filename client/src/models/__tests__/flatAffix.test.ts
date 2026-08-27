import { describe, it, expect } from 'vitest';
import {
  FLAT_HP_MP_TIERS,
  FLAT_REGEN_TIERS,
  formatAffixDisplay,
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

  it('仍受品質放大，也仍參與滿值判定', () => {
    expect(getEffectiveAffixValue({ type: 'max_hp', tier: 7, value: 90 }, 20)).toBe(108);
    expect(isMaxRollAffix({ type: 'max_hp', tier: 7, value: 100 })).toBe(true);
    expect(isMaxRollAffix({ type: 'max_hp', tier: 7, value: 99 })).toBe(false);
  });

  it('分類正確：只有四種是固定值型', () => {
    for (const t of ['max_hp', 'max_mp', 'hp_regen', 'mp_regen'] as const) {
      expect(isFlatAffixType(t)).toBe(true);
    }
    expect(isFlatAffixType('defense')).toBe(false);
    expect(isFlatAffixType('bonus_attribute')).toBe(false);
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

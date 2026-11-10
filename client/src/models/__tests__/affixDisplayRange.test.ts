/**
 * 裝備 tooltip 按住 Alt 顯示的詞綴區間（`34-ui-guidelines.md` § 34.2）。
 */
import { describe, it, expect } from 'vitest';
import {
  formatAffixDisplay,
  formatAffixDisplayParts,
  formatAffixRange,
  getAffixTierTable,
  type Affix,
} from '../affix';

const rangeOf = (affix: Affix, quality = 0) =>
  formatAffixDisplayParts(affix, quality).filter(p => p.range).map(p => p.text);

describe('詞綴 Alt 區間', () => {
  it('百分比詞綴：同 Tier 區間帶一位小數，接在數值後、Tier 標記前', () => {
    const affix: Affix = { type: 'attack_power', tier: 4, value: getAffixTierTable('attack_power')[3].min };
    const t = getAffixTierTable('attack_power')[3];
    expect(formatAffixDisplayParts(affix)).toEqual([
      { text: formatAffixDisplay(affix).replace(/ \(T4\)$/, '') },
      { text: `(${t.min.toFixed(1)} ~ ${t.max.toFixed(1)}%)`, range: true },
      { text: ' (T4)' },
    ]);
  });

  it('固定值詞綴不帶百分號', () => {
    expect(rangeOf({ type: 'max_hp', tier: 7, value: 95 })).toEqual(['(90 ~ 100)']);
  });

  it('區間乘品質，與顯示值同一基準', () => {
    expect(rangeOf({ type: 'max_hp', tier: 7, value: 95 }, 10)).toEqual(['(99 ~ 110)']);
  });

  it('受擊回復的區間接在觸發率後', () => {
    const affix: Affix = { type: 'on_hit_hp', tier: 1, value: getAffixTierTable('on_hit_hp')[0].min, restorePercent: 3 };
    const parts = formatAffixDisplayParts(affix);
    expect(parts[1].range).toBe(true);
    expect(parts[2].text).toMatch(/^ 觸發回血 3%/);
  });

  it('特殊詞綴、額外屬性沒有區間', () => {
    expect(formatAffixRange({ type: 'bonus_attribute', tier: 1, value: 1, attribute: 'STR' })).toBeNull();
    expect(rangeOf({ type: 'bonus_attribute', tier: 1, value: 1, attribute: 'STR' })).toEqual([]);
  });

  it('封印詞綴保留 (封) 前綴', () => {
    const parts = formatAffixDisplayParts({ type: 'max_hp', tier: 7, value: 95, sealed: true });
    expect(parts[0].text).toBe('(封) ');
    expect(parts.some(p => p.range)).toBe(true);
  });

});

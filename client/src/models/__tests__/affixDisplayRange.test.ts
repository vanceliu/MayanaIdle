/**
 * 裝備 tooltip 按住 Alt 顯示的詞綴區間（`34-ui-guidelines.md` § 34.2）。
 * 區間依所屬分類的階級表（`07-affix.md` § 7.6）；不在池內的舊詞綴走 § 7.3.3。
 */
import { describe, it, expect } from 'vitest';
import {
  formatAffixDisplay,
  formatAffixDisplayParts,
  formatAffixRange,
  getAffixTierTable,
  type Affix,
  type AffixCategory,
} from '../affix';

const rangeOf = (affix: Affix, category: AffixCategory, quality = 0) =>
  formatAffixDisplayParts(affix, quality, undefined, category).filter(p => p.range).map(p => p.text);

describe('詞綴 Alt 區間', () => {
  it('百分比詞綴：同 Tier 區間帶一位小數，接在數值後、Tier 標記前', () => {
    const t = getAffixTierTable('attack_power', 'weapon')[3];
    const affix: Affix = { type: 'attack_power', tier: 4, value: t.min };
    expect(formatAffixDisplayParts(affix, 0, undefined, 'weapon')).toEqual([
      { text: formatAffixDisplay(affix).replace(/ \(T4\)$/, '') },
      { text: `(${t.min.toFixed(1)} ~ ${t.max.toFixed(1)}%)`, range: true },
      { text: ' (T4)' },
    ]);
  });

  it('同種詞綴依分類用不同的表（爆擊率 T3：手套 4.1~6.0、項鍊 2.1~3.0）', () => {
    const affix: Affix = { type: 'crit_rate', tier: 3, value: 2.5 };
    expect(rangeOf(affix, 'gloves')).toEqual(['(4.1 ~ 6.0%)']);
    expect(rangeOf(affix, 'necklace')).toEqual(['(2.1 ~ 3.0%)']);
  });

  it('不在池內的舊詞綴走舊表（武器上的爆擊率 T3：8.1~11.0）', () => {
    expect(rangeOf({ type: 'crit_rate', tier: 3, value: 9 }, 'weapon')).toEqual(['(8.1 ~ 11.0%)']);
  });

  it('沒給分類時不帶區間', () => {
    expect(formatAffixDisplayParts({ type: 'max_hp', tier: 7, value: 95 }).some(p => p.range)).toBe(false);
  });

  it('固定值詞綴不帶百分號', () => {
    expect(rangeOf({ type: 'max_hp', tier: 7, value: 95 }, 'helmChest')).toEqual(['(90 ~ 100)']);
  });

  it('區間乘品質，與顯示值同一基準', () => {
    expect(rangeOf({ type: 'max_hp', tier: 7, value: 95 }, 'helmChest', 10)).toEqual(['(99 ~ 110)']);
  });

  it('受擊回復：觸發率與回復%各接一段區間；回復%區間為該 Tier 觸發率上下限的換算', () => {
    expect(formatAffixDisplayParts({ type: 'on_hit_hp', tier: 3, value: 3 }, 0, undefined, 'helmChest')).toEqual([
      { text: '受擊 3.0%' }, { text: '(2.4 ~ 3.5%)', range: true },
      { text: ' 觸發回血 2.7%' }, { text: '(2.5 ~ 2.8%)', range: true },
      { text: ' (T3)' },
    ]);
  });

  it('受擊回復的區間乘品質', () => {
    expect(rangeOf({ type: 'on_hit_hp', tier: 3, value: 3 }, 'offhand', 10)).toEqual(['(2.6 ~ 3.8%)', '(2.7 ~ 3.0%)']);
  });

  it('元素侵蝕：有武器基傷時每秒傷害接「平均基傷一半 ~ 平均基傷」乘品質', () => {
    // 武器元素侵蝕 P3：T3 = 6.1~9.0
    const affix: Affix = { type: 'element_erosion', tier: 3, value: 8, element: 'fire', dotDamage: 12 };
    expect(rangeOf(affix, 'weapon')).toEqual(['(6.1 ~ 9.0%)']);
    expect(formatAffixDisplayParts(affix, 0, 18, 'weapon').filter(p => p.range).map(p => p.text)).toEqual(['(6.1 ~ 9.0%)', '(9 ~ 18)']);
    expect(formatAffixDisplayParts(affix, 10, 18, 'weapon').filter(p => p.range).map(p => p.text)[1]).toBe('(9 ~ 19)');
  });

  it('特殊詞綴、額外屬性沒有區間', () => {
    expect(formatAffixRange({ type: 'bonus_attribute', tier: 1, value: 1, attribute: 'STR' }, 0, 'belt')).toBeNull();
    expect(rangeOf({ type: 'bonus_attribute', tier: 1, value: 1, attribute: 'STR' }, 'belt')).toEqual([]);
  });

  it('封印詞綴保留 (封) 前綴', () => {
    const parts = formatAffixDisplayParts({ type: 'max_hp', tier: 7, value: 95, sealed: true }, 0, undefined, 'ring');
    expect(parts[0].text).toBe('(封) ');
    expect(parts.some(p => p.range)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  applyRecarveSigil,
  applyStingSigil,
  applyTemperSigil,
  canUseSigil,
  getUpgradeSigilFor,
} from '../sigil';
import { isAttributeAffixType } from '../affix';
import type { Affix } from '../affix';
import type { SigilContext } from '../sigil';

const attrAffix: Affix = { type: 'bonus_attribute', tier: 0, value: 1, attribute: 'STR' };
const normal: Affix = { type: 'defense', tier: 3, value: 8 };
const ctx = (over: Partial<SigilContext> = {}): SigilContext => ({
  category: 'armor', charLevel: 60, quality: 0, ...over,
} as SigilContext);
const check = { isStarterGear: false, quality: 0 };

/** `46-sigil.md` § 46.9：額外屬性與特殊詞綴同屬「無 Tier」 */
describe('額外屬性詞綴與印記', () => {
  it('精鍊與突破都不受理', () => {
    for (const type of ['temper', 'enhance'] as const) {
      const r = canUseSigil(type, [attrAffix], 0, check);
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('額外屬性');
    }
    expect(getUpgradeSigilFor(attrAffix)).toBeUndefined();
  });

  it('重刻不受理 —— 它沒有數值可重骰', () => {
    const r = canUseSigil('recarve', [attrAffix], 0, check);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('額外屬性');
  });

  it('apply 端自己也擋，不只靠 canUseSigil', () => {
    expect(applyRecarveSigil([attrAffix], 0, ctx()).success).toBe(false);
    expect(applyRecarveSigil([attrAffix], 0, ctx()).affixes).toEqual([attrAffix]);
    expect(applyTemperSigil([attrAffix], 0, {}).success).toBe(false);
  });

  it('刺針換得掉', () => {
    expect(canUseSigil('sting', [attrAffix], 0, check).ok).toBe(true);
    const out = applyStingSigil([attrAffix], 0, ctx());
    expect(out.success).toBe(true);
    expect(out.affixes[0].type).not.toBe('bonus_attribute');
  });

  it('刺針換成額外屬性時：無 Tier、值 +1、當下抽屬性', () => {
    const seen = new Set<string>();
    let hit = 0;
    for (let i = 0; i < 800; i++) {
      const out = applyStingSigil([normal], 0, ctx());
      const a = out.affixes[0];
      if (!isAttributeAffixType(a.type)) continue;
      hit++;
      expect(a.tier).toBe(0);
      expect(a.value).toBe(1);
      seen.add(a.attribute!);
    }
    expect(hit).toBeGreaterThan(0);
    expect([...seen].sort()).toEqual(['AGI', 'CHA', 'INT', 'SPI', 'STR', 'VIT']);
  });

  it('原本是額外屬性、換成一般詞綴時沒有 Tier 可繼承，固定 T5', () => {
    for (let i = 0; i < 200; i++) {
      const a = applyStingSigil([attrAffix], 0, ctx()).affixes[0];
      if (isAttributeAffixType(a.type) || a.tier === 0) continue;
      expect(a.tier).toBe(5);
    }
  });
});

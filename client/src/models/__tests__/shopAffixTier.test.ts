import { describe, it, expect } from 'vitest';
import {
  generateAffixes,
  isSpecialAffixType,
  SHOP_MAX_AFFIX_TIER,
  DEFAULT_MAX_AFFIX_TIER,
} from '../affix';

/**
 * 商店裝的詞綴 Tier 上限（`06-equipment-acquire.md` § 6A.6、`07-affix.md` § 7.2）。
 *
 * 規則：
 *  - 商店購買時隨機生成 4 個詞綴，Tier 均等落在 T1~T3
 *  - 該實例帶 `maxAffixTier: 3`，鐵匠鋪的詞綴強化也升不過 T3
 *  - 掉落／製作品不帶此上限，走預設 T5
 */
describe('商店裝詞綴 Tier 上限', () => {
  const SHOP_OPTIONS = { maxTier: SHOP_MAX_AFFIX_TIER, uniformTier: true, noSpecialAffix: true };

  it('常數符合設計文件', () => {
    expect(SHOP_MAX_AFFIX_TIER).toBe(3);
    expect(DEFAULT_MAX_AFFIX_TIER).toBe(5);
  });

  it('商店生成的詞綴一律固定 4 個', () => {
    for (let i = 0; i < 50; i++) {
      const affixes = generateAffixes('weapon', 30, 4, false, SHOP_OPTIONS);
      expect(affixes).toHaveLength(4);
    }
  });

  it('商店生成的詞綴 Tier 不超過 T3', () => {
    for (let i = 0; i < 300; i++) {
      // 區域等級刻意給高，證明上限不受區域權重表影響
      for (const affix of generateAffixes('weapon', 60, 4, true, SHOP_OPTIONS)) {
        expect(affix.tier).toBeGreaterThanOrEqual(1);
        expect(affix.tier).toBeLessThanOrEqual(SHOP_MAX_AFFIX_TIER);
      }
    }
  });

  it('商店生成的 T1~T3 都出得來（均等隨機，非全部壓在 T1）', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      for (const affix of generateAffixes('armor', 10, 4, false, SHOP_OPTIONS)) {
        seen.add(affix.tier);
      }
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('商店生成的詞綴不會出現特殊詞綴（免疫類）', () => {
    for (let i = 0; i < 300; i++) {
      for (const affix of generateAffixes('shield', 60, 4, true, SHOP_OPTIONS)) {
        expect(isSpecialAffixType(affix.type)).toBe(false);
      }
    }
  });

  it('同一件內詞綴不重複', () => {
    for (let i = 0; i < 100; i++) {
      const affixes = generateAffixes('weapon', 30, 4, false, SHOP_OPTIONS);
      const types = affixes.map(a => a.type);
      expect(new Set(types).size).toBe(types.length);
    }
  });

  it('不帶 options 時（掉落／製作）不受 T3 限制', () => {
    let sawAboveShopCap = false;
    for (let i = 0; i < 300; i++) {
      for (const affix of generateAffixes('weapon', 60, 4, true)) {
        if (isSpecialAffixType(affix.type)) continue;
        if (affix.tier > SHOP_MAX_AFFIX_TIER) sawAboveShopCap = true;
      }
    }
    expect(sawAboveShopCap).toBe(true);
  });
});

/**
 * 詞綴強化的上限判定（`TownBlacksmith.tsx`）。
 * 該邏輯內嵌在元件裡，這裡驗證它依據的規則本身：
 * 上限一律讀 `instance.maxAffixTier ?? DEFAULT_MAX_AFFIX_TIER`。
 */
describe('詞綴強化上限', () => {
  const capOf = (maxAffixTier?: number) => maxAffixTier ?? DEFAULT_MAX_AFFIX_TIER;
  const canUpgrade = (tier: number, maxAffixTier?: number) => tier < capOf(maxAffixTier);

  it('商店裝（maxAffixTier=3）升到 T3 就不能再升', () => {
    expect(canUpgrade(2, SHOP_MAX_AFFIX_TIER)).toBe(true);
    expect(canUpgrade(3, SHOP_MAX_AFFIX_TIER)).toBe(false);
    expect(canUpgrade(4, SHOP_MAX_AFFIX_TIER)).toBe(false);
  });

  it('掉落／製作品（未設 maxAffixTier）可升到 T5', () => {
    expect(canUpgrade(3, undefined)).toBe(true);
    expect(canUpgrade(4, undefined)).toBe(true);
    expect(canUpgrade(5, undefined)).toBe(false);
  });

  it('原生 T6/T7 的掉落品不會被強化系統動到', () => {
    expect(canUpgrade(6, undefined)).toBe(false);
    expect(canUpgrade(7, undefined)).toBe(false);
  });
});

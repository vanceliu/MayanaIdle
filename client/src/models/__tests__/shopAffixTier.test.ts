import { describe, it, expect } from 'vitest';
import {
  generateAffixes,
  isSpecialAffixType,
  SHOP_MAX_AFFIX_TIER,
  DEFAULT_MAX_AFFIX_TIER,
  CRAFT_MAX_AFFIX_TIER,
  getTierWeights,
  getBossTierWeights,
  rollAffixTier,
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

describe('製作品的詞綴上限（§ 6A.6）', () => {
  /**
   * 製作版與掉落版的差別完全在詞綴：模板素質相同，
   * 但掉落版可以帶 T6/T7 與特殊詞綴，製作版最高 T5、且不會有特殊詞綴。
   * T6 開放部分製作之後（§ 6A.8.0），這條差異就是掉落品仍然值得追的理由。
   */
  it('製作品的詞綴不超過 T5，也不會出特殊詞綴', () => {
    for (let i = 0; i < 300; i++) {
      const affixes = generateAffixes('weapon', 60, 4, false, {
        maxTier: CRAFT_MAX_AFFIX_TIER, uniformTier: true, noSpecialAffix: true,
      });
      for (const a of affixes) {
        expect(isSpecialAffixType(a.type), a.type).toBe(false);
        expect(a.tier).toBeGreaterThanOrEqual(1);
        expect(a.tier).toBeLessThanOrEqual(CRAFT_MAX_AFFIX_TIER);
      }
    }
  });

  it('掉落品可以超過 T5（同一支產生器，只是不帶上限）', () => {
    const tiers = new Set<number>();
    for (let i = 0; i < 500; i++) {
      for (const a of generateAffixes('weapon', 60, 4, true)) tiers.add(a.tier);
    }
    expect([...tiers].some(t => t > CRAFT_MAX_AFFIX_TIER)).toBe(true);
  });
});

describe('詞綴 Tier 的取得來源（§ 6A.6、`07-affix.md` § 7.7）', () => {
  /**
   * **一般小怪只到 T6，T7 只有 Boss 會掉。**
   * 這條規則靠權重表實現（一般怪的 T7 權重恆為 0），但權重表是一串裸數字，
   * 少打一個 0 就會讓小怪掉 T7 而沒人發現，因此在這裡守住。
   */
  it('一般怪的詞綴永遠不會到 T7', () => {
    for (const level of [5, 15, 25, 35, 45, 60, 75]) {
      const weights = getTierWeights(level);
      expect(weights[6], `Lv.${level} 的 T7 權重`).toBe(0);
    }
  });

  it('Boss 從 Lv.31 起才會掉 T7', () => {
    expect(getBossTierWeights(20)[6]).toBe(0);
    expect(getBossTierWeights(30)[6]).toBe(0);
    for (const level of [35, 45, 60]) {
      expect(getBossTierWeights(level)[6], `Lv.${level}`).toBeGreaterThan(0);
    }
  });

  it('T6 需要 Lv.31 以上（一般怪與 Boss 皆然）', () => {
    expect(getTierWeights(30)[5]).toBe(0);
    expect(getTierWeights(35)[5]).toBeGreaterThan(0);
    expect(getBossTierWeights(20)[5]).toBe(0);
    expect(getBossTierWeights(35)[5]).toBeGreaterThan(0);
  });

  it('實際滾出來的結果也遵守：一般怪不出 T7、Boss 會出', () => {
    const normal = new Set<number>();
    const boss = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      normal.add(rollAffixTier(60, false));
      boss.add(rollAffixTier(60, true));
    }
    expect([...normal].every(t => t <= 6)).toBe(true);
    expect(boss.has(7)).toBe(true);
  });
});

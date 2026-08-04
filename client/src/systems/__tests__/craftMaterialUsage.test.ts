import { describe, it, expect } from 'vitest';
import {
  getCraftUsage,
  hasCraftUsage,
  hasMaterialUsage,
  formatMaterialUsage,
  getCraftMaterialNames,
  getUsefulMaterialNames,
} from '../craftMaterialUsage';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { ITEM_DEFINITIONS } from '../../db/seed/itemSeeds';

/**
 * 製作用途是與 `iconTier`（稀有度）互相獨立的維度，唯一來源是
 * `EQUIPMENT_SEEDS.craftMaterials`（`30-items.md` § 素材 iconTier 對照）。
 */

describe('craftMaterialUsage 反查', () => {
  it('涵蓋所有配方裡出現過的素材，數量與 seed 一致', () => {
    const fromSeeds = new Set(
      EQUIPMENT_SEEDS.flatMap(e => e.craftMaterials?.map(m => m.name) ?? []),
    );
    expect(new Set(getCraftMaterialNames())).toEqual(fromSeeds);
  });

  it('純販售素材回傳 undefined 與空字串', () => {
    expect(hasMaterialUsage('破碎獸牙')).toBe(false);
    expect(getCraftUsage('破碎獸牙')).toBeUndefined();
    expect(formatMaterialUsage('破碎獸牙')).toBe('');
  });

  it('單一階配方素材顯示單一 tier', () => {
    expect(hasCraftUsage('石像碎片')).toBe(true);
    expect(getCraftUsage('石像碎片')!.tiers).toEqual([4]);
    expect(formatMaterialUsage('石像碎片')).toBe('T4 配方');
  });

  it('跨階配方素材列出所有 tier，升冪不重複', () => {
    const usage = getCraftUsage('龍骨碎片')!;
    expect(usage.tiers).toEqual([4, 5, 6]);
    expect(formatMaterialUsage('龍骨碎片')).toBe('T4／T5／T6 配方');
  });

  it('裝備清單依 tier 再依名稱排序，且與 seed 的實際配方相符', () => {
    const name = '奧里哈魯根精華';
    const usage = getCraftUsage(name)!;
    const expected = EQUIPMENT_SEEDS
      .filter(e => e.craftMaterials?.some(m => m.name === name))
      .map(e => e.name)
      .sort();

    expect(usage.equipment.map(e => e.name).sort()).toEqual(expected);
    const tiers = usage.equipment.map(e => e.tier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
  });

  it('防具與武器分開標記（Wiki 是不同路由）', () => {
    for (const name of getCraftMaterialNames()) {
      for (const equip of getCraftUsage(name)!.equipment) {
        const seed = EQUIPMENT_SEEDS.find(e => e.name === equip.name)!;
        expect(equip.isArmor).toBe(seed.type === 'armor');
      }
    }
  });

  it('每個配方素材在 ITEM_DEFINITIONS 裡都存在（配方沒有指向不存在的素材）', () => {
    const known = new Set(ITEM_DEFINITIONS.map(i => i.name));
    expect(getCraftMaterialNames().filter(n => !known.has(n))).toEqual([]);
  });
});

describe('鐵匠鋪強化用素材是不進配方的例外', () => {
  // 這兩個沒出現在任何 craftMaterials，只看配方會被當成純販售而被批量賣掉
  it('強化石與品質石不在裝備配方裡', () => {
    expect(hasCraftUsage('強化石')).toBe(false);
    expect(hasCraftUsage('品質石')).toBe(false);
  });

  it('但它們算「有用途」，批量販售必須保護', () => {
    expect(hasMaterialUsage('強化石')).toBe(true);
    expect(hasMaterialUsage('品質石')).toBe(true);
    expect(getUsefulMaterialNames()).toContain('強化石');
    expect(getUsefulMaterialNames()).toContain('品質石');
  });

  it('顯示自己的用途文字，不會被寫成「配方」', () => {
    expect(formatMaterialUsage('強化石')).toBe('鐵匠鋪詞綴強化');
    expect(formatMaterialUsage('品質石')).toBe('鐵匠鋪品質提升');
  });

  it('沒有裝備清單可列（不進配方）', () => {
    expect(getCraftUsage('強化石')).toBeUndefined();
    expect(getCraftUsage('品質石')).toBeUndefined();
  });
});

describe('用途與 iconTier 是兩個獨立維度', () => {
  it('同一個 iconTier 底下同時存在有用途與無用途的素材', () => {
    const byTier = new Map<number, { craft: number; noCraft: number }>();
    for (const def of ITEM_DEFINITIONS) {
      if (def.category !== 'material' || !def.iconTier) continue;
      const acc = byTier.get(def.iconTier) ?? { craft: 0, noCraft: 0 };
      if (hasMaterialUsage(def.name)) acc.craft++;
      else acc.noCraft++;
      byTier.set(def.iconTier, acc);
    }
    // 若某個 tier 只會是其中一種，顏色就能推出用途，這個維度也就沒必要存在
    const mixed = [...byTier.values()].filter(v => v.craft > 0 && v.noCraft > 0);
    expect(mixed.length).toBeGreaterThan(0);
  });
});

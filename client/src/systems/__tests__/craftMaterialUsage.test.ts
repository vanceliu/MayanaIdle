import { describe, it, expect } from 'vitest';
import {
  getCraftUsage,
  hasCraftUsage,
  hasMaterialUsage,
  formatMaterialUsage,
  getCraftMaterialIds,
  getUsefulMaterialIds,
} from '../craftMaterialUsage';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { ITEM_DEFINITIONS } from '../../db/seed/itemSeeds';
import { isArmorEquipment, isOffhandDefenseType } from '../../models/equipment';
import { getItemId } from '../../models/items';

/** 測試以名稱閱讀，實際傳的是 id */
const id = (name: string) => getItemId(name)!;

/**
 * 製作用途是與 `iconTier`（稀有度）互相獨立的維度，唯一來源是
 * `EQUIPMENT_SEEDS.craftMaterials`（`30-items.md` § 素材 iconTier 對照）。
 */

describe('craftMaterialUsage 反查', () => {
  it('涵蓋所有配方裡出現過的素材，數量與 seed 一致', () => {
    const fromSeeds = new Set(
      EQUIPMENT_SEEDS.flatMap(e => e.craftMaterials?.map(m => m.itemId) ?? []),
    );
    expect(new Set(getCraftMaterialIds())).toEqual(fromSeeds);
  });

  it('純販售素材回傳 undefined 與空字串', () => {
    expect(hasMaterialUsage(id('破碎獸牙'))).toBe(false);
    expect(getCraftUsage(id('破碎獸牙'))).toBeUndefined();
    expect(formatMaterialUsage(id('破碎獸牙'))).toBe('');
  });

  it('單一階配方素材顯示單一 tier', () => {
    expect(hasCraftUsage(id('石像碎片'))).toBe(true);
    expect(getCraftUsage(id('石像碎片'))!.tiers).toEqual([4]);
    expect(formatMaterialUsage(id('石像碎片'))).toBe('T4 配方');
  });

  it('跨階配方素材列出所有 tier，升冪不重複', () => {
    const usage = getCraftUsage(id('龍骨碎片'))!;
    expect(usage.tiers).toEqual([4, 5, 6]);
    expect(formatMaterialUsage(id('龍骨碎片'))).toBe('T4／T5／T6 配方');
  });

  it('裝備清單依 tier 再依名稱排序，且與 seed 的實際配方相符', () => {
    const name = '奧里哈魯根精華';
    const usage = getCraftUsage(id(name))!;
    const expected = EQUIPMENT_SEEDS
      .filter(e => e.craftMaterials?.some(m => m.itemId === id(name)))
      .map(e => e.name)
      .sort();

    expect(usage.equipment.map(e => e.name).sort()).toEqual(expected);
    const tiers = usage.equipment.map(e => e.tier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
  });

  it('防具與武器分開標記（Wiki 是不同路由）', () => {
    for (const materialId of getCraftMaterialIds()) {
      for (const equip of getCraftUsage(materialId)!.equipment) {
        const seed = EQUIPMENT_SEEDS.find(e => e.name === equip.name)!;
        expect(equip.isArmor).toBe(isArmorEquipment(seed.slot, seed.type));
      }
    }
  });

  it('盾牌／魔導書／臂甲標記成防具（`06-equipment.md` § 副手裝備）', () => {
    const offhandCrafts = EQUIPMENT_SEEDS.filter(
      e => isOffhandDefenseType(e.type) && e.craftMaterials?.length,
    );
    expect(offhandCrafts.length).toBeGreaterThan(0);

    for (const seed of offhandCrafts) {
      const usage = getCraftUsage(seed.craftMaterials![0].itemId)!;
      expect(usage.equipment.find(e => e.name === seed.name)?.isArmor).toBe(true);
    }
  });

  it('每個配方素材在 ITEM_DEFINITIONS 裡都存在（配方沒有指向不存在的素材）', () => {
    const known = new Set(ITEM_DEFINITIONS.map(i => i.id));
    expect(getCraftMaterialIds().filter(n => !known.has(n))).toEqual([]);
  });
});

describe('印記師用的印記是不進配方的例外', () => {
  // 這兩個沒出現在任何 craftMaterials，只看配方會被當成純販售
  it('精鍊印記與工藝印記不在裝備配方裡', () => {
    expect(hasCraftUsage(id('精鍊印記'))).toBe(false);
    expect(hasCraftUsage(id('工藝印記'))).toBe(false);
  });

  it('但它們算「有用途」，Wiki 的用途欄要標出來', () => {
    expect(hasMaterialUsage(id('精鍊印記'))).toBe(true);
    expect(hasMaterialUsage(id('工藝印記'))).toBe(true);
    expect(getUsefulMaterialIds()).toContain(id('精鍊印記'));
    expect(getUsefulMaterialIds()).toContain(id('工藝印記'));
  });

  it('顯示自己的用途文字，不會被寫成「配方」', () => {
    expect(formatMaterialUsage(id('精鍊印記'))).toBe('印記師詞綴升階');
    expect(formatMaterialUsage(id('工藝印記'))).toBe('印記師品質提升');
  });

  it('沒有裝備清單可列（不進配方）', () => {
    expect(getCraftUsage(id('精鍊印記'))).toBeUndefined();
    expect(getCraftUsage(id('工藝印記'))).toBeUndefined();
  });
});

describe('用途與 iconTier 是兩個獨立維度', () => {
  it('同一個 iconTier 底下同時存在有用途與無用途的素材', () => {
    const byTier = new Map<number, { craft: number; noCraft: number }>();
    for (const def of ITEM_DEFINITIONS) {
      if (def.category !== 'material' || !def.iconTier) continue;
      const acc = byTier.get(def.iconTier) ?? { craft: 0, noCraft: 0 };
      if (hasMaterialUsage(def.id)) acc.craft++;
      else acc.noCraft++;
      byTier.set(def.iconTier, acc);
    }
    // 若某個 tier 只會是其中一種，顏色就能推出用途，這個維度也就沒必要存在
    const mixed = [...byTier.values()].filter(v => v.craft > 0 && v.noCraft > 0);
    expect(mixed.length).toBeGreaterThan(0);
  });
});

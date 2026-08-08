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
import { SIGIL_DEFINITIONS, SIGIL_USAGE_LABEL } from '../../models/sigil';
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
  // 印記沒出現在任何 craftMaterials，只看配方會被當成純販售
  it('印記不在裝備配方裡', () => {
    for (const d of SIGIL_DEFINITIONS) {
      expect(hasCraftUsage(d.itemId), d.name).toBe(false);
      expect(getCraftUsage(d.itemId), d.name).toBeUndefined();
    }
  });

  /*
   * 六種都要標 —— 這張表原本是手寫 id，只列了工藝與精鍊，
   * 另外四種在背包裡就沒有 ⚒ 記號。改成由 SIGIL_DEFINITIONS 反查後不會再漏。
   */
  it('六種印記都算「有用途」，背包的 ⚒ 與 Wiki 用途欄都要標', () => {
    for (const d of SIGIL_DEFINITIONS) {
      expect(hasMaterialUsage(d.itemId), d.name).toBe(true);
      expect(getUsefulMaterialIds(), d.name).toContain(d.itemId);
    }
  });

  it('每種印記顯示自己的用途文字，不會被寫成「配方」', () => {
    for (const d of SIGIL_DEFINITIONS) {
      expect(formatMaterialUsage(d.itemId), d.name).toBe(SIGIL_USAGE_LABEL[d.type]);
      expect(formatMaterialUsage(d.itemId), d.name).not.toContain('配方');
    }
  });

  it('用途文字彼此不重複 —— 玩家看得出是哪一種加工', () => {
    const labels = SIGIL_DEFINITIONS.map(d => SIGIL_USAGE_LABEL[d.type]);
    expect(new Set(labels).size).toBe(labels.length);
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

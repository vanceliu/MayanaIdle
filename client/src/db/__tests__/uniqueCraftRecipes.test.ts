import { describe, it, expect } from 'vitest';
import { EQUIPMENT_SEEDS } from '../seed/equipmentSeeds';
import {
  UNIQUE_CRAFT_AMOUNTS, UNIQUE_CRAFT_FIXED_FIRST, UNIQUE_CRAFT_MATERIAL_POOLS, UNIQUE_CRAFT_TIERS,
  assignUniqueCraftMaterials, getUniqueCraftRotationPool, type UniqueCraftTier,
} from '../../models/uniqueCraft';
import { formatMaterialUsage, hasMaterialUsage } from '../../systems/craftMaterialUsage';
import { getItemId } from '../../models/items';

/** 獨特配方分配規則（`06-equipment-acquire.md` § 6A.3.1） */

const recipesOf = (tier: UniqueCraftTier) => EQUIPMENT_SEEDS.filter(t => t.tier === tier && t.craftMaterials?.length);

describe('獨特配方：seed 與產生器', () => {
  it('每個有 craftMaterials 的模板都有獨特配方，沒有 craftMaterials 的都沒有', () => {
    for (const t of EQUIPMENT_SEEDS) {
      expect(!!t.uniqueCraftMaterials?.length, t.name).toBe(!!t.craftMaterials?.length);
    }
  });

  it('seed 與產生器輸出一致（不手改個別配方）', () => {
    const generated = assignUniqueCraftMaterials(EQUIPMENT_SEEDS);
    const seeded = new Map(EQUIPMENT_SEEDS.filter(t => t.uniqueCraftMaterials).map(t => [t.id!, t.uniqueCraftMaterials]));
    expect(seeded).toEqual(generated);
  });

  it('可製作的模板都是 T4～T6', () => {
    const tiers = new Set(EQUIPMENT_SEEDS.filter(t => t.uniqueCraftMaterials).map(t => t.tier));
    expect([...tiers].sort()).toEqual([4, 5, 6]);
  });

  for (const tier of UNIQUE_CRAFT_TIERS) {
    describe(`T${tier}`, () => {
      const recipes = recipesOf(tier);

      it('種類數與數量依階級，材料取自該階材料池且同配方不重複', () => {
        for (const r of recipes) {
          const mats = r.uniqueCraftMaterials!;
          expect(mats.map(m => m.amount), r.name).toEqual([...UNIQUE_CRAFT_AMOUNTS[tier]]);
          expect(new Set(mats.map(m => m.itemId)).size, r.name).toBe(mats.length);
          for (const m of mats) expect(UNIQUE_CRAFT_MATERIAL_POOLS[tier], r.name).toContain(m.itemId);
        }
      });

      it('同階內材料組合不重複', () => {
        const signatures = recipes.map(r => r.uniqueCraftMaterials!.map(m => m.itemId).sort((a, b) => a - b).join(','));
        expect(new Set(signatures).size).toBe(recipes.length);
      });

      it('各材料使用次數平均（差距 ≤ 1），池內每種都有用到', () => {
        const usage = new Map(getUniqueCraftRotationPool(tier).map(id => [id, 0]));
        for (const r of recipes) {
          for (const m of r.uniqueCraftMaterials!) {
            if (m.itemId === UNIQUE_CRAFT_FIXED_FIRST[tier]) continue;
            usage.set(m.itemId, usage.get(m.itemId)! + 1);
          }
        }
        const counts = [...usage.values()];
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
        expect(Math.min(...counts)).toBeGreaterThan(0);
      });
    });
  }

  it('T6 第一種固定妖精王獠牙 ×8，其餘 3 種取自 Boss 專屬素材', () => {
    const fang = getItemId('妖精王獠牙');
    expect(UNIQUE_CRAFT_FIXED_FIRST[6]).toBe(fang);
    for (const r of recipesOf(6)) {
      const [first, ...rest] = r.uniqueCraftMaterials!;
      expect(first, r.name).toEqual({ itemId: fang, amount: 8 });
      for (const m of rest) expect(m.itemId, r.name).not.toBe(fang);
    }
  });

  it('T4／T5 材料池含 § 6A.3.1 列出的 Boss 專屬素材', () => {
    for (const name of ['試煉飛龍之鱗', '雪地之主的凍心', '惡魔之瞳']) expect(UNIQUE_CRAFT_MATERIAL_POOLS[4]).toContain(getItemId(name));
    for (const name of ['蛇魔毒囊', '獄王深海珠', '巨龍逆鱗', '皇女毒腺', '哥布林王冠碎片', '吸血鬼血晶', '殭屍王心臟', '約特勒龍鱗']) {
      expect(UNIQUE_CRAFT_MATERIAL_POOLS[5]).toContain(getItemId(name));
    }
  });

  it('製作用途由 seed 的獨特配方反查，有用途的素材不會被批量販售', () => {
    const tiersOf = new Map<number, Set<number>>();
    for (const t of EQUIPMENT_SEEDS) {
      for (const m of t.uniqueCraftMaterials ?? []) tiersOf.set(m.itemId, (tiersOf.get(m.itemId) ?? new Set()).add(t.tier!));
    }
    for (const [itemId, tiers] of tiersOf) {
      expect(hasMaterialUsage(itemId)).toBe(true);
      expect(formatMaterialUsage(itemId)).toContain(`${[...tiers].sort().map(t => `T${t}`).join('／')} 獨特配方`);
    }
  });
});

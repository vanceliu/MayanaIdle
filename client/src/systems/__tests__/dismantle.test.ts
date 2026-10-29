import { describe, it, expect } from 'vitest';
import { getDismantleYield } from '../crafting';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';

/** 鐵匠鋪拆解退還量（`06-equipment-acquire.md` § 6A.3「拆解」） */
describe('getDismantleYield', () => {
  const crafts = EQUIPMENT_SEEDS.filter(t => t.acquireType === 'craft');

  it.each([
    [4, [2, 2, 1]],
    [5, [3, 3, 2, 2]],
    [6, [4, 3, 3, 2]],
  ])('T%i 配方每種材料退一半，無條件進位', (tier, expected) => {
    const recipes = crafts.filter(t => t.tier === tier);
    expect(recipes.length).toBeGreaterThan(0);
    for (const tpl of recipes) {
      const yields = getDismantleYield(tpl)!;
      expect(yields.map(m => m.itemId)).toEqual(tpl.craftMaterials!.map(m => m.itemId));
      expect(yields.map(m => m.amount)).toEqual(expected);
    }
  });

  it('奇數進位、偶數減半', () => {
    const tpl = { acquireType: 'craft' as const, craftMaterials: [{ itemId: 1, amount: 1 }, { itemId: 2, amount: 7 }, { itemId: 3, amount: 8 }] };
    expect(getDismantleYield(tpl)).toEqual([{ itemId: 1, amount: 1 }, { itemId: 2, amount: 4 }, { itemId: 3, amount: 4 }]);
  });

  it('無配方的模板不可拆', () => {
    const nonCraft = EQUIPMENT_SEEDS.filter(t => t.acquireType !== 'craft');
    expect(nonCraft.some(t => t.tier === 7)).toBe(true);
    for (const tpl of nonCraft) expect(getDismantleYield(tpl)).toBeNull();
    expect(getDismantleYield(undefined)).toBeNull();
    expect(getDismantleYield({ acquireType: 'craft', craftMaterials: [] })).toBeNull();
  });
});

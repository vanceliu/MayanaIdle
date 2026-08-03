import { describe, it, expect } from 'vitest';
import { ITEM_DEFINITIONS } from '../seed/itemSeeds';

/**
 * 材料的販售規則（`06-equipment-acquire.md` § 6A.3、`06-equipment-materials.md`）。
 *
 * 魔法書材料原本「賣不掉」只是漏填 `sellPrice` 的副作用 —— 任何人補上價格
 * 就會讓玩家把魔法書的唯一來源賣掉。改成明確的 `noSell` 標記後由這裡守住。
 */
describe('材料販售規則', () => {
  const materials = ITEM_DEFINITIONS.filter(i => i.category === 'material');

  it('魔法書材料一律不可販售', () => {
    const books = materials.filter(m => m.name.startsWith('魔法書材料'));
    expect(books.length).toBeGreaterThan(0);
    for (const m of books) {
      expect(m.noSell, m.name).toBe(true);
    }
  });

  it('標記 noSell 的材料不得同時有售價', () => {
    const bad = materials
      .filter(m => m.noSell && (m.sellPrice ?? 0) > 0)
      .map(m => `${m.name}(${m.sellPrice}G)`);
    expect(bad).toEqual([]);
  });

  it('可販售的材料都有售價，否則會變成「看得到卻賣不掉」', () => {
    const bad = materials
      .filter(m => !m.noSell && !(m.sellPrice ?? 0))
      .map(m => m.name);
    expect(bad).toEqual([]);
  });
});

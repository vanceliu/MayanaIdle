import { describe, it, expect } from 'vitest';
import { buildBagLayout, moveBagSlot, sortBagLayout, type BagSlotMap } from '../bagLayout';
import type { EquipSlot } from '../equipment';

const item = (id: string) => ({ id });
const ids = (layout: ({ id: string } | null)[]) => layout.map(i => i?.id ?? null);

describe('buildBagLayout（§ 35.1.3）', () => {
  it('沒有手動位置時依預設順序從第 0 格填起', () => {
    const layout = buildBagLayout([item('a'), item('b'), item('c')], {}, 5);
    expect(ids(layout)).toEqual(['a', 'b', 'c', null, null]);
  });

  it('版面長度等於 maxSlots，未使用的格子為 null', () => {
    expect(buildBagLayout([item('a')], {}, 4)).toHaveLength(4);
    expect(buildBagLayout([], {}, 3)).toEqual([null, null, null]);
  });

  it('手動位置優先，其餘項目流入剩餘空格', () => {
    const layout = buildBagLayout([item('a'), item('b'), item('c')], { b: 4 }, 5);
    expect(ids(layout)).toEqual(['a', 'c', null, null, 'b']);
  });

  it('新增的物品自動補進最前面的空格，不影響手動位置', () => {
    const slotMap: BagSlotMap = { b: 4 };
    const before = buildBagLayout([item('a'), item('b')], slotMap, 5);
    expect(ids(before)).toEqual(['a', null, null, null, 'b']);

    const after = buildBagLayout([item('a'), item('b'), item('new')], slotMap, 5);
    expect(ids(after)).toEqual(['a', 'new', null, null, 'b']);
  });

  it('移除的物品自動讓出格子', () => {
    const layout = buildBagLayout([item('b')], { b: 4 }, 5);
    expect(ids(layout)).toEqual([null, null, null, null, 'b']);
  });

  it('手動位置越界時退回自動填格（例如卸下腰帶導致格數變少）', () => {
    // b 原本在第 60 格，格數縮到 3 之後應該退回自動排列而不是消失
    const layout = buildBagLayout([item('a'), item('b')], { b: 60 }, 3);
    expect(ids(layout)).toEqual(['a', 'b', null]);
  });

  it('兩個手動位置相撞時，後者退回自動填格（從第一個空格開始）', () => {
    const layout = buildBagLayout([item('a'), item('b')], { a: 2, b: 2 }, 4);
    expect(ids(layout)).toEqual(['b', null, 'a', null]);
  });

  it('項目數超過格數時只填滿可用格子', () => {
    const layout = buildBagLayout([item('a'), item('b'), item('c')], {}, 2);
    expect(ids(layout)).toEqual(['a', 'b']);
  });
});

describe('moveBagSlot（§ 35.1.3）', () => {
  it('拖到空格：單純移動', () => {
    const layout = buildBagLayout([item('a'), item('b')], {}, 5);
    const next = moveBagSlot(layout, {}, 0, 3);
    expect(next).toEqual({ a: 3 });
    expect(ids(buildBagLayout([item('a'), item('b')], next, 5))).toEqual(['b', null, null, 'a', null]);
  });

  it('拖到有物品的格子：兩者互換', () => {
    const layout = buildBagLayout([item('a'), item('b'), item('c')], {}, 5);
    const next = moveBagSlot(layout, {}, 0, 2);
    expect(next).toEqual({ a: 2, c: 0 });
    expect(ids(buildBagLayout([item('a'), item('b'), item('c')], next, 5))).toEqual(['c', 'b', 'a', null, null]);
  });

  it('拖到自己身上不變動', () => {
    const layout = buildBagLayout([item('a')], {}, 5);
    expect(moveBagSlot(layout, { a: 0 }, 0, 0)).toEqual({ a: 0 });
  });

  it('來源是空格時不變動', () => {
    const layout = buildBagLayout([item('a')], {}, 5);
    const slotMap = { a: 0 };
    expect(moveBagSlot(layout, slotMap, 3, 1)).toBe(slotMap);
  });

  it('目標越界時不變動', () => {
    const layout = buildBagLayout([item('a')], {}, 5);
    const slotMap = { a: 0 };
    expect(moveBagSlot(layout, slotMap, 0, 99)).toBe(slotMap);
  });

  it('剔除已不存在於版面上的舊項目，避免 session 內無限累積', () => {
    const layout = buildBagLayout([item('a'), item('b')], {}, 5);
    const next = moveBagSlot(layout, { gone: 4, a: 0 }, 0, 3);
    expect(next).toEqual({ a: 3 });
    expect(next.gone).toBeUndefined();
  });
});

describe('sortBagLayout（§ 35.8）', () => {
  const s = (id: string, type: string, name: string, equippedSlot?: EquipSlot) =>
    ({ id, type, name, equippedSlot });

  /** 整理結果轉成「格子順序」的 id 陣列，方便斷言 */
  const order = (map: BagSlotMap) =>
    Object.entries(map).sort((a, b) => a[1] - b[1]).map(([id]) => id);

  it('裝備中是獨立的第一順位，排在所有消耗品之前', () => {
    const map = sortBagLayout([
      s('potion', 'potion', '紅色藥水'),
      s('bagSword', 'equipment', '鐵劍'),
      s('wornHelm', 'equipment', '鐵頭盔', 'helmet'),
    ], 10);

    expect(order(map)).toEqual(['wornHelm', 'potion', 'bagSword']);
  });

  it('裝備中內部依裝備欄部位順序（SLOT_ORDER）', () => {
    const map = sortBagLayout([
      s('r2', 'equipment', 'A', 'ring2'),
      s('hand', 'equipment', 'Z', 'rightHand'),
      s('boots', 'equipment', 'M', 'boots'),
    ], 10);

    // rightHand → boots → ring2，與名稱字母無關
    expect(order(map)).toEqual(['hand', 'boots', 'r2']);
  });

  it('消耗品依 藥水 → 卷軸 → 素材 → 魔法書 → 背包裝備', () => {
    const map = sortBagLayout([
      s('e', 'equipment', '鐵劍'),
      s('sb', 'spellbook', '魔法書'),
      s('m', 'material', '銀礦石'),
      s('sc', 'scroll', '回城卷軸'),
      s('p', 'potion', '紅色藥水'),
    ], 10);

    expect(order(map)).toEqual(['p', 'sc', 'm', 'sb', 'e']);
  });

  it('同類內按名稱排列', () => {
    const map = sortBagLayout([
      s('b', 'potion', 'B'),
      s('a', 'potion', 'A'),
    ], 10);

    expect(order(map)).toEqual(['a', 'b']);
  });

  it('每個項目都拿到明確位置，從第 0 格連續排起', () => {
    const map = sortBagLayout([
      s('a', 'potion', '紅色藥水'),
      s('b', 'material', '銀礦石'),
    ], 10);

    expect(map).toEqual({ a: 0, b: 1 });
  });

  it('超出 maxSlots 的項目不寫入，退回自動填格', () => {
    const map = sortBagLayout([
      s('a', 'potion', 'A'),
      s('b', 'potion', 'B'),
      s('c', 'potion', 'C'),
    ], 2);

    expect(map).toEqual({ a: 0, b: 1 });
    expect(map.c).toBeUndefined();
  });

  it('整理結果覆蓋整理前的手動位置', () => {
    const items = [s('a', 'potion', '紅色藥水'), s('b', 'material', '銀礦石')];
    const layout = buildBagLayout(items, sortBagLayout(items, 5), 5);
    expect(ids(layout)).toEqual(['a', 'b', null, null, null]);
  });
});

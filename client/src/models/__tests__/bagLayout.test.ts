import { describe, it, expect } from 'vitest';
import { buildBagLayout, moveBagSlot, encodeBagDrag, decodeBagDrag, type BagSlotMap } from '../bagLayout';

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

describe('拖出背包的負載編解碼（§ 35.5.3）', () => {
  it('消耗品：帶著持有數量出去，供確認視窗顯示可丟數量', () => {
    const payload = { kind: 'bag' as const, name: '紅色藥水', amount: 37 };
    expect(decodeBagDrag(encodeBagDrag(payload))).toEqual(payload);
  });

  it('裝備：帶 equipmentId，數量固定 1', () => {
    const payload = { kind: 'equipment' as const, name: '鐵劍', amount: 1, equipmentId: 42 };
    expect(decodeBagDrag(encodeBagDrag(payload))).toEqual(payload);
  });

  it('非本系統的拖曳一律回 null（例如從桌面拖檔案進來）', () => {
    expect(decodeBagDrag(null)).toBeNull();
    expect(decodeBagDrag('')).toBeNull();
    expect(decodeBagDrag('not json')).toBeNull();
    expect(decodeBagDrag('{}')).toBeNull();
    expect(decodeBagDrag('{"kind":"evil","name":"x"}')).toBeNull();
    expect(decodeBagDrag('{"kind":"bag"}')).toBeNull();
  });

  it('數量異常時退回 1，不會產生 0 或負數', () => {
    expect(decodeBagDrag('{"kind":"bag","name":"藥水","amount":0}')?.amount).toBe(1);
    expect(decodeBagDrag('{"kind":"bag","name":"藥水","amount":-5}')?.amount).toBe(1);
    expect(decodeBagDrag('{"kind":"bag","name":"藥水"}')?.amount).toBe(1);
    expect(decodeBagDrag('{"kind":"bag","name":"藥水","amount":3.9}')?.amount).toBe(3);
  });
});

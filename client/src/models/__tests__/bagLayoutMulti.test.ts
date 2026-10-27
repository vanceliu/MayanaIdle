import { describe, it, expect } from 'vitest';
import { buildBagLayout, moveBagSlots } from '../bagLayout';

const item = (id: string) => ({ id });
const ids = (layout: ({ id: string } | null)[]) => layout.map(i => i?.id ?? null);

/** 依字串建版面：`.` 是空格，其餘一字元一個項目，全部有手動位置 */
function layoutOf(spec: string) {
  return [...spec].map(c => (c === '.' ? null : item(c)));
}

function apply(spec: string, from: number[], to: number) {
  const layout = layoutOf(spec);
  const items = layout.filter((i): i is { id: string } => i != null);
  const map = moveBagSlots(layout, {}, from, to);
  return ids(buildBagLayout(items, map, layout.length)).map(c => c ?? '.').join('');
}

describe('moveBagSlots（§ 35.1.5）', () => {
  it('依原版面順序從目標格連續排入，被佔格的物品依序換到空出的格子', () => {
    expect(apply('AB.Dxyz.', [0, 1, 3], 4)).toBe('xy.zABD.');
  });

  it('目標格往後放不下時起點往前退', () => {
    expect(apply('AB..xy', [0, 1], 5)).toBe('xy..AB');
  });

  it('目標範圍包含已選格時只移動需要移動的物品', () => {
    expect(apply('A.B.x', [0, 2], 1)).toBe('.AB.x');
  });

  it('選取順序不影響結果，一律依原版面順序', () => {
    expect(apply('AB....', [1, 0], 3)).toBe('...AB.');
  });

  it('空格與越界的索引被忽略', () => {
    expect(apply('A.....', [0, 1, 99], 4)).toBe('....A.');
  });

  it('沒有可移動的項目或目標越界時回傳原 slotMap', () => {
    const layout = layoutOf('A..');
    const map = { A: 0 };
    expect(moveBagSlots(layout, map, [1], 2)).toBe(map);
    expect(moveBagSlots(layout, map, [0], 3)).toBe(map);
  });

  it('沒有手動位置的項目也被寫入，不會因移動而重新流動', () => {
    const items = [item('a'), item('b'), item('c')];
    const layout = buildBagLayout(items, {}, 6);
    const map = moveBagSlots(layout, {}, [0], 4);
    expect(ids(buildBagLayout(items, map, 6))).toEqual([null, 'b', 'c', null, 'a', null]);
  });
});

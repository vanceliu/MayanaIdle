import { describe, it, expect } from 'vitest';
import { buildTalentBagLayout, type TalentBagCell } from '../talentBag';

/**
 * 天賦分頁沒有格數上限（`35-inventory-constraints.md` § 35.21.1）。
 *
 * 傳進去的列數只是**視覺下限**（列數對齊一般分頁，§ 35.21.3），
 * 拿它當容量的話，持有數一超過就會靜默少顯示幾項 —— 東西還在 DB 裡，
 * 玩家只會覺得掉落不見了。
 */

const COLUMNS = 5;

/** N 個鑲材格 */
const affixes = (n: number): TalentBagCell[] =>
  Array.from({ length: n }, (_, i) => ({ kind: 'affix' as const, id: i + 1 }));

function placed(layout: (unknown | null)[]) {
  return layout.filter(Boolean).length;
}

describe('天賦分頁容量', () => {
  it('項數少於下限時，維持下限的格數', () => {
    const layout = buildTalentBagLayout(affixes(3), {}, 20, COLUMNS);
    expect(layout).toHaveLength(20);
    expect(placed(layout)).toBe(3);
  });

  it('項數超過下限時往下長，一項都不能少', () => {
    const layout = buildTalentBagLayout(affixes(37), {}, 20, COLUMNS);
    expect(placed(layout)).toBe(37);
    expect(layout.length).toBeGreaterThanOrEqual(37);
  });

  it('長出來的格數補滿整列', () => {
    // 37 項 → 8 列 × 5 = 40 格
    expect(buildTalentBagLayout(affixes(37), {}, 20, COLUMNS)).toHaveLength(40);
  });

  it('剛好整列時不多長一列', () => {
    expect(buildTalentBagLayout(affixes(40), {}, 20, COLUMNS)).toHaveLength(40);
  });

  it('手動擺放的位置照樣生效', () => {
    const cells = affixes(30);
    const layout = buildTalentBagLayout(cells, { 'affix-30': 0 }, 20, COLUMNS);
    expect((layout[0] as { cell: TalentBagCell }).cell).toEqual({ kind: 'affix', id: 30 });
    expect(placed(layout)).toBe(30);
  });
});

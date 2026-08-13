import { describe, it, expect } from 'vitest';
import { buildTalentBagLayout, buildTalentBagCells, type TalentBagCell } from '../talentBag';
import { emptyConditions, type TalentSlot, type TalentSlotTier } from '../talent';

/**
 * 天賦分頁沒有格數上限（`35-inventory-constraints.md` § 35.21.1）。
 *
 * 傳進去的列數只是**視覺下限**（列數對齊一般分頁，§ 35.21.3），
 * 拿它當容量的話，持有數一超過就會靜默少顯示幾項 —— 東西還在 DB 裡，
 * 玩家只會覺得掉落不見了。
 */

const COLUMNS = 5;

const stacks = (...tiers: TalentSlotTier[]): TalentBagCell[] =>
  tiers.map(tier => ({ tier, count: 1 }));

function slot(tier: TalentSlotTier): TalentSlot {
  return {
    characterId: 1,
    tier,
    assignedType: null,
    templateId: null,
    order: null,
    enabled: true,
    conditions: emptyConditions(tier),
    action: null,
  };
}

function placed(layout: (unknown | null)[]) {
  return layout.filter(Boolean).length;
}

describe('天賦分頁容量', () => {
  it('項數少於下限時，維持下限的格數', () => {
    const layout = buildTalentBagLayout(stacks(1, 2), {}, 20, COLUMNS);
    expect(layout).toHaveLength(20);
    expect(placed(layout)).toBe(2);
  });

  it('項數超過下限時往下長，一項都不能少', () => {
    const layout = buildTalentBagLayout(stacks(1, 2, 3, 4), {}, 2, COLUMNS);
    expect(placed(layout)).toBe(4);
    expect(layout.length).toBeGreaterThanOrEqual(4);
  });

  it('長出來的格數補滿整列', () => {
    expect(buildTalentBagLayout(stacks(1, 2, 3, 4), {}, 2, COLUMNS)).toHaveLength(5);
  });

  it('手動擺放的位置照樣生效', () => {
    const layout = buildTalentBagLayout(stacks(1, 2, 3), { 'slot-3': 0 }, 20, COLUMNS);
    expect((layout[0] as { cell: TalentBagCell }).cell).toEqual({ tier: 3, count: 1 });
    expect(placed(layout)).toBe(3);
  });

  it('同階天賦格堆成一格帶數量，不是一格一個', () => {
    const cells = buildTalentBagCells([slot(1), slot(1), slot(1), slot(3)]);
    expect(cells).toEqual([{ tier: 1, count: 3 }, { tier: 3, count: 1 }]);
  });
});

import { describe, it, expect } from 'vitest';
import { getWeaponEnhanceOdds, getArmorEnhanceRate } from '../enhancement';

describe('武器強化成功率（06-equipment.md § 6.9）', () => {
  it('安定值 6：+1~+6 必定成功', () => {
    for (let lv = 1; lv <= 6; lv++) expect(getWeaponEnhanceOdds(lv, 6)).toEqual({ success: 1, noChange: 0, destroy: 0 });
  });

  it('+7~+9：1/3 成功、2/3 消失，沒有無變化', () => {
    for (const lv of [7, 8, 9]) {
      const odds = getWeaponEnhanceOdds(lv, 6);
      expect(odds.success).toBeCloseTo(1 / 3);
      expect(odds.noChange).toBe(0);
      expect(odds.destroy).toBeCloseTo(2 / 3);
    }
  });

  it('+10 起每一級：1/5 成功、2/5 無變化、2/5 消失', () => {
    for (const lv of [10, 11, 20]) {
      const odds = getWeaponEnhanceOdds(lv, 6);
      expect(odds.success).toBeCloseTo(1 / 5);
      expect(odds.noChange).toBeCloseTo(2 / 5);
      expect(odds.destroy).toBeCloseTo(2 / 5);
    }
  });

  it('三種結果合計為 1', () => {
    for (let lv = 1; lv <= 15; lv++) {
      const { success, noChange, destroy } = getWeaponEnhanceOdds(lv, 6);
      expect(success + noChange + destroy).toBeCloseTo(1);
    }
  });
});

describe('防具強化成功率（06-equipment.md § 6.10 表格）', () => {
  // 文件表格：目標等級 → [安定值 6, 安定值 4, 安定值 0]
  const TABLE: [number, (number | 'sure')[]][] = [
    [1, ['sure', 'sure', 1 / 2]],
    [2, ['sure', 'sure', 1 / 2]],
    [3, ['sure', 'sure', 1 / 2]],
    [4, ['sure', 'sure', 1 / 2]],
    [5, ['sure', 1 / 4, 1 / 4]],
    [6, ['sure', 1 / 5, 1 / 5]],
    [7, [1 / 6, 1 / 6, 1 / 6]],
    [8, [1 / 7, 1 / 7, 1 / 7]],
    [9, [1 / 8, 1 / 8, 1 / 8]],
    [10, [1 / 9, 1 / 9, 1 / 9]],
  ];
  const STABILITIES = [6, 4, 0];

  it.each(TABLE)('目標 +%i 的成功率與文件表格一致', (level, expected) => {
    STABILITIES.forEach((stability, i) => {
      const want = expected[i];
      const got = getArmorEnhanceRate(level as number, stability);
      if (want === 'sure') expect(got).toBe(1.0);
      else expect(got).toBeCloseTo(want as number);
    });
  });

  it('安定值 0 的 +1 / +2 不可為必定成功（修正前的迴歸）', () => {
    expect(getArmorEnhanceRate(1, 0)).toBeLessThan(1.0);
    expect(getArmorEnhanceRate(2, 0)).toBeLessThan(1.0);
    expect(Number.isFinite(getArmorEnhanceRate(1, 0))).toBe(true);
  });

  it('成功率不遞增', () => {
    for (const stability of STABILITIES) {
      for (let lv = 2; lv <= 12; lv++) {
        expect(getArmorEnhanceRate(lv, stability)).toBeLessThanOrEqual(
          getArmorEnhanceRate(lv - 1, stability)
        );
      }
    }
  });
});

import { describe, it, expect } from 'vitest';
import { getWeaponEnhanceRate, getArmorEnhanceRate } from '../enhancement';

describe('武器強化成功率（06-equipment.md § 6.9）', () => {
  it('安定值 6：+1~+6 必定成功，+7 起 1/3', () => {
    for (let lv = 1; lv <= 6; lv++) expect(getWeaponEnhanceRate(lv, 6)).toBe(1.0);
    expect(getWeaponEnhanceRate(7, 6)).toBeCloseTo(1 / 3);
    expect(getWeaponEnhanceRate(10, 6)).toBeCloseTo(1 / 3);
  });

  it('安定值 0：從 +1 起就是 1/3', () => {
    expect(getWeaponEnhanceRate(1, 0)).toBeCloseTo(1 / 3);
    expect(getWeaponEnhanceRate(5, 0)).toBeCloseTo(1 / 3);
  });

  it('武器成功率不隨等級遞減（與防具是兩套獨立系統）', () => {
    expect(getWeaponEnhanceRate(8, 6)).toBe(getWeaponEnhanceRate(20, 6));
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

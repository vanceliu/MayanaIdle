import { describe, it, expect } from 'vitest';
import { calculatePressure, getNextPressureKills, getPressureDropMultiplier, rescalePressureKills, PRESSURE_DROP_CAP } from '../pressure';

describe('pressure system', () => {
  describe('calculatePressure', () => {
    it('should return 0 pressure with no kills on the map', () => {
      const result = calculatePressure(0);

      expect(result.pressure).toBe(0);
      expect(result.maxMonsters).toBe(3);
    });

    it('單人 0～199 隻為 P0', () => {
      expect(calculatePressure(199).pressure).toBe(0);
      expect(calculatePressure(199).maxMonsters).toBe(3);
    });

    it('全域 Pressure 倍率作用於累積擊殺數（19 § 19.9）', () => {
      expect(calculatePressure(100, 2).pressure).toBe(1);
      expect(calculatePressure(150, 2).pressure).toBe(2);
      expect(calculatePressure(599, 0.5).pressure).toBe(1);
    });

    it('門檻乘以在場人數（§ 26.3）', () => {
      expect(calculatePressure(399, 1, 2).pressure).toBe(0);
      expect(calculatePressure(400, 1, 2).pressure).toBe(1);
      expect(calculatePressure(600, 1, 2).pressure).toBe(2);
      expect(calculatePressure(1200, 1, 3).pressure).toBe(3);
    });

    it('倍率 0 時 Pressure 恆為 0', () => {
      expect(calculatePressure(5000, 0).pressure).toBe(0);
      expect(calculatePressure(5000, 0).maxMonsters).toBe(3);
    });

    it('單人 200 隻起每 100 隻推進一級', () => {
      expect(calculatePressure(200).pressure).toBe(1);
      expect(calculatePressure(200).maxMonsters).toBe(4);
      expect(calculatePressure(299).pressure).toBe(1);

      expect(calculatePressure(300).pressure).toBe(2);
      expect(calculatePressure(300).maxMonsters).toBe(5);

      expect(calculatePressure(699).pressure).toBe(5);
      expect(calculatePressure(699).maxMonsters).toBe(8);
    });

    it('should cap maxMonsters at 10 while pressure keeps climbing', () => {
      const result = calculatePressure(1500);
      expect(result.pressure).toBe(14);
      expect(result.maxMonsters).toBe(10);
    });

    it('should never return negative pressure', () => {
      expect(calculatePressure(-50).pressure).toBe(0);
    });
  });

  describe('getPressureDropMultiplier', () => {
    it('should be 1 at pressure 0', () => {
      expect(getPressureDropMultiplier(0)).toBe(1);
    });

    it('should add 0.2 per pressure level', () => {
      expect(getPressureDropMultiplier(1)).toBeCloseTo(1.2);
      expect(getPressureDropMultiplier(3)).toBeCloseTo(1.6);
    });

    /** maxMonsters 與生成間隔沒有這個上限，只有掉落倍率有（§ 26.3） */
    it('should cap at pressure 7 → x2.4', () => {
      expect(getPressureDropMultiplier(PRESSURE_DROP_CAP)).toBeCloseTo(2.4);
      expect(getPressureDropMultiplier(20)).toBeCloseTo(2.4);
    });
  });

  describe('getNextPressureKills', () => {
    it('倍率 1.0 時對應 § 26.3 表列的下一級起點', () => {
      expect(getNextPressureKills(0, 1)).toBe(200);
      expect(getNextPressureKills(3, 1)).toBe(500);
      expect(getNextPressureKills(1, 1, 3)).toBe(900);
    });

    it('換算全域倍率，達到回傳值的擊殺數正好推進一級', () => {
      for (const rate of [0.5, 2, 0.3]) {
        for (const p of [0, 2, 5]) {
          for (const members of [1, 3]) {
            const next = getNextPressureKills(p, rate, members)!;
            expect(calculatePressure(next, rate, members).pressure).toBe(p + 1);
            expect(calculatePressure(next - 1, rate, members).pressure).toBe(p);
          }
        }
      }
    });

    it('倍率 0 時沒有下一級', () => {
      expect(getNextPressureKills(0, 0)).toBeNull();
    });
  });

  describe('rescalePressureKills（§ 26.3「人數變動」）', () => {
    it('× 新人數 ÷ 舊人數，無條件捨去；人數不變或為 0 時原樣', () => {
      expect(rescalePressureKills(250, 1, 3)).toBe(750);
      expect(rescalePressureKills(751, 3, 2)).toBe(500);
      expect(rescalePressureKills(500, 2, 2)).toBe(500);
      expect(rescalePressureKills(500, 0, 1)).toBe(500);
    });

    it('縮放後 Pressure 不變', () => {
      for (const kills of [0, 99, 100, 299, 777, 1234]) {
        for (const [from, to] of [[1, 2], [2, 3], [3, 1], [5, 4]]) {
          const scaled = rescalePressureKills(kills, from, to);
          expect(calculatePressure(scaled, 1, to).pressure).toBe(calculatePressure(kills, 1, from).pressure);
        }
      }
    });
  });
});

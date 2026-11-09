import { describe, it, expect } from 'vitest';
import { calculatePressure, getNextPressureKills, getPressureDropMultiplier, PRESSURE_DROP_CAP } from '../pressure';

describe('pressure system', () => {
  describe('calculatePressure', () => {
    it('should return 0 pressure with no kills on the map', () => {
      const result = calculatePressure(0);

      expect(result.pressure).toBe(0);
      expect(result.maxMonsters).toBe(3);
    });

    it('should stay at 0 pressure below the 300-kill threshold', () => {
      expect(calculatePressure(139).pressure).toBe(0);
      expect(calculatePressure(299).pressure).toBe(0);
      expect(calculatePressure(299).maxMonsters).toBe(3);
    });

    it('全域 Pressure 倍率作用於累積擊殺數（19 § 19.9）', () => {
      expect(calculatePressure(150, 2).pressure).toBe(1);
      expect(calculatePressure(230, 2).pressure).toBe(2);
      expect(calculatePressure(600, 0.5).pressure).toBe(1);
    });

    it('倍率 0 時 Pressure 恆為 0', () => {
      expect(calculatePressure(5000, 0).pressure).toBe(0);
      expect(calculatePressure(5000, 0).maxMonsters).toBe(3);
    });

    it('should increase pressure by 1 every 160 kills past P1', () => {
      expect(calculatePressure(300).pressure).toBe(1);
      expect(calculatePressure(300).maxMonsters).toBe(4);

      expect(calculatePressure(460).pressure).toBe(2);
      expect(calculatePressure(460).maxMonsters).toBe(5);

      expect(calculatePressure(780).pressure).toBe(4);
      expect(calculatePressure(780).maxMonsters).toBe(7);
    });

    it('should cap maxMonsters at 10 while pressure keeps climbing', () => {
      const result = calculatePressure(2400);
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
      expect(getNextPressureKills(0, 1)).toBe(300);
      expect(getNextPressureKills(3, 1)).toBe(780);
    });

    it('換算全域倍率，達到回傳值的擊殺數正好推進一級', () => {
      for (const rate of [0.5, 2, 0.3]) {
        for (const p of [0, 2, 5]) {
          const next = getNextPressureKills(p, rate)!;
          expect(calculatePressure(next, rate).pressure).toBe(p + 1);
          expect(calculatePressure(next - 1, rate).pressure).toBe(p);
        }
      }
    });

    it('倍率 0 時沒有下一級', () => {
      expect(getNextPressureKills(0, 0)).toBeNull();
    });
  });
});

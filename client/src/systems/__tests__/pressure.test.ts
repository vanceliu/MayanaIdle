import { describe, it, expect } from 'vitest';
import { calculatePressure, getPressureDropMultiplier, PRESSURE_DROP_CAP } from '../pressure';

describe('pressure system', () => {
  describe('calculatePressure', () => {
    it('should return 0 pressure with no kills on the map', () => {
      const result = calculatePressure(0);

      expect(result.pressure).toBe(0);
      expect(result.maxMonsters).toBe(3);
    });

    it('should stay at 0 pressure below the 640-kill threshold', () => {
      expect(calculatePressure(479).pressure).toBe(0);
      expect(calculatePressure(639).pressure).toBe(0);
      expect(calculatePressure(639).maxMonsters).toBe(3);
    });

    it('should increase pressure by 1 every 160 kills past the base', () => {
      expect(calculatePressure(640).pressure).toBe(1);
      expect(calculatePressure(640).maxMonsters).toBe(4);

      expect(calculatePressure(800).pressure).toBe(2);
      expect(calculatePressure(800).maxMonsters).toBe(5);

      expect(calculatePressure(1120).pressure).toBe(4);
      expect(calculatePressure(1120).maxMonsters).toBe(7);
    });

    it('should cap maxMonsters at 10 while pressure keeps climbing', () => {
      const result = calculatePressure(2400);
      expect(result.pressure).toBe(12);
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
});

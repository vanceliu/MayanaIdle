import { describe, it, expect } from 'vitest';
import { calculatePressure } from '../pressure';

describe('pressure system', () => {
  describe('calculatePressure', () => {
    it('should return 0 pressure when just entered', () => {
      const now = Date.now();
      const enteredAt = now - 30 * 1000;

      const result = calculatePressure(enteredAt, now);

      expect(result.pressure).toBe(0);
      expect(result.maxMonsters).toBe(3);
    });

    it('should return 0 pressure within first 30 minutes', () => {
      const now = Date.now();

      const result20min = calculatePressure(now - 20 * 60 * 1000, now);
      expect(result20min.pressure).toBe(0);
      expect(result20min.maxMonsters).toBe(3);

      const result30min = calculatePressure(now - 30 * 60 * 1000, now);
      expect(result30min.pressure).toBe(0);
      expect(result30min.maxMonsters).toBe(3);
    });

    it('should increase pressure by 1 every 10 minutes after 30 minutes', () => {
      const now = Date.now();

      const result40min = calculatePressure(now - 40 * 60 * 1000, now);
      expect(result40min.pressure).toBe(1);
      expect(result40min.maxMonsters).toBe(4);

      const result50min = calculatePressure(now - 50 * 60 * 1000, now);
      expect(result50min.pressure).toBe(2);
      expect(result50min.maxMonsters).toBe(5);

      const result70min = calculatePressure(now - 70 * 60 * 1000, now);
      expect(result70min.pressure).toBe(4);
      expect(result70min.maxMonsters).toBe(7);
    });

    it('should cap maxMonsters at 10', () => {
      const now = Date.now();
      const result = calculatePressure(now - 120 * 60 * 1000, now); // 120 min → pressure 9
      expect(result.pressure).toBe(9);
      expect(result.maxMonsters).toBe(10);
    });

    it('should preserve areaEnteredAt in result', () => {
      const enteredAt = 1000000;
      const result = calculatePressure(enteredAt, enteredAt + 120000);
      expect(result.areaEnteredAt).toBe(enteredAt);
    });
  });
});

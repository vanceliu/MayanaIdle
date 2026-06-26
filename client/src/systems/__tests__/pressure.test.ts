import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculatePressure, rollEncounterCount, rollEncounter } from '../pressure';

describe('pressure system', () => {
  describe('calculatePressure', () => {
    it('should return 0 pressure when just entered (less than 1 minute)', () => {
      const now = Date.now();
      const enteredAt = now - 30 * 1000; // 30 seconds ago

      const result = calculatePressure(enteredAt, now);

      expect(result.pressure).toBe(0);
    });

    it('should return 0 pressure at exactly 1 minute', () => {
      const now = Date.now();
      const enteredAt = now - 60 * 1000;

      const result = calculatePressure(enteredAt, now);

      expect(result.pressure).toBe(0);
    });

    it('should return 0 pressure within first 30 minutes', () => {
      const now = Date.now();

      const result20min = calculatePressure(now - 20 * 60 * 1000, now);
      expect(result20min.pressure).toBe(0);

      const result30min = calculatePressure(now - 30 * 60 * 1000, now);
      expect(result30min.pressure).toBe(0);
    });

    it('should increase pressure by 1 every 10 minutes after 30 minutes', () => {
      const now = Date.now();

      const result40min = calculatePressure(now - 40 * 60 * 1000, now);
      expect(result40min.pressure).toBe(1);

      const result50min = calculatePressure(now - 50 * 60 * 1000, now);
      expect(result50min.pressure).toBe(2);

      const result70min = calculatePressure(now - 70 * 60 * 1000, now);
      expect(result70min.pressure).toBe(4);
    });

    it('should calculate maxEncounterCount as partySize*2 + pressure', () => {
      const now = Date.now();
      const enteredAt = now - 50 * 60 * 1000; // 50 minutes → pressure 2

      const result = calculatePressure(enteredAt, now, 1);

      expect(result.maxEncounterCount).toBe(2 + 2); // baseMax(1*2) + pressure(2)
    });

    it('should scale with party size', () => {
      const now = Date.now();
      const enteredAt = now - 50 * 60 * 1000; // 50 minutes → pressure 2

      const solo = calculatePressure(enteredAt, now, 1);
      const duo = calculatePressure(enteredAt, now, 2);

      expect(duo.maxEncounterCount).toBeGreaterThan(solo.maxEncounterCount);
      expect(duo.maxEncounterCount).toBe(4 + 2); // 2*2 + pressure(2)
    });

    it('should preserve areaEnteredAt in result', () => {
      const enteredAt = 1000000;
      const result = calculatePressure(enteredAt, enteredAt + 120000);
      expect(result.areaEnteredAt).toBe(enteredAt);
    });
  });

  describe('rollEncounterCount', () => {
    it('should return between partySize and partySize*2+pressure', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const count = rollEncounterCount(1, 0);
      // min=1, max=2+0=2, range=2, floor(0.5*2)+1 = 2
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(2);
    });

    it('should increase range with pressure', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      const count = rollEncounterCount(1, 5);
      // min=1, max=2+5=7
      expect(count).toBeLessThanOrEqual(7);
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should return minimum 1 for solo', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const count = rollEncounterCount(1, 0);
      expect(count).toBe(1);
    });

    it('should return max for high roll', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      const count = rollEncounterCount(1, 3);
      // max = 1*2 + 3 = 5
      expect(count).toBe(5);
    });
  });

  describe('rollEncounter', () => {
    it('should return true when roll < 0.10', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.05);
      expect(rollEncounter()).toBe(true);
    });

    it('should return false when roll >= 0.10', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      expect(rollEncounter()).toBe(false);
    });

    it('should have roughly 10% encounter rate', () => {
      vi.restoreAllMocks();
      let encounters = 0;
      const trials = 10000;
      for (let i = 0; i < trials; i++) {
        if (rollEncounter()) encounters++;
      }
      const rate = encounters / trials;
      expect(rate).toBeGreaterThan(0.07);
      expect(rate).toBeLessThan(0.13);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

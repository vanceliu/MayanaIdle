import { describe, it, expect, vi, afterEach } from 'vitest';
import { getExpToNextLevel, tryLevelUp, addExp, LEVEL_CAP } from '../levelUp';
import type { Character } from '../../models/character';

function createTestCharacter(overrides: Partial<Character> = {}): Character {
  return {
    name: 'TestHero',
    className: 'knight',
    level: 1,
    exp: 0,
    expToNext: 100,
    hp: 30,
    mp: 10,
    baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0,
    currentArea: 'dawn-plains',
    currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains',
    currentFloor: null,
    skills: [],
    areaEnteredAt: Date.now(),
    createdAt: Date.now(),
    userId: 1,
    quests: [],
    ...overrides,
  };
}

describe('levelUp system', () => {
  describe('getExpToNextLevel', () => {
    // § 4.9：100 × 1.15^k，k 的每級推進量 Lv≤65 為 1.15625、Lv65～99 為 0.73529、Lv99 起每級 ×1.3
    it('should hit the three anchors exactly', () => {
      expect(getExpToNextLevel(1)).toBe(100);
      expect(getExpToNextLevel(65)).toBe(3_101_988);
      expect(getExpToNextLevel(99)).toBe(102_114_213);
    });

    it('should keep the two anchors equal to the old curve at Lv75 and Lv100', () => {
      // 使用者定案：Lv65 沿用舊曲線的 Lv75 值，Lv99 沿用舊曲線的 Lv100 值
      expect(getExpToNextLevel(65)).toBe(Math.floor(100 * Math.pow(1.15, 74)));
      expect(getExpToNextLevel(99)).toBe(Math.floor(100 * Math.pow(1.15, 99)));
    });

    it('should follow the early segment below the pivot', () => {
      for (const lv of [2, 5, 20, 40, 64]) {
        expect(getExpToNextLevel(lv)).toBe(
          Math.floor(100 * Math.pow(1.15, (74 / 64) * (lv - 1))),
        );
      }
    });

    it('should follow the late segment above the pivot', () => {
      for (const lv of [66, 80, 99]) {
        expect(getExpToNextLevel(lv)).toBe(
          Math.floor(100 * Math.pow(1.15, 74 + (25 / 34) * (lv - 65))),
        );
      }
    });

    it('should multiply by 1.3 per level from Lv99', () => {
      for (const lv of [100, 110, 119]) {
        const ratio = getExpToNextLevel(lv) / getExpToNextLevel(99);
        expect(ratio).toBeCloseTo(Math.pow(1.3, lv - 99), 6);
      }
    });

    it('should be continuous at the pivot', () => {
      // 兩段在 Lv65 交會於同一值，段界不得跳號
      const before = getExpToNextLevel(64);
      const pivot = getExpToNextLevel(65);
      const after = getExpToNextLevel(66);
      expect(pivot).toBeGreaterThan(before);
      expect(after).toBeGreaterThan(pivot);
      // 後段較平緩：Lv65→66 的漲幅小於 Lv64→65
      expect(after / pivot).toBeLessThan(pivot / before);
    });

    it('should increase monotonically through Lv200', () => {
      for (let lv = 2; lv <= 200; lv++) {
        expect(getExpToNextLevel(lv)).toBeGreaterThan(getExpToNextLevel(lv - 1));
      }
    });
  });

  describe('tryLevelUp', () => {
    it('should not level up when exp < expToNext', () => {
      const char = createTestCharacter({ exp: 50, expToNext: 100 });
      const result = tryLevelUp(char);
      expect(result.level).toBe(1);
    });

    it('should level up when exp >= expToNext', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const char = createTestCharacter({ exp: 100, expToNext: 100 });
      const result = tryLevelUp(char);

      expect(result.level).toBe(2);
      expect(result.exp).toBe(0);
      expect(result.expToNext).toBe(getExpToNextLevel(2));
    });

    it('should carry over excess exp', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const char = createTestCharacter({ exp: 150, expToNext: 100 });
      const result = tryLevelUp(char);

      expect(result.level).toBe(2);
      expect(result.exp).toBe(50);
    });

    it('stops at the level cap; exp keeps accumulating (§ 4.9)', () => {
      const atCap = tryLevelUp(createTestCharacter({ level: LEVEL_CAP, exp: 999999999, expToNext: 1 }));
      expect(atCap.level).toBe(LEVEL_CAP);
      expect(atCap.exp).toBe(999999999);

      const below = tryLevelUp(createTestCharacter({ level: LEVEL_CAP - 1, exp: 999999999, expToNext: 1 }));
      expect(below.level).toBe(LEVEL_CAP);
      expect(below.exp).toBe(999999998);
    });

    it('does not touch HP/MP (refill is the caller’s job with effective max)', () => {
      const result = tryLevelUp(createTestCharacter({ hp: 10, mp: 2, exp: 100, expToNext: 100 }));
      expect(result.level).toBe(2);
      expect(result.hp).toBe(10);
      expect(result.mp).toBe(2);
    });

    it('should handle multi-level ups recursively', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      // Give enough exp for 2 levels: 100 + 115 = 215
      const char = createTestCharacter({ exp: 220, expToNext: 100 });
      const result = tryLevelUp(char);

      expect(result.level).toBe(3);
    });
  });

  describe('addExp', () => {
    it('should add experience to character', () => {
      const char = createTestCharacter({ exp: 0 });
      const result = addExp(char, 50);
      expect(result.exp).toBe(50);
      expect(result.level).toBe(1);
    });

    it('should trigger level up if exp exceeds threshold', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const char = createTestCharacter({ exp: 0 });
      const result = addExp(char, 120);

      expect(result.level).toBe(2);
      expect(result.exp).toBe(20);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

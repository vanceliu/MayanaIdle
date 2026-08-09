import { describe, it, expect, vi, afterEach } from 'vitest';
import { getExpToNextLevel, tryLevelUp, addExp, INITIAL_HP, INITIAL_MP } from '../levelUp';
import type { Character } from '../../models/character';

function createTestCharacter(overrides: Partial<Character> = {}): Character {
  return {
    name: 'TestHero',
    className: 'knight',
    level: 1,
    exp: 0,
    expToNext: 100,
    hp: 30,
    maxHp: 30,
    mp: 10,
    maxMp: 10,
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
    unspentAttributePoints: 0,
    quests: [],
    ...overrides,
  };
}

describe('levelUp system', () => {
  describe('getExpToNextLevel', () => {
    // § 4.9：100 × 1.15^k，k 的每級推進量 Lv≤65 為 1.15625、Lv≥65 為 0.73529
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
      for (const lv of [66, 80, 99, 120]) {
        expect(getExpToNextLevel(lv)).toBe(
          Math.floor(100 * Math.pow(1.15, 74 + (25 / 34) * (lv - 65))),
        );
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

  describe('INITIAL_HP / INITIAL_MP', () => {
    it('should have correct initial values', () => {
      expect(INITIAL_HP).toBe(30);
      expect(INITIAL_MP).toBe(10);
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

    it('should restore HP and MP to max on level up', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const char = createTestCharacter({ hp: 10, maxHp: 30, mp: 2, maxMp: 10, exp: 100, expToNext: 100 });
      const result = tryLevelUp(char);

      expect(result.hp).toBe(result.maxHp);
      expect(result.mp).toBe(result.maxMp);
    });

    it('should increase maxHp based on VIT', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const char = createTestCharacter({ exp: 100, expToNext: 100 });
      const result = tryLevelUp(char);

      // VIT=16: hpGain = randomInt(max(1,16-6)=10, max(2,16-3)=13) with random 0.5 → 10 + floor(0.5*4) = 12
      expect(result.maxHp).toBeGreaterThan(char.maxHp);
    });

    it('should increase maxMp based on SPI', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const char = createTestCharacter({ exp: 100, expToNext: 100 });
      const result = tryLevelUp(char);

      // SPI=10: mpGain = randomInt(max(1,10-6)=4, max(2,10-3)=7)
      expect(result.maxMp).toBeGreaterThan(char.maxMp);
    });

    it('should grant 1 attribute point per level above 50', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const char = createTestCharacter({ level: 50, exp: 999999999, expToNext: 1, unspentAttributePoints: 0 });
      const result = tryLevelUp(char);

      expect(result.level).toBeGreaterThan(50);
      expect(result.unspentAttributePoints).toBe(result.level - 50);
    });

    it('should stop granting attribute points once all six attributes are capped (§ 20.9)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const capped = { STR: 35, AGI: 35, VIT: 35, SPI: 35, INT: 35, CHA: 35 };
      const char = createTestCharacter({
        level: 51,
        exp: 999999999,
        expToNext: 1,
        unspentAttributePoints: 0,
        baseAttributes: capped,
      });
      const result = tryLevelUp(char);

      expect(result.level).toBeGreaterThan(51);
      expect(result.unspentAttributePoints).toBe(0);
    });

    it('should still grant points when caps are reached via bonusAttributes but one attribute is short', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const char = createTestCharacter({
        level: 51,
        exp: 999999999,
        expToNext: 1,
        unspentAttributePoints: 0,
        baseAttributes: { STR: 30, AGI: 35, VIT: 35, SPI: 35, INT: 35, CHA: 34 },
        bonusAttributes: { STR: 5, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      });
      const result = tryLevelUp(char);

      // CHA is 34 (< 35), so points keep coming
      expect(result.unspentAttributePoints).toBe(result.level - 51);
    });

    it('should preserve already-accumulated points when all attributes are capped', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const capped = { STR: 35, AGI: 35, VIT: 35, SPI: 35, INT: 35, CHA: 35 };
      const char = createTestCharacter({
        level: 51,
        exp: 999999999,
        expToNext: 1,
        unspentAttributePoints: 7,
        baseAttributes: capped,
      });
      const result = tryLevelUp(char);

      expect(result.unspentAttributePoints).toBe(7);
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

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
    it('should return 100 for level 1', () => {
      expect(getExpToNextLevel(1)).toBe(100);
    });

    it('should return 115 for level 2', () => {
      expect(getExpToNextLevel(2)).toBe(Math.floor(100 * Math.pow(1.15, 1)));
    });

    it('should scale exponentially', () => {
      const lv5 = getExpToNextLevel(5);
      const lv10 = getExpToNextLevel(10);
      const lv20 = getExpToNextLevel(20);

      expect(lv10).toBeGreaterThan(lv5);
      expect(lv20).toBeGreaterThan(lv10);
      // Verify exact formula
      expect(lv5).toBe(Math.floor(100 * Math.pow(1.15, 4)));
      expect(lv10).toBe(Math.floor(100 * Math.pow(1.15, 9)));
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

import { describe, it, expect } from 'vitest';
import { getHpRegen, getMpRegen, HP_REGEN_INTERVAL_MS, MP_REGEN_INTERVAL_MS } from '../regen';
import type { Character } from '../../models/character';

function createTestCharacter(overrides: Partial<Character> = {}): Character {
  return {
    name: 'TestHero',
    className: 'knight',
    level: 5,
    exp: 0,
    expToNext: 100,
    hp: 100,
    maxHp: 100,
    mp: 30,
    maxMp: 30,
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

describe('regen system', () => {
  describe('HP_REGEN_INTERVAL_MS / MP_REGEN_INTERVAL_MS', () => {
    it('should have correct intervals', () => {
      expect(HP_REGEN_INTERVAL_MS).toBe(5000);
      expect(MP_REGEN_INTERVAL_MS).toBe(6000);
    });
  });

  describe('getHpRegen', () => {
    it('should calculate base HP regen from VIT', () => {
      // VIT=16 → effVIT = floor(16/2)*2 = 16, base = floor(16/2) = 8
      const char = createTestCharacter();
      const regen = getHpRegen(char, false);
      expect(regen).toBe(8);
    });

    it('should halve HP regen in combat', () => {
      const char = createTestCharacter();
      const outCombat = getHpRegen(char, false);
      const inCombat = getHpRegen(char, true);
      expect(inCombat).toBe(Math.max(1, Math.floor(outCombat / 2)));
    });

    it('should return at least 1 in combat if base > 0', () => {
      const char = createTestCharacter({
        baseAttributes: { STR: 14, AGI: 14, VIT: 4, SPI: 10, INT: 10, CHA: 12 },
      });
      const regen = getHpRegen(char, true);
      expect(regen).toBeGreaterThanOrEqual(1);
    });

    it('should return 0 if effective VIT is too low', () => {
      const char = createTestCharacter({
        baseAttributes: { STR: 14, AGI: 14, VIT: 1, SPI: 10, INT: 10, CHA: 12 },
      });
      // effVIT = floor(1/2)*2 = 0, base = floor(0/2) = 0
      const regen = getHpRegen(char, false);
      expect(regen).toBe(0);
    });

    it('should include bonus attributes', () => {
      const char = createTestCharacter({
        bonusAttributes: { STR: 0, AGI: 0, VIT: 10, SPI: 0, INT: 0, CHA: 0 },
      });
      // total VIT = 16+10 = 26, effVIT = floor(26/2)*2 = 26, base = floor(26/2) = 13
      const regen = getHpRegen(char, false);
      expect(regen).toBe(13);
    });
  });

  describe('getMpRegen', () => {
    it('should calculate base MP regen from SPI', () => {
      // SPI=10 → effSPI = floor(10/2)*2 = 10, base = floor(10/2) = 5
      const char = createTestCharacter();
      const regen = getMpRegen(char, false);
      expect(regen).toBe(5);
    });

    it('should halve MP regen in combat', () => {
      const char = createTestCharacter();
      const outCombat = getMpRegen(char, false);
      const inCombat = getMpRegen(char, true);
      expect(inCombat).toBe(Math.max(1, Math.floor(outCombat / 2)));
    });

    it('should scale with higher SPI', () => {
      const char = createTestCharacter({
        baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 20, INT: 10, CHA: 12 },
      });
      // effSPI = floor(20/2)*2 = 20, base = floor(20/2) = 10
      const regen = getMpRegen(char, false);
      expect(regen).toBe(10);
    });
  });
});

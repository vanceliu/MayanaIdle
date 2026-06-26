import { describe, it, expect } from 'vitest';
import {
  CLASS_BASE_ATTRIBUTES,
  CLASS_TOTAL_POINTS,
  getAvailablePoints,
  getTotalAttributes,
  getEffectiveSTR,
  getEffectiveAGI,
  getEffectiveVIT,
  getEffectiveSPI,
  getEffectiveINT,
} from '../character';
import type { Character, ClassName } from '../character';

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
    unspentAttributePoints: 0,
    quests: [],
    areaEnteredAt: Date.now(),
    createdAt: Date.now(),
    userId: 1,
    ...overrides,
  };
}

describe('character model', () => {
  describe('CLASS_BASE_ATTRIBUTES', () => {
    const classes: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];

    it('should define all 5 classes', () => {
      classes.forEach(cls => {
        expect(CLASS_BASE_ATTRIBUTES[cls]).toBeDefined();
      });
    });

    it('should have 6 attributes for each class', () => {
      classes.forEach(cls => {
        const attrs = CLASS_BASE_ATTRIBUTES[cls];
        expect(Object.keys(attrs)).toEqual(['STR', 'AGI', 'VIT', 'SPI', 'INT', 'CHA']);
      });
    });

    it('should have different attribute distributions per class', () => {
      expect(CLASS_BASE_ATTRIBUTES.knight.VIT).toBeGreaterThan(CLASS_BASE_ATTRIBUTES.thief.VIT);
      expect(CLASS_BASE_ATTRIBUTES.elementalist.INT).toBeGreaterThan(CLASS_BASE_ATTRIBUTES.knight.INT);
      expect(CLASS_BASE_ATTRIBUTES.priest.INT).toBeGreaterThan(CLASS_BASE_ATTRIBUTES.elementalist.INT);
      expect(CLASS_BASE_ATTRIBUTES.thief.AGI).toBeGreaterThanOrEqual(CLASS_BASE_ATTRIBUTES.knight.AGI);
    });
  });

  describe('getAvailablePoints', () => {
    it('should calculate remaining allocation points (80 - sum of base)', () => {
      const classes: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];
      classes.forEach(cls => {
        const base = CLASS_BASE_ATTRIBUTES[cls];
        const sum = Object.values(base).reduce((a, b) => a + b, 0);
        const available = getAvailablePoints(cls);
        expect(available).toBe(CLASS_TOTAL_POINTS - sum);
        expect(available).toBeGreaterThanOrEqual(0);
      });
    });

    it('knight should have some points to allocate', () => {
      // Knight base: 14+14+16+10+10+12 = 76, available = 80-76 = 4
      expect(getAvailablePoints('knight')).toBe(4);
    });

    it('priest should have some points to allocate', () => {
      // Priest base: 6+8+10+12+18+15 = 69, available = 80-69 = 11
      expect(getAvailablePoints('priest')).toBe(11);
    });
  });

  describe('getTotalAttributes', () => {
    it('should sum base and bonus attributes', () => {
      const char = createTestCharacter({
        baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
        bonusAttributes: { STR: 2, AGI: 0, VIT: 3, SPI: 0, INT: 0, CHA: 0 },
      });
      const total = getTotalAttributes(char);
      expect(total.STR).toBe(16);
      expect(total.VIT).toBe(19);
      expect(total.AGI).toBe(14);
    });

    it('should return base when bonus is all zeros', () => {
      const char = createTestCharacter();
      const total = getTotalAttributes(char);
      expect(total).toEqual(char.baseAttributes);
    });
  });

  describe('effective attribute functions', () => {
    it('getEffectiveSTR should round down to even multiple of 2', () => {
      expect(getEffectiveSTR(14)).toBe(14);
      expect(getEffectiveSTR(15)).toBe(14);
      expect(getEffectiveSTR(16)).toBe(16);
      expect(getEffectiveSTR(1)).toBe(0);
    });

    it('getEffectiveAGI should round down to multiple of 3', () => {
      expect(getEffectiveAGI(14)).toBe(12);
      expect(getEffectiveAGI(15)).toBe(15);
      expect(getEffectiveAGI(12)).toBe(12);
      expect(getEffectiveAGI(2)).toBe(0);
    });

    it('getEffectiveVIT should round down to even multiple of 2', () => {
      expect(getEffectiveVIT(16)).toBe(16);
      expect(getEffectiveVIT(17)).toBe(16);
      expect(getEffectiveVIT(3)).toBe(2);
    });

    it('getEffectiveSPI should round down to even multiple of 2', () => {
      expect(getEffectiveSPI(10)).toBe(10);
      expect(getEffectiveSPI(11)).toBe(10);
      expect(getEffectiveSPI(1)).toBe(0);
    });

    it('getEffectiveINT should round down to even multiple of 2', () => {
      expect(getEffectiveINT(10)).toBe(10);
      expect(getEffectiveINT(13)).toBe(12);
    });
  });
});

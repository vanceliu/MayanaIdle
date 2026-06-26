import { describe, it, expect } from 'vitest';
import {
  CLASS_MAGIC_RESTRICTIONS,
  getLearnableMaxLevel,
  canLearnBasicMagic,
} from '../skillRestrictions';
import type { ClassName } from '../character';

describe('skillRestrictions', () => {
  describe('CLASS_MAGIC_RESTRICTIONS', () => {
    it('should define restrictions for all 5 classes', () => {
      const classes: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];
      classes.forEach(cls => {
        expect(CLASS_MAGIC_RESTRICTIONS[cls]).toBeDefined();
        expect(CLASS_MAGIC_RESTRICTIONS[cls].maxLevel).toBeGreaterThan(0);
        expect(CLASS_MAGIC_RESTRICTIONS[cls].maxSkills).toBeGreaterThan(0);
      });
    });

    it('knight maxLevel should be 1, maxSkills 5', () => {
      expect(CLASS_MAGIC_RESTRICTIONS.knight.maxLevel).toBe(1);
      expect(CLASS_MAGIC_RESTRICTIONS.knight.maxSkills).toBe(5);
    });

    it('elf maxLevel should be 6, maxSkills 30', () => {
      expect(CLASS_MAGIC_RESTRICTIONS.elf.maxLevel).toBe(6);
      expect(CLASS_MAGIC_RESTRICTIONS.elf.maxSkills).toBe(30);
    });

    it('elementalist maxLevel should be 10, maxSkills 50', () => {
      expect(CLASS_MAGIC_RESTRICTIONS.elementalist.maxLevel).toBe(10);
      expect(CLASS_MAGIC_RESTRICTIONS.elementalist.maxSkills).toBe(50);
    });

    it('priest maxLevel should be 10, maxSkills 50', () => {
      expect(CLASS_MAGIC_RESTRICTIONS.priest.maxLevel).toBe(10);
      expect(CLASS_MAGIC_RESTRICTIONS.priest.maxSkills).toBe(50);
    });

    it('thief maxLevel should be 4, maxSkills 20', () => {
      expect(CLASS_MAGIC_RESTRICTIONS.thief.maxLevel).toBe(4);
      expect(CLASS_MAGIC_RESTRICTIONS.thief.maxSkills).toBe(20);
    });
  });

  describe('getLearnableMaxLevel', () => {
    describe('knight', () => {
      it('cannot learn any magic before level 50', () => {
        expect(getLearnableMaxLevel('knight', 1)).toBe(0);
        expect(getLearnableMaxLevel('knight', 10)).toBe(0);
        expect(getLearnableMaxLevel('knight', 49)).toBe(0);
      });

      it('can learn level 1 magic at level 50', () => {
        expect(getLearnableMaxLevel('knight', 50)).toBe(1);
      });

      it('max level stays at 1 even at higher char levels', () => {
        expect(getLearnableMaxLevel('knight', 60)).toBe(1);
        expect(getLearnableMaxLevel('knight', 99)).toBe(1);
      });
    });

    describe('elf', () => {
      it('cannot learn magic at level 1-7', () => {
        expect(getLearnableMaxLevel('elf', 1)).toBe(0);
        expect(getLearnableMaxLevel('elf', 7)).toBe(0);
      });

      it('can learn level 1 magic at level 8', () => {
        expect(getLearnableMaxLevel('elf', 8)).toBe(1);
      });

      it('can learn level 2 magic at level 16', () => {
        expect(getLearnableMaxLevel('elf', 16)).toBe(2);
      });

      it('caps at level 6 regardless of char level', () => {
        expect(getLearnableMaxLevel('elf', 48)).toBe(6);
        expect(getLearnableMaxLevel('elf', 80)).toBe(6);
      });
    });

    describe('elementalist', () => {
      it('can learn level 1 magic at level 4', () => {
        expect(getLearnableMaxLevel('elementalist', 4)).toBe(1);
      });

      it('can learn level 5 magic at level 20', () => {
        expect(getLearnableMaxLevel('elementalist', 20)).toBe(5);
      });

      it('caps at level 10', () => {
        expect(getLearnableMaxLevel('elementalist', 40)).toBe(10);
        expect(getLearnableMaxLevel('elementalist', 99)).toBe(10);
      });
    });

    describe('priest', () => {
      it('can learn level 1 magic at level 5', () => {
        expect(getLearnableMaxLevel('priest', 5)).toBe(1);
      });

      it('can learn level 4 magic at level 20', () => {
        expect(getLearnableMaxLevel('priest', 20)).toBe(4);
      });

      it('caps at level 10', () => {
        expect(getLearnableMaxLevel('priest', 50)).toBe(10);
        expect(getLearnableMaxLevel('priest', 99)).toBe(10);
      });
    });

    describe('thief', () => {
      it('cannot learn magic at level 1-7', () => {
        expect(getLearnableMaxLevel('thief', 1)).toBe(0);
        expect(getLearnableMaxLevel('thief', 7)).toBe(0);
      });

      it('can learn level 1 magic at level 8', () => {
        expect(getLearnableMaxLevel('thief', 8)).toBe(1);
      });

      it('caps at level 4', () => {
        expect(getLearnableMaxLevel('thief', 32)).toBe(4);
        expect(getLearnableMaxLevel('thief', 99)).toBe(4);
      });
    });
  });

  describe('canLearnBasicMagic', () => {
    it('knight level 1 cannot learn any skill', () => {
      expect(canLearnBasicMagic('knight', 1, 1, 0)).toBe(false);
    });

    it('knight level 50 can learn level 1 skill', () => {
      expect(canLearnBasicMagic('knight', 50, 1, 0)).toBe(true);
    });

    it('knight level 50 cannot learn level 2 skill', () => {
      expect(canLearnBasicMagic('knight', 50, 2, 0)).toBe(false);
    });

    it('knight cannot exceed 5 skills', () => {
      expect(canLearnBasicMagic('knight', 50, 1, 5)).toBe(false);
    });

    it('elementalist level 4 can learn level 1 skill', () => {
      expect(canLearnBasicMagic('elementalist', 4, 1, 0)).toBe(true);
    });

    it('elementalist level 3 cannot learn any skill', () => {
      expect(canLearnBasicMagic('elementalist', 3, 1, 0)).toBe(false);
    });

    it('elementalist level 8 can learn up to level 2 skill', () => {
      expect(canLearnBasicMagic('elementalist', 8, 2, 0)).toBe(true);
      expect(canLearnBasicMagic('elementalist', 8, 3, 0)).toBe(false);
    });

    it('elf cannot learn level 7+ skills', () => {
      expect(canLearnBasicMagic('elf', 80, 7, 0)).toBe(false);
    });

    it('elf can learn level 6 at high enough char level', () => {
      expect(canLearnBasicMagic('elf', 48, 6, 0)).toBe(true);
    });

    it('respects maxSkills limit', () => {
      expect(canLearnBasicMagic('elementalist', 40, 1, 50)).toBe(false);
      expect(canLearnBasicMagic('priest', 50, 1, 50)).toBe(false);
      expect(canLearnBasicMagic('elf', 48, 1, 30)).toBe(false);
      expect(canLearnBasicMagic('thief', 32, 1, 20)).toBe(false);
    });

    it('thief level 32 can learn up to level 4', () => {
      expect(canLearnBasicMagic('thief', 32, 4, 0)).toBe(true);
      expect(canLearnBasicMagic('thief', 32, 5, 0)).toBe(false);
    });
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateAffixes,
  getAffixPoolForSlot,
  rollAffixTier,
  rollAffixValue,
  getEffectiveAffixValue,
  collectAffixBonuses,
  AFFIX_TIERS,
  AFFIX_DEFINITIONS,
} from '../affix';

describe('affix model', () => {
  describe('getAffixPoolForSlot', () => {
    it('should return only weapon affixes for weapons', () => {
      const pool = getAffixPoolForSlot('weapon');
      expect(pool.length).toBe(7);
      pool.forEach(def => {
        expect(def.category).toContain('weapon');
      });
    });

    it('should return only armor affixes for armor', () => {
      const pool = getAffixPoolForSlot('armor');
      expect(pool.length).toBe(7);
      pool.forEach(def => {
        expect(def.category).toContain('armor');
      });
    });

    it('should not overlap weapon and armor pools', () => {
      const weaponPool = getAffixPoolForSlot('weapon');
      const armorPool = getAffixPoolForSlot('armor');
      const weaponTypes = weaponPool.map(d => d.type);
      const armorTypes = armorPool.map(d => d.type);

      weaponTypes.forEach(t => {
        expect(armorTypes).not.toContain(t);
      });
    });

    it('should return armor + block_rate + magic_resist for shield', () => {
      // 盾牌可選 9 種：防具 7 + 格擋率（盾牌專屬）+ 魔法抗性（飾品／盾牌專屬，§ 7.6）
      const pool = getAffixPoolForSlot('shield');
      expect(pool.length).toBe(9);
      pool.forEach(def => {
        expect(def.category).toContain('shield');
      });
      const types = pool.map(d => d.type);
      expect(types).toContain('block_rate');
      expect(types).toContain('magic_resist');
      expect(types).toContain('defense');
    });
  });

  describe('AFFIX_TIERS', () => {
    it('should have 7 tiers', () => {
      expect(AFFIX_TIERS).toHaveLength(7);
    });

    it('should have increasing min/max values', () => {
      for (let i = 1; i < AFFIX_TIERS.length; i++) {
        expect(AFFIX_TIERS[i].min).toBeGreaterThan(AFFIX_TIERS[i - 1].min);
        expect(AFFIX_TIERS[i].max).toBeGreaterThan(AFFIX_TIERS[i - 1].max);
      }
    });

    it('should have T1 range 5-7 and T7 range 21-23', () => {
      expect(AFFIX_TIERS[0]).toEqual({ tier: 1, min: 5, max: 7 });
      expect(AFFIX_TIERS[6]).toEqual({ tier: 7, min: 21, max: 23 });
    });
  });

  describe('rollAffixTier', () => {
    it('should return tier between 1 and 5 for normal drops', () => {
      for (let i = 0; i < 100; i++) {
        const tier = rollAffixTier(15);
        expect(tier).toBeGreaterThanOrEqual(1);
        expect(tier).toBeLessThanOrEqual(5);
      }
    });

    it('should bias toward lower tiers at low area level', () => {
      let tierSum = 0;
      const trials = 1000;
      for (let i = 0; i < trials; i++) {
        tierSum += rollAffixTier(1);
      }
      const avgLow = tierSum / trials;

      tierSum = 0;
      for (let i = 0; i < trials; i++) {
        tierSum += rollAffixTier(30);
      }
      const avgHigh = tierSum / trials;

      expect(avgHigh).toBeGreaterThan(avgLow);
    });

    it('should return tier 1 when roll lands on first weight', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      expect(rollAffixTier(1)).toBe(1);
    });
  });

  describe('rollAffixValue', () => {
    it('should return value within tier range', () => {
      for (let tier = 1; tier <= 7; tier++) {
        const t = AFFIX_TIERS[tier - 1];
        for (let i = 0; i < 50; i++) {
          const value = rollAffixValue(tier);
          expect(value).toBeGreaterThanOrEqual(t.min);
          expect(value).toBeLessThanOrEqual(t.max);
        }
      }
    });
  });

  describe('generateAffixes', () => {
    it('should generate 4 affixes by default', () => {
      const affixes = generateAffixes('weapon', 10);
      expect(affixes).toHaveLength(4);
    });

    it('should generate specified slot count', () => {
      const affixes = generateAffixes('weapon', 10, 2);
      expect(affixes).toHaveLength(2);
    });

    it('should not exceed available pool size', () => {
      // Weapon pool has 7 types, asking for 10 should cap at 7
      const affixes = generateAffixes('weapon', 10, 10);
      expect(affixes).toHaveLength(7);
    });

    it('should not have duplicate affix types on same equipment', () => {
      for (let i = 0; i < 50; i++) {
        const affixes = generateAffixes('weapon', 15, 4);
        const types = affixes.map(a => a.type);
        const uniqueTypes = new Set(types);
        expect(uniqueTypes.size).toBe(types.length);
      }
    });

    it('should generate weapon affixes for weapons', () => {
      const weaponTypes = AFFIX_DEFINITIONS.filter(d => d.category.includes('weapon')).map(d => d.type);
      for (let i = 0; i < 20; i++) {
        const affixes = generateAffixes('weapon', 10);
        affixes.forEach(a => {
          expect(weaponTypes).toContain(a.type);
        });
      }
    });

    it('should generate armor affixes for armor', () => {
      const armorTypes = AFFIX_DEFINITIONS.filter(d => d.category.includes('armor')).map(d => d.type);
      for (let i = 0; i < 20; i++) {
        const affixes = generateAffixes('armor', 10);
        affixes.forEach(a => {
          expect(armorTypes).toContain(a.type);
        });
      }
    });

    it('should have valid tier and value for each affix', () => {
      const affixes = generateAffixes('weapon', 20, 4);
      affixes.forEach(a => {
        expect(a.tier).toBeGreaterThanOrEqual(1);
        expect(a.tier).toBeLessThanOrEqual(7);
        const t = AFFIX_TIERS[a.tier - 1];
        expect(a.value).toBeGreaterThanOrEqual(t.min);
        expect(a.value).toBeLessThanOrEqual(t.max);
      });
    });
  });

  describe('getEffectiveAffixValue', () => {
    it('should return base value at 0% quality', () => {
      const affix = { type: 'attack_power' as const, tier: 1, value: 5 };
      expect(getEffectiveAffixValue(affix, 0)).toBe(5);
    });

    it('should increase value with quality', () => {
      const affix = { type: 'attack_power' as const, tier: 3, value: 12 };
      // quality 10%: floor(12 * 1.10) = floor(13.2) = 13
      expect(getEffectiveAffixValue(affix, 10)).toBe(13);
    });

    it('should apply max quality (20%)', () => {
      const affix = { type: 'defense' as const, tier: 6, value: 20 };
      // quality 20%: floor(20 * 1.20) = 24
      expect(getEffectiveAffixValue(affix, 20)).toBe(24);
    });

    it('should floor the result', () => {
      const affix = { type: 'crit_rate' as const, tier: 1, value: 7 };
      // quality 5%: floor(7 * 1.05) = floor(7.35) = 7
      expect(getEffectiveAffixValue(affix, 5)).toBe(7);
    });
  });

  describe('collectAffixBonuses', () => {
    it('should return all zeros for empty gear', () => {
      const bonuses = collectAffixBonuses([]);
      expect(bonuses.attack_power).toBe(0);
      expect(bonuses.attack_elemental).toBe(0);
      expect(bonuses.skill_elemental).toBe(0);
      expect(bonuses.crit_rate).toBe(0);
      expect(bonuses.crit_damage).toBe(0);
      expect(bonuses.defense).toBe(0);
    });

    it('should sum affixes from multiple gear pieces', () => {
      const gear = [
        {
          affixes: [
            { type: 'attack_power' as const, tier: 2, value: 10 },
            { type: 'crit_rate' as const, tier: 1, value: 5 },
          ],
          quality: 0,
        },
        {
          affixes: [
            { type: 'attack_power' as const, tier: 3, value: 12 },
            { type: 'defense' as const, tier: 2, value: 9 },
          ],
          quality: 0,
        },
      ];
      const bonuses = collectAffixBonuses(gear);
      expect(bonuses.attack_power).toBe(22);
      expect(bonuses.crit_rate).toBe(5);
      expect(bonuses.defense).toBe(9);
    });

    it('should apply quality bonus to effective values', () => {
      const gear = [
        {
          affixes: [
            { type: 'attack_power' as const, tier: 3, value: 12 },
          ],
          quality: 10,
        },
      ];
      const bonuses = collectAffixBonuses(gear);
      // floor(12 * 1.10) = 13
      expect(bonuses.attack_power).toBe(13);
    });

    it('should handle gear with no affixes', () => {
      const gear = [
        { affixes: undefined, quality: 0 },
        { affixes: [], quality: 5 },
      ];
      const bonuses = collectAffixBonuses(gear as any);
      expect(bonuses.attack_power).toBe(0);
    });

    it('should correctly separate attack_elemental and skill_elemental', () => {
      const gear = [
        {
          affixes: [
            { type: 'attack_elemental' as const, tier: 3, value: 11 },
            { type: 'skill_elemental' as const, tier: 2, value: 9 },
          ],
          quality: 0,
        },
      ];
      const bonuses = collectAffixBonuses(gear);
      expect(bonuses.attack_elemental).toBe(11);
      expect(bonuses.skill_elemental).toBe(9);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateAffixes,
  getAffixPoolForSlot,
  rollAffixTier,
  rollAffixValue,
  getEffectiveAffixValue,
  isMaxRollAffix,
  collectAffixBonuses,
  formatAffixDescription,
  SPECIAL_AFFIX_DEFINITIONS,
  AFFIX_TIERS,
  AFFIX_DEFINITIONS,
} from '../affix';

describe('affix model', () => {
  describe('getAffixPoolForSlot', () => {
    it('should return only weapon affixes for weapons', () => {
      const pool = getAffixPoolForSlot('weapon');
      expect(pool.length).toBe(10);
      pool.forEach(def => {
        expect(def.category).toContain('weapon');
      });
    });

    it('should return only armor affixes for armor', () => {
      const pool = getAffixPoolForSlot('armor');
      expect(pool.length).toBe(13);
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
      // 盾牌可選 15 種：防具 13 + 格擋率（盾牌專屬）+ 魔法抗性（飾品／盾牌專屬，§ 7.6）
      const pool = getAffixPoolForSlot('shield');
      expect(pool.length).toBe(15);
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

    it('should have T1 range 3-5 and T7 range 19-20', () => {
      expect(AFFIX_TIERS[0]).toEqual({ tier: 1, min: 3, max: 5 });
      expect(AFFIX_TIERS[6]).toEqual({ tier: 7, min: 19, max: 20 });
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
      // Weapon pool has 10 types, asking for 12 should cap at 10
      const affixes = generateAffixes('weapon', 10, 12);
      expect(affixes).toHaveLength(10);
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
      expect(bonuses.element_brand).toBe(0);
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

    it('should correctly separate element_brand and skill_elemental', () => {
      const gear = [
        {
          affixes: [
            { type: 'element_brand' as const, tier: 3, value: 11, element: 'fire' as const },
            { type: 'skill_elemental' as const, tier: 2, value: 9 },
          ],
          quality: 0,
        },
      ];
      const bonuses = collectAffixBonuses(gear);
      expect(bonuses.element_brand).toBe(11);
      expect(bonuses.skill_elemental).toBe(9);
    });
  });

  // § 7.3.2 滾到 Tier 上限的詞綴以粗體標示
  describe('isMaxRollAffix', () => {
    it('should be true only when value hits the tier max', () => {
      // 通用表 T4 = 12~13
      expect(isMaxRollAffix({ type: 'attack_power', tier: 4, value: 13 })).toBe(true);
      expect(isMaxRollAffix({ type: 'attack_power', tier: 4, value: 12 })).toBe(false);
      // T7 = 19~20
      expect(isMaxRollAffix({ type: 'crit_damage', tier: 7, value: 20 })).toBe(true);
      expect(isMaxRollAffix({ type: 'crit_damage', tier: 7, value: 19 })).toBe(false);
    });

    it('should use the affix-specific tier table for magic_resist', () => {
      // § 7.3.1 魔抗 T5 = 9~10，通用表的 15 不是它的上限
      expect(isMaxRollAffix({ type: 'magic_resist', tier: 5, value: 10 })).toBe(true);
      expect(isMaxRollAffix({ type: 'magic_resist', tier: 5, value: 15 })).toBe(false);
    });

    it('should ignore quality (raw roll decides)', () => {
      // 品質放大後的顯示值超過上限，仍不算滿 roll
      const affix = { type: 'attack_power' as const, tier: 4, value: 12 };
      expect(getEffectiveAffixValue(affix, 20)).toBe(14);
      expect(isMaxRollAffix(affix)).toBe(false);
    });

    it('should return false for special affixes (no tier, no value)', () => {
      expect(isMaxRollAffix({ type: 'immune_poison', tier: 0, value: 0 })).toBe(false);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatAffixDescription（§ 7.4）', () => {
    it('百分比型：X 代入數值', () => {
      expect(formatAffixDescription({ type: 'attack_power', tier: 4, value: 12 })).toBe('攻擊力 +12%');
      expect(formatAffixDescription({ type: 'cooldown_reduction', tier: 2, value: 5 })).toBe('技能冷卻時間 -5%');
    });

    it('固定值型：X 代入數值，保留「固定值」字樣', () => {
      expect(formatAffixDescription({ type: 'max_hp', tier: 2, value: 40 })).toBe('最大 HP +40（固定值）');
    });

    it('觸發率型：去掉「X% 是觸發率：」開頭，其餘 X 全部代入', () => {
      expect(formatAffixDescription({ type: 'element_erosion', tier: 3, value: 8, element: 'fire', dotDamage: 10 }))
        .toBe('命中後有 8% 機率讓目標中侵蝕，每秒固定傷害、持續 5 秒');
      expect(formatAffixDescription({ type: 'on_hit_hp', tier: 3, value: 9, restorePercent: 3 }))
        .toBe('受到傷害時 9% 機率回復最大 HP 的 3%');
    });

    it('受擊回血／回魔：回復比例代入該條抽到的值；定義本身寫範圍（Wiki 用）', () => {
      expect(AFFIX_DEFINITIONS.find(d => d.type === 'on_hit_hp')!.description)
        .toBe('受到傷害時 X% 機率回復最大 HP 的 2~4%');
      expect(AFFIX_DEFINITIONS.find(d => d.type === 'on_hit_mp')!.description)
        .toBe('受到傷害時 X% 機率回復最大 MP 的 2~5%');
      expect(formatAffixDescription({ type: 'on_hit_mp', tier: 2, value: 6, restorePercent: 5 }))
        .toBe('受到傷害時 6% 機率回復最大 MP 的 5%');
      expect(formatAffixDescription({ type: 'on_hit_mp', tier: 2, value: 6, restorePercent: 5 }, 20))
        .toBe('受到傷害時 7% 機率回復最大 MP 的 6%');
    });

    it('品質參數放大代入值', () => {
      expect(formatAffixDescription({ type: 'attack_power', tier: 4, value: 12 }, 20)).toBe('攻擊力 +14%');
    });

    it('特殊詞綴：照原文', () => {
      const def = SPECIAL_AFFIX_DEFINITIONS.find(d => d.type === 'immune_poison')!;
      expect(formatAffixDescription({ type: 'immune_poison', tier: 0, value: 0 })).toBe(def.description);
    });

    it('所有一般詞綴代入後都不留 X', () => {
      for (const def of AFFIX_DEFINITIONS) {
        expect(formatAffixDescription({ type: def.type, tier: 1, value: 3 })).not.toMatch(/X/);
      }
    });
  });
});

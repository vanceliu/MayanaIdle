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
  LEGACY_GENERAL_TIERS,
  LEGACY_DEFENSE_TIERS,
  AFFIX_DEFINITIONS,
  AFFIX_POOLS,
  AFFIX_TIER_TABLES,
  ON_HIT_TIERS,
  SHARED_AFFIX_TYPES,
  getAffixTierTable,
  getAffixCategoryForSlot,
  isAffixInPool,
  isDecimalAffixType,
  clampAffixValueToTier,
  type AffixCategory,
  type AffixTierTableKey,
  type AffixType,
} from '../affix';

describe('affix model', () => {
  describe('getAffixPoolForSlot', () => {
    it('依 AFFIX_DEFINITIONS 順序回傳該分類池內的詞綴', () => {
      for (const cat of Object.keys(AFFIX_POOLS) as AffixCategory[]) {
        const types = getAffixPoolForSlot(cat).map(d => d.type);
        expect(types, cat).toEqual(AFFIX_DEFINITIONS.filter(d => d.type in AFFIX_POOLS[cat]).map(d => d.type));
      }
    });

    it('武器池不含共用詞綴，其他分類都含（§ 7.6）', () => {
      const weapon = getAffixPoolForSlot('weapon').map(d => d.type);
      for (const t of SHARED_AFFIX_TYPES) expect(weapon, t).not.toContain(t);
      for (const cat of (Object.keys(AFFIX_POOLS) as AffixCategory[]).filter(c => c !== 'weapon')) {
        const types = getAffixPoolForSlot(cat).map(d => d.type);
        for (const t of SHARED_AFFIX_TYPES) expect(types, `${cat} ${t}`).toContain(t);
      }
    });
  });

  describe('LEGACY_GENERAL_TIERS（§ 7.3.3 舊通用表）', () => {
    it('T1~T7 為 3.1~5.0 … 18.1~20.0，連續不重疊', () => {
      expect(LEGACY_GENERAL_TIERS.map(t => [t.min, t.max])).toEqual(
        [[3.1, 5], [5.1, 8], [8.1, 11], [11.1, 13], [13.1, 15], [15.1, 18], [18.1, 20]],
      );
      for (let i = 1; i < LEGACY_GENERAL_TIERS.length; i++) {
        expect(Math.round(LEGACY_GENERAL_TIERS[i].min * 10)).toBe(Math.round(LEGACY_GENERAL_TIERS[i - 1].max * 10) + 1);
      }
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
    it('數值落在該分類階級表的 Tier 區間內', () => {
      for (const [type, cat] of [['attack_power', 'weapon'], ['crit_rate', 'gloves'], ['crit_rate', 'necklace'], ['max_hp', 'belt']] as const) {
        const table = getAffixTierTable(type, cat);
        for (let tier = 1; tier <= 7; tier++) {
          const t = table[tier - 1];
          for (let i = 0; i < 30; i++) {
            const value = rollAffixValue(tier, type, cat);
            expect(value).toBeGreaterThanOrEqual(t.min);
            expect(value).toBeLessThanOrEqual(t.max);
          }
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
      // 武器池 11 種（§ 7.6），要 12 條只會給 11 條
      const affixes = generateAffixes('weapon', 10, 12);
      expect(affixes).toHaveLength(11);
    });

    it('should not have duplicate affix types on same equipment', () => {
      for (let i = 0; i < 50; i++) {
        const affixes = generateAffixes('weapon', 15, 4);
        const types = affixes.map(a => a.type);
        const uniqueTypes = new Set(types);
        expect(uniqueTypes.size).toBe(types.length);
      }
    });

    it('每個分類只生成該分類池內的詞綴', () => {
      for (const cat of Object.keys(AFFIX_POOLS) as AffixCategory[]) {
        for (let i = 0; i < 20; i++) {
          for (const a of generateAffixes(cat, 10)) expect(isAffixInPool(a.type, cat), `${cat} ${a.type}`).toBe(true);
        }
      }
    });

    it('Tier 與數值落在該分類階級表內', () => {
      for (const cat of ['weapon', 'gloves', 'offhand'] as const) {
        for (const a of generateAffixes(cat, 20, 4)) {
          if (a.type === 'bonus_attribute') continue;
          expect(a.tier).toBeGreaterThanOrEqual(1);
          expect(a.tier).toBeLessThanOrEqual(7);
          const t = getAffixTierTable(a.type as AffixType, cat)[a.tier - 1];
          expect(a.value).toBeGreaterThanOrEqual(t.min);
          expect(a.value).toBeLessThanOrEqual(t.max);
        }
      }
    });
  });

  describe('getEffectiveAffixValue', () => {
    it('should return base value at 0% quality', () => {
      const affix = { type: 'attack_power' as const, tier: 1, value: 5 };
      expect(getEffectiveAffixValue(affix, 0)).toBe(5);
    });

    it('should increase value with quality', () => {
      const affix = { type: 'attack_power' as const, tier: 3, value: 12 };
      // quality 10%: floor(12 * 1.10 * 10) / 10 = 13.2
      expect(getEffectiveAffixValue(affix, 10)).toBe(13.2);
    });

    it('should apply max quality (20%)', () => {
      const affix = { type: 'defense' as const, tier: 6, value: 20 };
      // quality 20%: floor(20 * 1.20) = 24
      expect(getEffectiveAffixValue(affix, 20)).toBe(24);
    });

    it('should floor the result', () => {
      const affix = { type: 'crit_rate' as const, tier: 1, value: 7 };
      // quality 5%: floor(7 * 1.05 * 10) / 10 = floor(73.5) / 10 = 7.3
      expect(getEffectiveAffixValue(affix, 5)).toBe(7.3);
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
      // floor(12 * 1.10 * 10) / 10 = 13.2
      expect(bonuses.attack_power).toBe(13.2);
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
      // 武器攻擊力 P3：T4 = 9.1~12.0
      expect(isMaxRollAffix({ type: 'attack_power', tier: 4, value: 12 }, 'weapon')).toBe(true);
      expect(isMaxRollAffix({ type: 'attack_power', tier: 4, value: 11 }, 'weapon')).toBe(false);
      // 武器爆擊傷害 P5：T7 = 30.1~35.0
      expect(isMaxRollAffix({ type: 'crit_damage', tier: 7, value: 35 }, 'weapon')).toBe(true);
      expect(isMaxRollAffix({ type: 'crit_damage', tier: 7, value: 34 }, 'weapon')).toBe(false);
    });

    it('同種詞綴依分類用不同的表（爆擊率：手套 P2、項鍊 P1）', () => {
      expect(isMaxRollAffix({ type: 'crit_rate', tier: 2, value: 4 }, 'gloves')).toBe(true);
      expect(isMaxRollAffix({ type: 'crit_rate', tier: 2, value: 4 }, 'necklace')).toBe(false);
      expect(isMaxRollAffix({ type: 'crit_rate', tier: 2, value: 2 }, 'necklace')).toBe(true);
    });

    it('不在池內的舊詞綴走舊表（§ 7.3.3）', () => {
      // 武器上的爆擊率：舊通用表 T4 = 11.1~13.0
      expect(isMaxRollAffix({ type: 'crit_rate', tier: 4, value: 13 }, 'weapon')).toBe(true);
      // 手套上的防禦力：舊防禦力表 T7 = 3.6~5.0
      expect(isMaxRollAffix({ type: 'defense', tier: 7, value: 5 }, 'gloves')).toBe(true);
    });

    it('should ignore quality (raw roll decides)', () => {
      // 品質放大後的顯示值超過上限，仍不算滿 roll
      const affix = { type: 'attack_power' as const, tier: 4, value: 11 };
      expect(getEffectiveAffixValue(affix, 20)).toBe(13.2);
      expect(isMaxRollAffix(affix, 'weapon')).toBe(false);
    });

    it('should return false for special affixes (no tier, no value)', () => {
      expect(isMaxRollAffix({ type: 'immune_poison', tier: 0, value: 0 }, 'belt')).toBe(false);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatAffixDescription（§ 7.4）', () => {
    it('百分比型：X 代入數值', () => {
      expect(formatAffixDescription({ type: 'attack_power', tier: 4, value: 12 })).toBe('攻擊力 +12.0%');
      expect(formatAffixDescription({ type: 'cooldown_reduction', tier: 2, value: 5 })).toBe('技能冷卻時間 -5.0%');
    });

    it('固定值型：X 代入數值，保留「固定值」字樣', () => {
      expect(formatAffixDescription({ type: 'max_hp', tier: 2, value: 40 })).toBe('最大 HP +40（固定值）');
    });

    it('觸發率型：去掉「X% 是觸發率：」開頭，其餘 X 全部代入', () => {
      expect(formatAffixDescription({ type: 'element_erosion', tier: 3, value: 8, element: 'fire', dotDamage: 10 }))
        .toBe('命中後有 8.0% 機率讓目標中侵蝕，每秒固定傷害、持續 5 秒');
      expect(formatAffixDescription({ type: 'on_hit_hp', tier: 3, value: 3 }))
        .toBe('受到傷害時 3.0% 機率回復最大 HP 的 2.7%');
    });

    it('受擊回血／回魔：回復比例代入觸發率換算的值；定義本身寫範圍（Wiki 用）', () => {
      expect(AFFIX_DEFINITIONS.find(d => d.type === 'on_hit_hp')!.description)
        .toBe('受到傷害時 X% 機率回復最大 HP 的 2.0~4.0%（觸發率越高越多）');
      expect(AFFIX_DEFINITIONS.find(d => d.type === 'on_hit_mp')!.description)
        .toBe('受到傷害時 X% 機率回復最大 MP 的 2.0~5.0%（觸發率越高越多）');
      expect(formatAffixDescription({ type: 'on_hit_mp', tier: 2, value: 2 }))
        .toBe('受到傷害時 2.0% 機率回復最大 MP 的 2.5%');
      expect(formatAffixDescription({ type: 'on_hit_mp', tier: 2, value: 2 }, 20))
        .toBe('受到傷害時 2.4% 機率回復最大 MP 的 3.0%');
    });

    it('品質參數放大代入值', () => {
      expect(formatAffixDescription({ type: 'attack_power', tier: 4, value: 12 }, 20)).toBe('攻擊力 +14.4%');
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

/** `07-affix.md` § 7.3：百分比詞綴以 0.1% 為單位、各階連續不重疊 */
describe('百分比詞綴小數規則（§ 7.3）', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('舊防禦力表 T1~T7 為 0.1~0.5 … 3.6~5.0（§ 7.3.3）', () => {
    expect(LEGACY_DEFENSE_TIERS.map(t => [t.min, t.max])).toEqual(
      [[0.1, 0.5], [0.6, 1], [1.1, 1.5], [1.6, 2], [2.1, 2.5], [2.6, 3.5], [3.6, 5]],
    );
  });

  it('只有百分比詞綴是小數；固定值、迴避值、額外屬性、特殊詞綴為整數', () => {
    expect(isDecimalAffixType('attack_power')).toBe(true);
    expect(isDecimalAffixType('defense')).toBe(true);
    expect(isDecimalAffixType('magic_resist')).toBe(true);
    for (const t of ['max_hp', 'hp_regen', 'evasion', 'bonus_attribute', 'immune_poison'] as const) {
      expect(isDecimalAffixType(t), t).toBe(false);
    }
  });

  it('抽值以 0.1 為單位，兩端都抽得到', () => {
    for (const [type, cat] of [['attack_power', 'weapon'], ['heal_effect', 'helmChest'], ['defense', 'boots'], ['thorns', 'offhand']] as const) {
      for (const t of getAffixTierTable(type, cat)) {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.999999);
        expect(rollAffixValue(t.tier, type, cat)).toBe(t.min);
        expect(rollAffixValue(t.tier, type, cat)).toBe(t.max);
        vi.restoreAllMocks();
        for (let i = 0; i < 30; i++) {
          const v = rollAffixValue(t.tier, type, cat);
          expect(Math.round(v * 10) / 10).toBe(v);
          expect(v).toBeGreaterThanOrEqual(t.min);
          expect(v).toBeLessThanOrEqual(t.max);
        }
      }
    }
  });

  it('同種加總四捨五入到小數一位', () => {
    const b = collectAffixBonuses([
      { affixes: [{ type: 'crit_rate', tier: 1, value: 3.1 }] },
      { affixes: [{ type: 'crit_rate', tier: 2, value: 5.2 }] },
      { affixes: [{ type: 'crit_rate', tier: 1, value: 4.7 }] },
    ]);
    expect(b.crit_rate).toBe(13);
  });

  it('數值夾回所屬分類該 Tier 的區間，區間內不變', () => {
    expect(clampAffixValueToTier({ type: 'attack_power', tier: 1, value: 3.5 }, 'weapon')).toBe(3);
    expect(clampAffixValueToTier({ type: 'heal_effect', tier: 1, value: 3 }, 'helmChest')).toBe(2);
    expect(clampAffixValueToTier({ type: 'defense', tier: 1, value: 3 }, 'helmChest')).toBe(1);
    expect(clampAffixValueToTier({ type: 'magic_resist', tier: 1, value: 4 }, 'necklace')).toBe(3);
    // 不在池內的舊詞綴走舊表（手套上的防禦力 T1 = 0.1~0.5）
    expect(clampAffixValueToTier({ type: 'defense', tier: 1, value: 3 }, 'gloves')).toBe(0.5);
    expect(clampAffixValueToTier({ type: 'attack_power', tier: 2, value: 4 }, 'weapon')).toBe(4);
    expect(clampAffixValueToTier({ type: 'bonus_attribute', tier: 0, value: 1, attribute: 'STR' }, 'belt')).toBe(1);
  });
});

/** `07-affix.md` § 7.6 詞綴池總表（格內為階級表代號，null＝額外屬性無 Tier） */
const SHARED: Partial<Record<AffixType, AffixTierTableKey>> = {
  max_hp: 'hpMp', max_mp: 'hpMp', hp_regen: 'N2', mp_regen: 'N2',
  heal_effect: 'P2', potion_effect: 'P2', drop_rate: 'P3', gold_rate: 'P3',
};
const SPEC_POOLS: Record<AffixCategory, Partial<Record<AffixType, AffixTierTableKey | null>>> = {
  weapon: {
    attack_power: 'P3', element_brand: 'P3', element_erosion: 'P3', hit_down: 'P3', defense_down: 'P3', element_down: 'P3',
    attack_splash: 'P5', crit_damage: 'P5', attack_speed: 'P1', attack_lifesteal: 'P6', skill_lifesteal: 'P2',
  },
  helmChest: { defense: 'P1', on_hit_hp: 'onHit', on_hit_mp: 'onHit', evasion: 'evasion', bonus_attribute: null, ...SHARED },
  shirtCloak: { defense: 'P1', evasion: 'evasion', bonus_attribute: null, ...SHARED },
  gloves: {
    attack_splash: 'P2', crit_rate: 'P2', crit_damage: 'P2', attack_speed: 'P1',
    skill_elemental: 'P2', cooldown_reduction: 'P2', ...SHARED,
  },
  boots: { cooldown_reduction: 'P2', move_speed: 'P2', defense: 'P1', evasion: 'evasion', ...SHARED },
  belt: { crit_damage: 'P2', cooldown_reduction: 'P1', evasion: 'evasion', bonus_attribute: null, ...SHARED },
  offhand: {
    skill_elemental: 'P1', defense: 'P1', on_hit_hp: 'onHit', on_hit_mp: 'onHit',
    block_rate: 'P3', thorns: 'P7', magic_resist: 'P3', ...SHARED,
  },
  necklace: {
    crit_rate: 'P1', crit_damage: 'P2', skill_elemental: 'P2', cooldown_reduction: 'P1',
    evasion: 'evasion', bonus_attribute: null, magic_resist: 'P3', ...SHARED,
  },
  ring: {
    crit_rate: 'P1', crit_damage: 'P2', skill_elemental: 'P2',
    evasion: 'evasion', bonus_attribute: null, magic_resist: 'P3', ...SHARED,
  },
};

describe('詞綴池（§ 7.6）', () => {
  it('每個分類的種類與階級表代號與文件總表一致', () => {
    for (const cat of Object.keys(SPEC_POOLS) as AffixCategory[]) {
      expect(AFFIX_POOLS[cat], cat).toEqual(SPEC_POOLS[cat]);
    }
    expect(Object.keys(AFFIX_POOLS).sort()).toEqual(Object.keys(SPEC_POOLS).sort());
  });

  it('種類數：武器 11、頭盔胸甲 13、上衣斗篷 11、手套 14、鞋子 12、腰帶 12、副手 15、項鍊 15、戒指 14', () => {
    const counts = Object.fromEntries((Object.keys(AFFIX_POOLS) as AffixCategory[]).map(c => [c, getAffixPoolForSlot(c).length]));
    expect(counts).toEqual({
      weapon: 11, helmChest: 13, shirtCloak: 11, gloves: 14, boots: 12, belt: 12, offhand: 15, necklace: 15, ring: 14,
    });
  });

  it('共用詞綴為最大 HP／MP、回血／回魔、補血／藥水效果、掉寶率、金幣獲得率', () => {
    expect([...SHARED_AFFIX_TYPES].sort()).toEqual(Object.keys(SHARED).sort());
  });

  it('getAffixTierTable 回傳池內代號對應的表', () => {
    for (const cat of Object.keys(SPEC_POOLS) as AffixCategory[]) {
      for (const [type, key] of Object.entries(SPEC_POOLS[cat])) {
        if (key) expect(getAffixTierTable(type as AffixType, cat), `${cat} ${type}`).toBe(AFFIX_TIER_TABLES[key]);
      }
    }
  });
});

describe('等寬階級表（§ 7.3）', () => {
  const pct = (w: number) => Array.from({ length: 7 }, (_, i) => [Math.round((i * w + 0.1) * 10) / 10, (i + 1) * w]);
  it.each([
    ['P1', [[0.1, 1], [1.1, 2], [2.1, 3], [3.1, 4], [4.1, 5], [5.1, 6], [6.1, 7]]],
    ['P2', [[0.1, 2], [2.1, 4], [4.1, 6], [6.1, 8], [8.1, 10], [10.1, 12], [12.1, 14]]],
    ['P3', [[0.1, 3], [3.1, 6], [6.1, 9], [9.1, 12], [12.1, 15], [15.1, 18], [18.1, 21]]],
    ['P5', [[0.1, 5], [5.1, 10], [10.1, 15], [15.1, 20], [20.1, 25], [25.1, 30], [30.1, 35]]],
    ['P7', [[0.1, 7], [7.1, 14], [14.1, 21], [21.1, 28], [28.1, 35], [35.1, 42], [42.1, 49]]],
    ['N2', [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14]]],
  ] as const)('%s 的 T1~T7 端點', (key, expected) => {
    expect(AFFIX_TIER_TABLES[key].map(t => [t.min, t.max])).toEqual(expected);
    expect(AFFIX_TIER_TABLES[key].map(t => t.tier)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('等寬公式 Tn = (n − 1) × W + 0.1 ~ n × W', () => {
    expect(AFFIX_TIER_TABLES.P3.map(t => [t.min, t.max])).toEqual(pct(3));
  });

  it('沿用的專屬表：受擊、迴避、最大 HP／MP（§ 7.3.1）', () => {
    expect(AFFIX_TIER_TABLES.onHit.map(t => [t.min, t.max])).toEqual(
      [[1, 1.4], [1.5, 2.3], [2.4, 3.5], [3.6, 4.4], [4.5, 5.3], [5.4, 6.1], [6.2, 7]],
    );
    expect(AFFIX_TIER_TABLES.evasion.map(t => [t.min, t.max])).toEqual(
      [[1, 39], [40, 78], [79, 117], [118, 156], [157, 195], [196, 234], [235, 273]],
    );
    expect(AFFIX_TIER_TABLES.hpMp.map(t => [t.min, t.max])).toEqual(
      [[15, 20], [25, 32], [38, 46], [50, 58], [62, 70], [75, 84], [90, 100]],
    );
  });
});

describe('詞綴分類與部位（§ 7.5）', () => {
  it.each([
    ['rightHand', 'sword', 'weapon'],
    ['leftHand', 'dualblade', 'weapon'],
    ['leftHand', 'shield', 'offhand'],
    ['leftHand', 'magicBook', 'offhand'],
    ['leftHand', 'armGuard', 'offhand'],
    ['helmet', 'armor', 'helmChest'],
    ['chest', 'armor', 'helmChest'],
    ['shirt', 'armor', 'shirtCloak'],
    ['cloak', 'armor', 'shirtCloak'],
    ['gloves', 'armor', 'gloves'],
    ['boots', 'armor', 'boots'],
    ['belt', 'armor', 'belt'],
    ['necklace', 'armor', 'necklace'],
    ['ring1', 'armor', 'ring'],
    ['ring2', 'armor', 'ring'],
  ] as const)('%s / %s → %s', (slot, type, cat) => {
    expect(getAffixCategoryForSlot(slot, type)).toBe(cat);
  });
});

describe('isAffixInPool', () => {
  it('一般詞綴依 § 7.6 總表', () => {
    expect(isAffixInPool('crit_rate', 'gloves')).toBe(true);
    expect(isAffixInPool('crit_rate', 'weapon')).toBe(false);
    expect(isAffixInPool('defense', 'gloves')).toBe(false);
    expect(isAffixInPool('block_rate', 'offhand')).toBe(true);
    expect(isAffixInPool('move_speed', 'boots')).toBe(true);
    expect(isAffixInPool('move_speed', 'gloves')).toBe(false);
  });

  it('特殊詞綴只在上衣／斗篷、腰帶（§ 7.10.1）', () => {
    for (const d of SPECIAL_AFFIX_DEFINITIONS) {
      for (const cat of Object.keys(AFFIX_POOLS) as AffixCategory[]) {
        expect(isAffixInPool(d.type, cat), `${d.type} ${cat}`).toBe(cat === 'shirtCloak' || cat === 'belt');
      }
    }
  });
});

describe('不在池內的舊詞綴走舊表（§ 7.3.3）', () => {
  it('爆擊率／技能元素傷害／減少冷卻時間在武器上 → 舊通用表', () => {
    for (const t of ['crit_rate', 'skill_elemental', 'cooldown_reduction'] as const) {
      expect(getAffixTierTable(t, 'weapon'), t).toBe(LEGACY_GENERAL_TIERS);
    }
  });

  it('防禦力不在池內 → 舊防禦力表', () => {
    for (const cat of ['gloves', 'belt', 'necklace', 'ring'] as const) {
      expect(getAffixTierTable('defense', cat), cat).toBe(LEGACY_DEFENSE_TIERS);
    }
  });

  it('受擊回血／回魔、迴避不在池內 → 沿用 § 7.3.1 的表', () => {
    expect(getAffixTierTable('on_hit_hp', 'gloves')).toBe(ON_HIT_TIERS);
    expect(getAffixTierTable('on_hit_mp', 'necklace')).toBe(ON_HIT_TIERS);
    expect(getAffixTierTable('evasion', 'offhand')).toBe(AFFIX_TIER_TABLES.evasion);
  });
});

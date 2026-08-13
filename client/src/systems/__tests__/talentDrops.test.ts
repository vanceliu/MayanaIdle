import { describe, it, expect } from 'vitest';
import {
  affixCandidates,
  rollTalentAffixDrop,
  rollTalentAffixDrops,
  rollTalentSlotDrop,
} from '../talentDrops';
import { affixTierBandFor, slotTierBandFor } from '../../models/talent';
import { TALENT_AFFIX_DEFS } from '../../db/seed/talentSeeds';

/** 依序回放的假亂數，讓抽取路徑可控 */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('鑲材與天賦格掉落（`27-drop-table.md` § 27.9）', () => {
  describe('tier 區域分帶（§ 51.6.1）', () => {
    it('只設上限不設下限，T1 全區域掉落', () => {
      expect(affixTierBandFor(10)).toEqual({ min: 1, max: 1 });
      expect(affixTierBandFor(35)).toEqual({ min: 1, max: 3 });
      expect(affixTierBandFor(45)).toEqual({ min: 1, max: 4 });
      expect(affixTierBandFor(55)).toEqual({ min: 1, max: 5 });
      expect(affixTierBandFor(80)).toEqual({ min: 1, max: 6 });
    });

    it('天賦格與鑲材不同，保留區間下限', () => {
      expect(slotTierBandFor(30)).toEqual({ min: 2, max: 2 });
      expect(slotTierBandFor(55)).toEqual({ min: 2, max: 3 });
      expect(slotTierBandFor(70)).toEqual({ min: 3, max: 4 });
    });
  });

  describe('候選集合（§ 51.6.1.1）', () => {
    it('＝專屬 ＋ 適用該類型的共用，條件與實作混在一起', () => {
      const combatT1 = affixCandidates('combat', 1);
      // 共用條件 T1（hp_below 等 5 個）＋ 戰鬥專屬條件 T1（2 個）＋ 戰鬥專屬實作 T1（3 個）
      expect(combatT1).toHaveLength(10);
      expect(combatT1.some(d => d.kind === 'condition')).toBe(true);
      expect(combatT1.some(d => d.kind === 'action')).toBe(true);
    });

    it('常駐在 T4 沒有候選（T4 全是依賴當前目標的東西）', () => {
      expect(affixCandidates('persistent', 4)).toHaveLength(0);
    });

    it('T6／T7 只有戰鬥有候選', () => {
      expect(affixCandidates('combat', 6).length).toBeGreaterThan(0);
      expect(affixCandidates('persistent', 6)).toHaveLength(0);
      expect(affixCandidates('supply', 6)).toHaveLength(0);
    });

    it('blocked 的鑲材不進候選（怪物側機制未做）', () => {
      const blocked = TALENT_AFFIX_DEFS.filter(d => d.blocked);
      expect(blocked.length).toBeGreaterThan(0);
      for (const d of blocked) {
        for (const type of d.appliesTo) {
          expect(affixCandidates(type, d.tier)).not.toContainEqual(d);
        }
      }
    });
  });

  describe('鑲材掉落', () => {
    it('沒命中就回 null', () => {
      // rng 恆回 0.99 → 遠高於任何掉率
      expect(rollTalentAffixDrop(10, false, 1, () => 0.99)).toBeNull();
    });

    it('命中時掉出該區間內的 tier', () => {
      const drop = rollTalentAffixDrop(10, false, 1, seq([0, 0, 0]));
      expect(drop).not.toBeNull();
      expect(drop!.def.tier).toBe(1);
    });

    it('T7 不掉落', () => {
      // 任何區域、任何運氣都不該掉出 T7
      for (const level of [10, 35, 45, 55, 80]) {
        for (let i = 0; i < 50; i++) {
          const drop = rollTalentAffixDrop(level, true, 1, seq([0, 0, 0]));
          if (drop) expect(drop.def.tier).not.toBe(7);
        }
      }
    });

    it('高等區照樣掉 T1（分帶沒有下限）', () => {
      // rng 恆 0 → 每一階都命中，區間內的 tier 全部掉一份
      const drops = rollTalentAffixDrops(80, false, 1, () => 0);
      expect(drops.map(d => d.def.tier)).toContain(1);
      expect(drops.map(d => d.def.tier)).toContain(6);
    });

    it('Boss 掉率是一般怪的 2 倍', () => {
      // 取一個介於一般怪與 Boss 掉率之間的 roll：一般怪不中、Boss 中
      // T1 一般怪 3% → 掉落值 30；Boss 6% → 60。roll 0.045 * 1000 = 45
      const between = seq([0.045, 0, 0]);
      expect(rollTalentAffixDrop(10, false, 1, between)).toBeNull();
      expect(rollTalentAffixDrop(10, true, 1, seq([0.045, 0, 0]))).not.toBeNull();
    });

    it('掉出來的鑲材一定適用被抽中的類型', () => {
      for (let i = 0; i < 30; i++) {
        const drop = rollTalentAffixDrop(35, false, 1, seq([0, i / 30, i / 30]));
        if (!drop) continue;
        expect(drop.def.appliesTo.length).toBeGreaterThan(0);
        expect(drop.def.blocked).toBeFalsy();
      }
    });
  });

  describe('天賦格掉落（§ 51.6.2）', () => {
    it('一般怪不掉，運氣再好也不掉', () => {
      expect(rollTalentSlotDrop(80, false, 1, () => 0)).toBeNull();
    });

    it('Boss 命中時掉出該區間內的 tier', () => {
      expect(rollTalentSlotDrop(30, true, 1, seq([0, 0]))).toBe(2);
      expect(rollTalentSlotDrop(70, true, 1, seq([0, 0]))).toBe(3);
    });

    it('掉率極低（0.01%），一般 roll 不會中', () => {
      // 0.01% → 掉落值 0.1；roll 0.001 * 1000 = 1 > 0.1
      expect(rollTalentSlotDrop(80, true, 1, () => 0.001)).toBeNull();
    });

    it('T1 格不掉落', () => {
      for (const level of [30, 55, 80]) {
        const tier = rollTalentSlotDrop(level, true, 1, seq([0, 0]));
        if (tier !== null) expect(tier).toBeGreaterThanOrEqual(2);
      }
    });
  });

});
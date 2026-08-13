import { describe, it, expect } from 'vitest';
import { rollTalentSlotDrop } from '../talentDrops';
import { SLOT_DROP_RATE_BOSS, slotTierBandFor } from '../../models/talent';

/** 固定序列的 rng，讓「命中／不命中」測得起來 */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('天賦格掉落（`27-drop-table.md` § 27.9）', () => {
  describe('區域分帶（§ 51.6.1）', () => {
    it('保留區間下限，低等區不會掉到高階格', () => {
      expect(slotTierBandFor(30)).toEqual({ min: 2, max: 2 });
      expect(slotTierBandFor(50)).toEqual({ min: 2, max: 3 });
      expect(slotTierBandFor(99)).toEqual({ min: 3, max: 4 });
    });

    it('T1 格不在任何區間內 —— 只從角色等級取得', () => {
      for (const level of [1, 15, 30, 40, 50, 60, 99]) {
        expect(slotTierBandFor(level).min).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('掉落判定（§ 51.6.1）', () => {
    it('一般怪不掉，運氣再好也不掉', () => {
      expect(rollTalentSlotDrop(99, false, 1, seq(0))).toBeNull();
    });

    it('Boss 命中時掉出該區間內的 tier', () => {
      const tier = rollTalentSlotDrop(50, true, 1, seq(0, 0));
      expect(tier).not.toBeNull();
      const band = slotTierBandFor(50);
      expect(tier!).toBeGreaterThanOrEqual(band.min);
      expect(tier!).toBeLessThanOrEqual(band.max);
    });

    it('掉率極低（0.01%），一般 roll 不會中', () => {
      expect(SLOT_DROP_RATE_BOSS).toBe(0.01);
      expect(rollTalentSlotDrop(99, true, 1, seq(0.5))).toBeNull();
    });

    it('掉率加成會放大命中機會', () => {
      // 0.01% → 掉落值 0.1；基數 1000，所以 rng 要小於 0.0001
      expect(rollTalentSlotDrop(99, true, 1, seq(0.00005, 0))).not.toBeNull();
      expect(rollTalentSlotDrop(99, true, 1, seq(0.00015, 0))).toBeNull();
      // 加成 ×10 之後同一個 roll 就中得了
      expect(rollTalentSlotDrop(99, true, 10, seq(0.00015, 0))).not.toBeNull();
    });
  });
});

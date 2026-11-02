/** § 7.7：T6／T7 欄是整件至少一條的機率（`07-affix.md`） */
import { describe, it, expect, afterEach } from 'vitest';
import { generateAffixes, getBossTierWeights, getDropTierProbabilities, getTierWeights } from '../affix';
import { createSeededSource, setRandomSource } from '../../core/rng';

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('掉落每條 Tier 機率', () => {
  it('只有 1 條時等於表上比例', () => {
    const w = getTierWeights(55);
    getDropTierProbabilities(55, false, 1).forEach((p, i) => expect(p).toBeCloseTo(w[i] / sum(w), 10));
  });

  it.each([1, 2, 3, 4])('%i 條：整件至少一條 T6／T7 等於表上數值，機率總和為 1', n => {
    const normal = getDropTierProbabilities(55, false, n);
    expect(1 - (1 - normal[5]) ** n).toBeCloseTo(0.28, 10);
    expect(normal[6]).toBe(0);
    expect(sum(normal)).toBeCloseTo(1, 10);

    const bw = getBossTierWeights(55);
    const boss = getDropTierProbabilities(55, true, n);
    expect(1 - (1 - boss[5]) ** n).toBeCloseTo(bw[5] / sum(bw), 10);
    expect(1 - (1 - boss[6]) ** n).toBeCloseTo(bw[6] / sum(bw), 10);
    expect(sum(boss)).toBeCloseTo(1, 10);
  });

  it('T1~T5 之間維持表上比例', () => {
    const w = getTierWeights(45);
    const p = getDropTierProbabilities(45, false, 4);
    expect(p[0] / p[4]).toBeCloseTo(w[0] / w[4], 10);
    expect(p[2] / p[3]).toBeCloseTo(w[2] / w[3], 10);
  });

  it('Lv.30 以下沒有 T6', () => {
    expect(getDropTierProbabilities(30, false, 4)[5]).toBe(0);
  });
});

describe('掉落裝備整件機率（模擬）', () => {
  afterEach(() => setRandomSource(() => Math.random()));

  function rate(level: number, isBoss: boolean, tier: number): number {
    setRandomSource(createSeededSource(20261102));
    const runs = 20_000;
    let hit = 0;
    for (let i = 0; i < runs; i++) {
      const count = 1 + (i % 4);
      if (generateAffixes('weapon', level, count, isBoss).some(a => a.tier === tier)) hit++;
    }
    return hit / runs;
  }

  it('Lv.51+ 一般怪：至少一條 T6 約 28%', () => {
    expect(rate(55, false, 6)).toBeGreaterThan(0.265);
    expect(rate(55, false, 6)).toBeLessThan(0.295);
  });

  it('Lv.51+ Boss：至少一條 T7 約 15%、T6 約 32%', () => {
    expect(rate(55, true, 7)).toBeGreaterThan(0.14);
    expect(rate(55, true, 7)).toBeLessThan(0.16);
    expect(rate(55, true, 6)).toBeGreaterThan(0.305);
    expect(rate(55, true, 6)).toBeLessThan(0.335);
  });
});

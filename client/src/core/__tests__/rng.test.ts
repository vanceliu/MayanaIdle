import { describe, it, expect, afterEach } from 'vitest';
import { createSeededSource, reseed, random, randomInt, chance, chancePercent, pick, pickWeightedIndex, setRandomSource } from '../rng';

describe('core/rng（97 § 97.6 seeded PRNG）', () => {
  afterEach(() => setRandomSource(() => Math.random()));

  it('同一種子產生同一序列', () => {
    const a = createSeededSource(12345);
    const b = createSeededSource(12345);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('不同種子序列不同', () => {
    const a = createSeededSource(1)();
    const b = createSeededSource(2)();
    expect(a).not.toBe(b);
  });

  it('輸出落在 [0, 1)', () => {
    const src = createSeededSource(99);
    for (let i = 0; i < 1000; i++) {
      const v = src();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('reseed 後 random() 可重現', () => {
    reseed(7);
    const first = [random(), random(), random()];
    reseed(7);
    expect([random(), random(), random()]).toEqual(first);
  });

  it('randomInt 為閉區間', () => {
    reseed(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(randomInt(2, 4));
    expect([...seen].sort()).toEqual([2, 3, 4]);
  });

  it('chance / chancePercent / pick 用注入的來源', () => {
    setRandomSource(() => 0.25);
    expect(chance(0.3)).toBe(true);
    expect(chance(0.2)).toBe(false);
    expect(chancePercent(30)).toBe(true);
    expect(chancePercent(20)).toBe(false);
    expect(pick(['a', 'b', 'c', 'd'])).toBe('b');
  });

  it('pickWeightedIndex 依權重區間取索引，邊界歸下一格', () => {
    const at = (r: number) => { setRandomSource(() => r); return pickWeightedIndex([80, 15, 5]); };
    expect(at(0)).toBe(0);
    expect(at(0.7999)).toBe(0);
    expect(at(0.8)).toBe(1);
    expect(at(0.9499)).toBe(1);
    expect(at(0.95)).toBe(2);
    expect(at(0.9999)).toBe(2);
  });

  it('pickWeightedIndex 權重不必加總為 1', () => {
    setRandomSource(() => 0.5);
    expect(pickWeightedIndex([1, 1])).toBe(1);
  });
});

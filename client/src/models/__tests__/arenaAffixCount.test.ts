import { describe, expect, it } from 'vitest';
import { arenaAffixCount, getArenaTier, type ArenaTier } from '../arena';

describe('競技場強化詞綴數（§ 55.2）', () => {
  it.each([
    [4, 1, 0], [4, 30, 0], [4, 31, 1], [4, 60, 1], [4, 61, 2], [4, 90, 2], [4, 91, 3], [4, 100, 3],
    [5, 1, 0], [5, 20, 0], [5, 21, 1], [5, 41, 2], [5, 61, 3], [5, 80, 3], [5, 81, 4], [5, 100, 4],
    [6, 1, 0], [6, 10, 0], [6, 11, 1], [6, 31, 3], [6, 40, 3], [6, 41, 4], [6, 100, 4],
    [7, 10, 0], [7, 11, 1], [7, 41, 4],
  ] as const)('T%i 第 %i 波 = %i 個', (tier, wave, count) => {
    expect(arenaAffixCount(wave, getArenaTier(tier as ArenaTier)!)).toBe(count);
  });
});

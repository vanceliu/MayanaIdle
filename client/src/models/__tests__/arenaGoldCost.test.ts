import { describe, expect, it } from 'vitest';
import { arenaGoldCost } from '../arena';

describe('競技場入場金幣（§ 55.1）', () => {
  it.each([
    [4, 100_000],
    [5, 150_000],
    [6, 250_000],
    [7, 350_000],
  ] as const)('T%i = %i', (tier, gold) => {
    expect(arenaGoldCost(tier)).toBe(gold);
  });
});

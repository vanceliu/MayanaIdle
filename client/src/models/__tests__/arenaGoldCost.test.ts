import { describe, expect, it } from 'vitest';
import { arenaGoldCost, payArenaFee } from '../arena';

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

describe('入場金幣付款（§ 55.1）：身上＋帳號倉庫合計，先扣身上', () => {
  it('身上足夠只扣身上', () => {
    expect(payArenaFee(300_000, 50_000, 100_000)).toEqual({ gold: 200_000, warehouseGold: 50_000 });
  });

  it('身上不足由帳號倉庫補', () => {
    expect(payArenaFee(40_000, 200_000, 150_000)).toEqual({ gold: 0, warehouseGold: 90_000 });
  });

  it('合計剛好足夠', () => {
    expect(payArenaFee(100_000, 150_000, 250_000)).toEqual({ gold: 0, warehouseGold: 0 });
  });

  it('合計不足回 null', () => {
    expect(payArenaFee(100_000, 149_999, 250_000)).toBeNull();
  });
});

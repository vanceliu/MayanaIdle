import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, type BagItem, type PendingDiscard } from '../gameStore';
import { getItemId } from '../../models/items';
import { bagItem } from '../../testing/bagFixtures';
import type { EquipmentInstance } from '../../models/equipment';

/** § 35.5.3「多項丟棄」 */
describe('多項丟棄', () => {
  const RED = getItemId('紅色藥水')!;
  const ORE = getItemId('銀礦石')!;
  const armor = { id: 7, name: '皮甲' } as EquipmentInstance;

  beforeEach(() => {
    useGameStore.setState({
      bagItems: [bagItem('紅色藥水', 10), bagItem('銀礦石', 1)] as BagItem[],
      inventory: [armor],
      pendingDiscard: null,
      pendingDiscardBatch: null,
      combatLogs: [],
    });
  });

  const reqs: PendingDiscard[] = [
    { kind: 'bag', name: '紅色藥水', itemId: RED, maxAmount: 10 },
    { kind: 'equipment', name: '皮甲', maxAmount: 1, equipmentId: 7 },
    { kind: 'bag', name: '銀礦石', itemId: ORE, maxAmount: 1 },
  ];
  const state = () => useGameStore.getState();
  const amountOf = (itemId: number) => state().bagItems.find(b => b.itemId === itemId)?.amount;

  it('requestDiscardBatch 只掛起請求，名稱與上限取自己的資料', () => {
    state().requestDiscardBatch([{ kind: 'bag', name: '偽造', itemId: RED, maxAmount: 999 }]);
    expect(state().pendingDiscardBatch).toEqual([{ kind: 'bag', name: '紅色藥水', itemId: RED, maxAmount: 10 }]);
    expect(amountOf(RED)).toBe(10);
  });

  it('不屬於自己的項目剔除、重複的合併；全部不合格時不掛起', () => {
    state().requestDiscardBatch([
      { kind: 'equipment', name: 'x', maxAmount: 1, equipmentId: 999 },
      reqs[0],
      reqs[0],
    ]);
    expect(state().pendingDiscardBatch).toHaveLength(1);

    state().cancelDiscard();
    state().requestDiscardBatch([{ kind: 'bag', name: 'x', itemId: -1, maxAmount: 1 }]);
    expect(state().pendingDiscardBatch).toBeNull();
  });

  it('非陣列或項目數超過背包格數整筆不受理', () => {
    state().requestDiscardBatch('x' as unknown as PendingDiscard[]);
    expect(state().pendingDiscardBatch).toBeNull();
    state().requestDiscardBatch(Array.from({ length: 1000 }, () => reqs[0]));
    expect(state().pendingDiscardBatch).toBeNull();
  });

  it('與單項丟棄互斥：掛起一種會清掉另一種', () => {
    state().requestDiscard(reqs[0]);
    state().requestDiscardBatch(reqs);
    expect(state().pendingDiscard).toBeNull();
    state().requestDiscard(reqs[0]);
    expect(state().pendingDiscardBatch).toBeNull();
  });

  it('確認後依指定數量逐項丟棄，每項一行日誌', () => {
    state().requestDiscardBatch(reqs);
    state().confirmDiscardBatch([4, 1, 1]);
    expect(amountOf(RED)).toBe(6);
    expect(amountOf(ORE)).toBeUndefined();
    expect(state().inventory).toHaveLength(0);
    expect(state().pendingDiscardBatch).toBeNull();
    expect(state().combatLogs.map(l => l.text)).toEqual(['丟棄了 紅色藥水 ×4', '丟棄了 皮甲', '丟棄了 銀礦石']);
  });

  it('數量夾在 1~持有量', () => {
    state().requestDiscardBatch([reqs[0], reqs[2]]);
    state().confirmDiscardBatch([0, 999]);
    expect(amountOf(RED)).toBe(9);
    expect(amountOf(ORE)).toBeUndefined();
  });

  it('數量長度不符或含非整數時整筆不處理', () => {
    state().requestDiscardBatch(reqs);
    state().confirmDiscardBatch([1, 1]);
    state().confirmDiscardBatch([1, 1.5, 1]);
    expect(amountOf(RED)).toBe(10);
    expect(state().inventory).toHaveLength(1);
    expect(state().pendingDiscardBatch).toHaveLength(3);
  });

  it('掛起後已不在背包的項目跳過', () => {
    state().requestDiscardBatch(reqs);
    useGameStore.setState({ inventory: [], bagItems: [bagItem('紅色藥水', 2)] as BagItem[] });
    state().confirmDiscardBatch([5, 1, 1]);
    expect(amountOf(RED)).toBeUndefined();
    expect(state().combatLogs.map(l => l.text)).toEqual(['丟棄了 紅色藥水 ×2']);
  });
});

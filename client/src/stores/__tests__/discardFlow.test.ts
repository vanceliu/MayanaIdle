import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore, type BagItem } from '../gameStore';

import { getItemId } from '../../models/items';
import { bagItem } from '../../testing/bagFixtures';
/** § 35.5.3：拖出背包 → 確認 → 丟棄 */
describe('丟棄流程', () => {
  beforeEach(() => {
    useGameStore.setState({
      bagItems: [
        bagItem('紅色藥水', 10),
        bagItem('銀礦石', 1),
      ] as BagItem[],
      inventory: [],
      pendingDiscard: null,
      combatLogs: [],
    });
  });

  const bagOf = (name: string) => useGameStore.getState().bagItems.find(b => b.name === name);

  it('requestDiscard 只是掛起請求，不會立刻扣除', () => {
    useGameStore.getState().requestDiscard({ kind: 'bag', name: '紅色藥水', itemId: getItemId('紅色藥水')!, maxAmount: 10 });
    expect(useGameStore.getState().pendingDiscard?.name).toBe('紅色藥水');
    expect(bagOf('紅色藥水')?.amount).toBe(10);
  });

  it('cancelDiscard 取消後物品完好', () => {
    useGameStore.getState().requestDiscard({ kind: 'bag', name: '紅色藥水', itemId: getItemId('紅色藥水')!, maxAmount: 10 });
    useGameStore.getState().cancelDiscard();
    expect(useGameStore.getState().pendingDiscard).toBeNull();
    expect(bagOf('紅色藥水')?.amount).toBe(10);
  });

  it('確認後丟棄指定數量，剩餘留在背包', () => {
    useGameStore.getState().requestDiscard({ kind: 'bag', name: '紅色藥水', itemId: getItemId('紅色藥水')!, maxAmount: 10 });
    useGameStore.getState().confirmDiscard(4);
    expect(bagOf('紅色藥水')?.amount).toBe(6);
    expect(useGameStore.getState().pendingDiscard).toBeNull();
  });

  it('丟棄全部時該格整個消失', () => {
    useGameStore.getState().requestDiscard({ kind: 'bag', name: '紅色藥水', itemId: getItemId('紅色藥水')!, maxAmount: 10 });
    useGameStore.getState().confirmDiscard(10);
    expect(bagOf('紅色藥水')).toBeUndefined();
  });

  it('數量超過持有量時只丟到持有量為止，不會變負數', () => {
    useGameStore.getState().requestDiscard({ kind: 'bag', name: '銀礦石', itemId: getItemId('銀礦石')!, maxAmount: 1 });
    useGameStore.getState().confirmDiscard(999);
    expect(bagOf('銀礦石')).toBeUndefined();
    expect(useGameStore.getState().bagItems).toHaveLength(1);
  });

  it('數量為 0 或負數時至少丟 1 個', () => {
    useGameStore.getState().requestDiscard({ kind: 'bag', name: '紅色藥水', itemId: getItemId('紅色藥水')!, maxAmount: 10 });
    useGameStore.getState().confirmDiscard(0);
    expect(bagOf('紅色藥水')?.amount).toBe(9);
  });

  it('沒有掛起請求時 confirmDiscard 不做任何事', () => {
    useGameStore.getState().confirmDiscard(5);
    expect(bagOf('紅色藥水')?.amount).toBe(10);
  });

  it('丟棄後寫入戰鬥日誌', () => {
    useGameStore.getState().requestDiscard({ kind: 'bag', name: '紅色藥水', itemId: getItemId('紅色藥水')!, maxAmount: 10 });
    useGameStore.getState().confirmDiscard(3);
    const logs = useGameStore.getState().combatLogs;
    expect(logs.at(-1)?.text).toBe('丟棄了 紅色藥水 ×3');
  });

  it('丟棄單一數量時日誌不加數量後綴', () => {
    useGameStore.getState().requestDiscard({ kind: 'bag', name: '銀礦石', itemId: getItemId('銀礦石')!, maxAmount: 1 });
    useGameStore.getState().confirmDiscard(1);
    expect(useGameStore.getState().combatLogs.at(-1)?.text).toBe('丟棄了 銀礦石');
  });
});

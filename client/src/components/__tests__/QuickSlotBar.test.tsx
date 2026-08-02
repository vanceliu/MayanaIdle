import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickSlotBar } from '../QuickSlotBar';
import { useGameStore } from '../../stores/gameStore';
import { BAG_DRAG_MIME, encodeBagDrag, type BagDragPayload } from '../../models/bagLayout';
import { QUICK_SLOT_COUNT, emptyQuickSlots } from '../../models/quickSlot';

/**
 * @vitest-environment jsdom
 */

/** 模擬 HTML5 拖放的 dataTransfer */
function dataTransferWith(payload: BagDragPayload) {
  const store: Record<string, string> = { [BAG_DRAG_MIME]: encodeBagDrag(payload) };
  return {
    types: Object.keys(store),
    getData: (type: string) => store[type] ?? '',
    setData: (type: string, value: string) => { store[type] = value; },
    dropEffect: '',
    effectAllowed: '',
  };
}

const slots = () => document.querySelectorAll('.quick-slot');

describe('QuickSlotBar', () => {
  beforeEach(() => {
    useGameStore.setState({
      quickSlots: emptyQuickSlots(),
      bagItems: [{ name: '紅色藥水', type: 'potion', amount: 5 }],
      inventory: [],
    });
  });

  it('渲染 10 格，標籤為 1~9 與 0', () => {
    render(<QuickSlotBar />);
    expect(slots()).toHaveLength(QUICK_SLOT_COUNT);
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('9')).toBeDefined();
    expect(screen.getByText('0')).toBeDefined();
  });

  /**
   * 迴歸測試：空格原本用 `disabled` 標記，而**被 disable 的按鈕收不到 drag 事件**，
   * 導致任何物品都放不進快捷鍵。空格必須永遠可以接收拖放。
   */
  it('空格沒有 disabled 屬性（否則收不到 drag 事件）', () => {
    render(<QuickSlotBar />);
    for (const el of slots()) {
      expect((el as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('把背包藥水拖到空格 → 綁定該格', () => {
    render(<QuickSlotBar />);
    const target = slots()[3];
    const dt = dataTransferWith({ kind: 'bag', name: '紅色藥水', amount: 5 });

    fireEvent.dragOver(target, { dataTransfer: dt });
    fireEvent.drop(target, { dataTransfer: dt });

    expect(useGameStore.getState().quickSlots[3]).toEqual({ kind: 'potion', potionType: 'red' });
  });

  it('拖到第 10 格（鍵盤 0）也能綁定', () => {
    render(<QuickSlotBar />);
    const target = slots()[QUICK_SLOT_COUNT - 1];
    const dt = dataTransferWith({ kind: 'bag', name: '紅色藥水', amount: 5 });

    fireEvent.dragOver(target, { dataTransfer: dt });
    fireEvent.drop(target, { dataTransfer: dt });

    expect(useGameStore.getState().quickSlots[QUICK_SLOT_COUNT - 1])
      .toEqual({ kind: 'potion', potionType: 'red' });
  });

  it('拖入不可放置的物品時不綁定', () => {
    render(<QuickSlotBar />);
    const target = slots()[0];
    const dt = dataTransferWith({ kind: 'bag', name: '武器強化卷軸', amount: 1 });

    fireEvent.dragOver(target, { dataTransfer: dt });
    fireEvent.drop(target, { dataTransfer: dt });

    expect(useGameStore.getState().quickSlots[0]).toBeNull();
  });

  it('同一個物品拖到新格時，舊格自動清空', () => {
    render(<QuickSlotBar />);
    const dt = dataTransferWith({ kind: 'bag', name: '紅色藥水', amount: 5 });

    fireEvent.dragOver(slots()[1], { dataTransfer: dt });
    fireEvent.drop(slots()[1], { dataTransfer: dt });
    expect(useGameStore.getState().quickSlots[1]).not.toBeNull();

    fireEvent.dragOver(slots()[6], { dataTransfer: dt });
    fireEvent.drop(slots()[6], { dataTransfer: dt });

    expect(useGameStore.getState().quickSlots[1]).toBeNull();
    expect(useGameStore.getState().quickSlots[6]).toEqual({ kind: 'potion', potionType: 'red' });
  });

  it('右鍵清除該格', () => {
    useGameStore.setState({
      quickSlots: emptyQuickSlots().map((_, i) =>
        i === 2 ? { kind: 'potion' as const, potionType: 'red' as const } : null),
    });
    render(<QuickSlotBar />);

    fireEvent.contextMenu(slots()[2]);
    expect(useGameStore.getState().quickSlots[2]).toBeNull();
  });
});

describe('滑鼠兩段確認（§ 35.7.5）', () => {
  beforeEach(() => {
    useGameStore.setState({
      quickSlots: emptyQuickSlots().map((_, i) =>
        i === 0 ? { kind: 'potion' as const, potionType: 'red' as const } : null),
      bagItems: [{ name: '紅色藥水', type: 'potion', amount: 5 }],
      inventory: [],
      // 藥水冷卻是全域共用（第 60 條），跨測試會殘留，必須重置
      lastPotionUsedAt: 0,
      character: {
        name: 'T', className: 'knight', level: 10, exp: 0, expToNext: 100,
        hp: 50, maxHp: 100, mp: 30, maxMp: 50,
        baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
        bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
        gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
        currentRegion: 'dawn-plains', currentFloor: null, skills: [],
        unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
      } as never,
    });
  });

  it('第一次點擊只選取，不執行', () => {
    render(<QuickSlotBar />);
    const before = useGameStore.getState().bagItems[0].amount;

    fireEvent.click(slots()[0]);

    expect(slots()[0].className).toContain('selected');
    expect(useGameStore.getState().bagItems[0].amount).toBe(before);
  });

  it('再點同一格才執行，並解除選取', () => {
    render(<QuickSlotBar />);
    const before = useGameStore.getState().bagItems[0].amount;

    fireEvent.click(slots()[0]);
    fireEvent.click(slots()[0]);

    expect(useGameStore.getState().bagItems[0].amount).toBeLessThan(before);
    expect(slots()[0].className).not.toContain('selected');
  });

  it('點另一格會移動選取，不會執行前一格', () => {
    useGameStore.setState({
      quickSlots: emptyQuickSlots().map((_, i) =>
        i <= 1 ? { kind: 'potion' as const, potionType: 'red' as const } : null),
    });
    render(<QuickSlotBar />);
    const before = useGameStore.getState().bagItems[0].amount;

    fireEvent.click(slots()[0]);
    fireEvent.click(slots()[1]);

    expect(slots()[0].className).not.toContain('selected');
    expect(slots()[1].className).toContain('selected');
    expect(useGameStore.getState().bagItems[0].amount).toBe(before);
  });

  it('Esc 解除選取', () => {
    render(<QuickSlotBar />);
    fireEvent.click(slots()[0]);
    expect(slots()[0].className).toContain('selected');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(slots()[0].className).not.toContain('selected');
  });

  it('鍵盤快捷鍵一按即發，不需要兩段確認', () => {
    render(<QuickSlotBar />);
    const before = useGameStore.getState().bagItems[0].amount;

    fireEvent.keyDown(window, { key: '1' });

    expect(useGameStore.getState().bagItems[0].amount).toBeLessThan(before);
  });

  it('點空格不會進入選取狀態', () => {
    render(<QuickSlotBar />);
    fireEvent.click(slots()[5]);
    expect(slots()[5].className).not.toContain('selected');
  });

  it('右鍵清除該格時一併解除選取', () => {
    render(<QuickSlotBar />);
    fireEvent.click(slots()[0]);
    expect(slots()[0].className).toContain('selected');

    fireEvent.contextMenu(slots()[0]);
    expect(slots()[0].className).not.toContain('selected');
    expect(useGameStore.getState().quickSlots[0]).toBeNull();
  });
});
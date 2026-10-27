import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BagPanel } from '../BagPanel';
import { DiscardConfirmModal } from '../DiscardConfirmModal';
import { useDragStore } from '../../stores/dragStore';
import { useGameStore } from '../../stores/gameStore';
import { LONG_PRESS_MS } from '../../hooks/useLongPress';
import { dragTo, restoreElementFromPoint } from '../../testing/pointerDrag';
import { bagItem } from '../../testing/bagFixtures';
import { getItemId } from '../../models/items';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

/**
 * @vitest-environment jsdom
 */

/** § 35.1.5 多選、§ 35.5.3 多項丟棄 */
describe('背包多選', () => {
  const RED = getItemId('紅色藥水')!;
  const ORE = getItemId('銀礦石')!;
  const sword = {
    id: 7, templateId: 1, name: '鐵劍', type: 'sword', slot: 'rightHand',
    isTwoHanded: false, quality: 0, enhancement: 0, affixes: [],
    ownerId: 1, equipped: true,
  } as never;

  beforeEach(() => {
    useGameStore.setState({
      bagSlotMap: {},
      bagItems: [bagItem('紅色藥水', 3), bagItem('銀礦石', 2)],
      inventory: [],
      equippedGear: {},
      pendingDiscard: null,
      pendingDiscardBatch: null,
      combatLogs: [],
    });
  });
  afterEach(() => {
    restoreElementFromPoint();
    useDragStore.getState().cancel();
  });

  const cells = () => document.querySelectorAll('.bag-cell');
  const multi = () => document.querySelectorAll('.bag-cell.is-multi-selected');
  const isEmpty = (i: number) => cells()[i].className.includes('empty');

  function tap(el: Element, opts: { shiftKey?: boolean; pointerType?: string } = {}) {
    fireEvent.pointerDown(el, { button: 0, clientX: 10, clientY: 10, ...opts });
    fireEvent.pointerUp(el, { clientX: 10, clientY: 10, ...opts });
  }

  function shiftSelect(...indexes: number[]) {
    for (const i of indexes) tap(cells()[i], { shiftKey: true });
  }

  it('Shift＋點擊切換多選，不會使用物品', () => {
    const usePotionByType = vi.fn();
    useGameStore.setState({ usePotionByType });
    render(<BagPanel />);

    shiftSelect(0, 1);
    expect(multi()).toHaveLength(2);
    shiftSelect(0, 0);
    expect(multi()).toHaveLength(2);
    shiftSelect(1);
    expect(multi()).toHaveLength(1);
    expect(usePotionByType).not.toHaveBeenCalled();
  });

  it('第一次 Shift＋點擊時，原本的單選格一併加入', () => {
    render(<BagPanel />);
    tap(cells()[0]);
    shiftSelect(1);

    expect(multi()).toHaveLength(2);
    expect(document.querySelector('.bag-cell.is-selected')).toBeNull();
  });

  it('不按 Shift 點已選格回到該格單選；點未選格、點空白、Esc 都結束多選', () => {
    render(<BagPanel />);
    shiftSelect(0, 1);
    tap(cells()[1]);
    expect(multi()).toHaveLength(0);
    expect(cells()[1].className).toContain('is-selected');

    shiftSelect(0, 1);
    fireEvent.pointerDown(cells()[10], { button: 0 });
    expect(multi()).toHaveLength(0);

    shiftSelect(0, 1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(multi()).toHaveLength(0);
  });

  it('拖曳已選格到背包格：從目標格起連續排入，多選保留', () => {
    render(<BagPanel />);
    shiftSelect(0, 1);
    dragTo(cells()[1], cells()[5]);

    expect(isEmpty(0) && isEmpty(1)).toBe(true);
    expect(cells()[5].textContent).toContain('紅色藥水');
    expect(cells()[6].textContent).toContain('銀礦石');
    expect(multi()).toHaveLength(2);
  });

  it('拖曳未選格只移動那一格', () => {
    useGameStore.setState({ bagItems: [bagItem('紅色藥水', 3), bagItem('白色藥水', 1), bagItem('銀礦石', 2)] });
    render(<BagPanel />);
    shiftSelect(0, 1);
    dragTo(cells()[2], cells()[8]);

    expect(isEmpty(0) || isEmpty(1)).toBe(false);
    expect(cells()[8].textContent).toContain('銀礦石');
  });

  it('右鍵已選格 →「移動選取的 N 格」→ 點目標格', () => {
    render(<BagPanel />);
    shiftSelect(0, 1);
    fireEvent.contextMenu(cells()[0]);
    fireEvent.click(screen.getByText('移動選取的 2 格'));
    fireEvent.pointerDown(cells()[58], { button: 0 });

    // 第 58 格起放不下兩格，起點退到 58
    expect(cells()[58].textContent).toContain('紅色藥水');
    expect(cells()[59].textContent).toContain('銀礦石');
    expect(multi()).toHaveLength(2);
  });

  it('選單移動到有物品的格子後多選保留，可再移動一次', () => {
    useGameStore.setState({ bagItems: [bagItem('紅色藥水', 3), bagItem('白色藥水', 1), bagItem('銀礦石', 2)] });
    render(<BagPanel />);
    shiftSelect(0, 1);
    fireEvent.contextMenu(cells()[0]);
    fireEvent.click(screen.getByText('移動選取的 2 格'));
    fireEvent.pointerDown(cells()[2], { button: 0 });
    expect(cells()[0].textContent).toContain('銀礦石');
    expect(multi()).toHaveLength(2);

    dragTo(cells()[2], cells()[10]);
    expect(cells()[10].textContent).toContain('紅色藥水');
    expect(cells()[11].textContent).toContain('白色藥水');
    expect(multi()).toHaveLength(2);
  });

  it('拖到地圖：掛起多項丟棄，項目依版面順序', () => {
    render(<><BagPanel /><div data-drop-kind="map" data-testid="map" /></>);
    shiftSelect(0, 1);
    dragTo(cells()[0], screen.getByTestId('map'));

    expect(useGameStore.getState().pendingDiscardBatch?.map(e => e.itemId)).toEqual([RED, ORE]);
  });

  it('選單丟棄 → 視窗預設持有量，可改數量後確認', () => {
    render(<><BagPanel /><DiscardConfirmModal /></>);
    shiftSelect(0, 1);
    fireEvent.contextMenu(cells()[0]);
    fireEvent.click(screen.getByText('丟棄選取的 2 項'));

    const red = screen.getByLabelText('紅色藥水 丟棄數量') as HTMLInputElement;
    const ore = screen.getByLabelText('銀礦石 丟棄數量') as HTMLInputElement;
    expect([red.value, ore.value]).toEqual(['3', '2']);

    fireEvent.change(red, { target: { value: '1' } });
    fireEvent.click(screen.getByText('丟棄 2 項'));

    const bag = useGameStore.getState().bagItems;
    expect(bag.find(b => b.itemId === RED)?.amount).toBe(2);
    expect(bag.some(b => b.itemId === ORE)).toBe(false);
    expect(screen.queryByText('丟棄物品')).toBeNull();
  });

  it('裝備中的裝備不列入丟棄；全是裝備中時選單不顯示丟棄', () => {
    useGameStore.setState({ bagItems: [bagItem('紅色藥水', 3)], equippedGear: { rightHand: sword } });
    render(<BagPanel />);
    const swordIndex = [...cells()].findIndex(c => c.textContent?.includes('鐵劍'));
    const potionIndex = [...cells()].findIndex(c => c.textContent?.includes('紅色藥水'));

    shiftSelect(swordIndex);
    fireEvent.contextMenu(cells()[swordIndex]);
    expect(screen.getByText('移動選取的 1 格')).toBeDefined();
    expect(screen.queryByText(/丟棄選取/)).toBeNull();
    fireEvent.click(document.querySelector('.context-menu-overlay')!);

    shiftSelect(potionIndex);
    fireEvent.contextMenu(cells()[potionIndex]);
    fireEvent.click(screen.getByText('丟棄選取的 1 項'));
    expect(useGameStore.getState().pendingDiscardBatch?.map(e => e.itemId)).toEqual([RED]);
  });

  it('關閉選單不會結束多選', () => {
    render(<BagPanel />);
    shiftSelect(0, 1);
    fireEvent.contextMenu(cells()[0]);
    const overlay = document.querySelector('.context-menu-overlay')!;
    fireEvent.pointerDown(overlay, { button: 0 });
    fireEvent.click(overlay);

    expect(multi()).toHaveLength(2);
  });

  it('觸控：長按選單「多選」進入，之後點格切換；放開才切換，長按已選格開多選選單', async () => {
    vi.useFakeTimers();
    try {
      render(<BagPanel />);
      fireEvent.pointerDown(cells()[0], { button: 0, clientX: 5, clientY: 5, pointerType: 'touch' });
      await act(async () => { await vi.advanceTimersByTimeAsync(LONG_PRESS_MS + 20); });
      fireEvent.pointerUp(cells()[0], { clientX: 5, clientY: 5, pointerType: 'touch' });
      fireEvent.click(screen.getByText('多選'));
      expect(multi()).toHaveLength(1);

      tap(cells()[1], { pointerType: 'touch' });
      expect(multi()).toHaveLength(2);

      fireEvent.pointerDown(cells()[1], { button: 0, clientX: 5, clientY: 5, pointerType: 'touch' });
      await act(async () => { await vi.advanceTimersByTimeAsync(LONG_PRESS_MS + 20); });
      fireEvent.pointerUp(cells()[1], { clientX: 5, clientY: 5, pointerType: 'touch' });
      expect(multi()).toHaveLength(2);
      expect(screen.getByText('移動選取的 2 格')).toBeDefined();
      expect(screen.queryByText('多選')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('滑鼠右鍵選單沒有「多選」', () => {
    render(<BagPanel />);
    fireEvent.contextMenu(cells()[0]);
    expect(screen.queryByText('多選')).toBeNull();
  });
});

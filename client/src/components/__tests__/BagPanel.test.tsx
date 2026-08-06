import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BagPanel } from '../BagPanel';
import { DragGhost } from '../DragGhost';
import { useDragStore } from '../../stores/dragStore';
import { useGameStore } from '../../stores/gameStore';
import { LONG_PRESS_MS } from '../../hooks/useLongPress';
import { dragTo, dragStart, pointAt, restoreElementFromPoint } from '../../testing/pointerDrag';
import { bagItem } from '../../testing/bagFixtures';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

/**
 * @vitest-environment jsdom
 */

describe('BagPanel', () => {
  it('renders with section header and slot count', () => {
    render(<BagPanel />);
    expect(screen.getByText('背包')).toBeDefined();
    // § 35.1：無腰帶時為基礎 50 格
    expect(screen.getByText(/\/50/)).toBeDefined();
  });

it('shows gold row when expanded', () => {
    render(<BagPanel />);
    expect(screen.getByText('金幣')).toBeDefined();
  });

  it('shows potion cells with counts', () => {
    useGameStore.setState({
      bagItems: [bagItem('紅色藥水', 10)],
    });
    render(<BagPanel />);
    expect(screen.getByText('紅色藥水')).toBeDefined();
  });

  it('shows empty message when no items', () => {
    useGameStore.setState({ bagItems: [], inventory: [] });
    render(<BagPanel />);
    expect(screen.getByText('背包')).toBeDefined();
  });

  describe('兩段式點擊（§ 35.1.4）', () => {
    function cell() {
      return document.querySelector('.bag-cell:not(.empty)') as HTMLElement;
    }

    /** 一次完整的滑鼠點擊：按下與放開落在同一點 */
    function tap(el: Element, x = 10, y = 10) {
      fireEvent.pointerDown(el, { button: 0, clientX: x, clientY: y });
      fireEvent.pointerUp(el, { clientX: x, clientY: y });
    }

    it('第一次點擊只選取格子，不會用掉藥水', () => {
      const usePotionByType = vi.fn();
      useGameStore.setState({
        bagItems: [bagItem('紅色藥水', 3)],
        inventory: [],
        usePotionByType,
      });
      render(<BagPanel />);

      tap(cell());

      expect(usePotionByType).not.toHaveBeenCalled();
      expect(document.querySelector('.bag-cell.is-selected')).not.toBeNull();
    });

    it('選取後每點一下都直接使用，選取狀態留著', () => {
      const usePotionByType = vi.fn();
      useGameStore.setState({
        bagItems: [bagItem('紅色藥水', 3)],
        inventory: [],
        usePotionByType,
      });
      render(<BagPanel />);

      tap(cell());
      tap(cell());
      tap(cell());

      // 選一下 + 用兩下：連續使用不必每次重選
      expect(usePotionByType).toHaveBeenCalledTimes(2);
      expect(document.querySelector('.bag-cell.is-selected')).not.toBeNull();
    });

    it('點另一格會把選取移過去，不會誤觸原本那格', () => {
      const usePotionByType = vi.fn();
      useGameStore.setState({
        bagItems: [
          bagItem('紅色藥水', 3),
          bagItem('橙色藥水', 2),
        ],
        inventory: [],
        usePotionByType,
      });
      render(<BagPanel />);

      const cells = document.querySelectorAll('.bag-cell:not(.empty)');
      tap(cells[0]);
      tap(cells[1]);

      expect(usePotionByType).not.toHaveBeenCalled();
      expect(document.querySelectorAll('.bag-cell.is-selected')).toHaveLength(1);
    });

    it('點空白格會取消選取', () => {
      const usePotionByType = vi.fn();
      useGameStore.setState({
        bagItems: [bagItem('紅色藥水', 3)],
        inventory: [],
        usePotionByType,
      });
      render(<BagPanel />);

      tap(cell());
      expect(document.querySelector('.bag-cell.is-selected')).not.toBeNull();

      const empty = document.querySelector('.bag-cell.empty')!;
      fireEvent.pointerDown(empty, { button: 0 });
      fireEvent.click(empty);
      expect(document.querySelector('.bag-cell.is-selected')).toBeNull();

      // 取消之後再點原本那格只是重新選取，不會直接用掉
      tap(cell());
      expect(usePotionByType).not.toHaveBeenCalled();
    });

    it('點面板留白處也會取消選取', () => {
      useGameStore.setState({
        bagItems: [bagItem('紅色藥水', 3)],
        inventory: [],
      });
      render(<BagPanel />);

      tap(cell());
      expect(document.querySelector('.bag-cell.is-selected')).not.toBeNull();

      const header = document.querySelector('.bag-panel-header')!;
      fireEvent.pointerDown(header, { button: 0 });
      fireEvent.click(header);
      expect(document.querySelector('.bag-cell.is-selected')).toBeNull();
    });

    it('按在格子上、放開漂到格子間隙時，選取不可被清掉', () => {
      useGameStore.setState({
        bagItems: [bagItem('紅色藥水', 3)],
        inventory: [],
      });
      render(<BagPanel />);

      tap(cell());
      expect(document.querySelector('.bag-cell.is-selected')).not.toBeNull();

      // 快速點擊時游標會在按下到放開之間漂幾 px，落到 grid 的間隙上，
      // 瀏覽器就把 click 改派給 .bag-grid。這時不能當成「點在空白處」。
      fireEvent.click(document.querySelector('.bag-grid')!);
      expect(document.querySelector('.bag-cell.is-selected')).not.toBeNull();
    });

    it('拖曳吃掉 click 也不影響選取：按下當下就選好了', () => {
      useGameStore.setState({
        bagItems: [bagItem('紅色藥水', 3)],
        inventory: [],
      });
      render(<BagPanel />);

      // 拖曳起手不會有 click，選取必須在 pointerdown 當下就完成
      dragStart(cell());

      expect(document.querySelector('.bag-cell.is-selected')).not.toBeNull();
      restoreElementFromPoint();
    });

    it('按下到放開位移過大時算拖曳起手，不執行動作', () => {
      const usePotionByType = vi.fn();
      useGameStore.setState({
        bagItems: [bagItem('紅色藥水', 3)],
        inventory: [],
        usePotionByType,
      });
      render(<BagPanel />);

      tap(cell());  // 先選起來

      fireEvent.pointerDown(cell(), { button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerUp(cell(), { clientX: 60, clientY: 10 });

      expect(usePotionByType).not.toHaveBeenCalled();
    });

    it('裝備同樣是選取後再點才穿上', () => {
      const equipItem = vi.fn();
      useGameStore.setState({
        bagItems: [],
        inventory: [{
          id: 7, templateId: 1, name: '鐵劍', type: 'sword', slot: 'rightHand',
          isTwoHanded: false, quality: 0, enhancement: 0, affixes: [],
          ownerId: 1, equipped: false,
        }],
        equipItem,
      });
      render(<BagPanel />);

      tap(cell());
      expect(equipItem).not.toHaveBeenCalled();

      tap(cell());
      expect(equipItem).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * `47-mobile.md`：拖放改成 pointer-based（HTML5 拖放在觸控裝置上完全不觸發）。
   * 三個落點（背包格／快捷格／地圖）都由**拖曳來源**執行，這裡驗證背包格內重排。
   */
  describe('指標拖放（47-mobile）', () => {
    beforeEach(() => {
      useGameStore.setState({ bagItems: [bagItem('紅色藥水', 3)], inventory: [] });
    });
    afterEach(() => {
      restoreElementFromPoint();
      // dragStore 是模組層單例：上一個測試若停在拖曳中，下一個測試會看到殘留的拖曳狀態
      useDragStore.getState().cancel();
    });

    const cells = () => document.querySelectorAll('.bag-cell');

    it('拖到空格會換位置', () => {
      render(<BagPanel />);
      // 第一格是紅色藥水，第五格是空的
      expect(cells()[0].className).not.toContain('empty');
      dragTo(cells()[0], cells()[4]);

      expect(cells()[0].className).toContain('empty');
      expect(cells()[4].className).not.toContain('empty');
    });

    it('拖曳中來源格標記 dragging，落點格標記 drag-over', () => {
      render(<BagPanel />);
      const source = cells()[0];
      pointAt(cells()[4]);
      fireEvent.pointerDown(source, { button: 0, clientX: 0, clientY: 0, pointerType: 'mouse' });
      fireEvent.pointerMove(source, { clientX: 40, clientY: 40, pointerType: 'mouse' });

      expect(document.querySelector('.bag-cell.dragging')).not.toBeNull();
      expect(document.querySelector('.bag-cell.drag-over')).not.toBeNull();
    });

    it('拖曳中會畫出殘影，放開後消失', () => {
      // 殘影掛在 GameLayout 最外層（App.tsx），要一起渲染才看得到
      render(<><BagPanel /><DragGhost /></>);
      dragStart(cells()[0]);
      expect(screen.queryByTestId('drag-ghost')).not.toBeNull();

      fireEvent.pointerUp(cells()[0], { clientX: 40, clientY: 40, pointerType: 'mouse' });
      expect(screen.queryByTestId('drag-ghost')).toBeNull();
    });

    /**
     * 觸控**刻意不走拖曳**：長按已經是次要選單的入口，再讓「按住滑動」抓起格子，
     * 玩家想捲背包時每次都會誤觸。重排改走選單的「移動到其他格」。
     */
    it('觸控按住滑動不會啟動拖曳', () => {
      render(<BagPanel />);
      const source = cells()[0];
      pointAt(cells()[4]);
      fireEvent.pointerDown(source, { button: 0, clientX: 0, clientY: 0, pointerType: 'touch' });
      fireEvent.pointerMove(source, { clientX: 40, clientY: 40, pointerType: 'touch' });

      expect(screen.queryByTestId('drag-ghost')).toBeNull();
      expect(document.querySelector('.bag-cell.dragging')).toBeNull();
    });
  });

  /** `47-mobile.md`：觸控用的重排路徑 —— 長按開選單 →「移動到其他格」→ 點目標格 */
  describe('移動模式（觸控重排）', () => {
    beforeEach(() => {
      useGameStore.setState({ bagItems: [bagItem('紅色藥水', 3)], inventory: [] });
    });

    const cells = () => document.querySelectorAll('.bag-cell');

    it('長按開選單 → 移動 → 點目標格完成搬移', async () => {
      vi.useFakeTimers();
      try {
        render(<BagPanel />);
        fireEvent.pointerDown(cells()[0], { button: 0, clientX: 5, clientY: 5, pointerType: 'touch' });
        await act(async () => { await vi.advanceTimersByTimeAsync(LONG_PRESS_MS + 20); });

        const moveBtn = screen.getByText('移動到其他格');
        fireEvent.click(moveBtn);
        expect(screen.getByText(/選擇要移到的格子/)).toBeDefined();

        fireEvent.pointerDown(cells()[6], { button: 0, clientX: 5, clientY: 5, pointerType: 'touch' });

        expect(cells()[0].className).toContain('empty');
        expect(cells()[6].className).not.toContain('empty');
      } finally {
        vi.useRealTimers();
      }
    });

    it('長按開完選單，放開手指不會順手把藥水喝掉', async () => {
      vi.useFakeTimers();
      const usePotionByType = vi.fn();
      try {
        useGameStore.setState({ usePotionByType });
        render(<BagPanel />);

        // 先選起來，讓下一次點擊本來會直接使用
        fireEvent.pointerDown(cells()[0], { button: 0, clientX: 5, clientY: 5, pointerType: 'touch' });
        fireEvent.pointerUp(cells()[0], { clientX: 5, clientY: 5, pointerType: 'touch' });

        fireEvent.pointerDown(cells()[0], { button: 0, clientX: 5, clientY: 5, pointerType: 'touch' });
        await act(async () => { await vi.advanceTimersByTimeAsync(LONG_PRESS_MS + 20); });
        fireEvent.pointerUp(cells()[0], { clientX: 5, clientY: 5, pointerType: 'touch' });

        expect(usePotionByType).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
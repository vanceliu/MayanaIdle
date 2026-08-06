import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BagPanel } from '../BagPanel';
import { useGameStore } from '../../stores/gameStore';
import { BAG_DRAG_MIME, decodeBagDrag } from '../../models/bagLayout';
import { bagItem } from '../../testing/bagFixtures';

import { getItemId } from '../../models/items';
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

      // 真的拖起來時瀏覽器只發 dragstart／dragend，不發 pointerup 也不發 click
      fireEvent.pointerDown(cell(), { button: 0, clientX: 10, clientY: 10 });
      fireEvent.dragStart(cell(), { dataTransfer: { setData: () => {}, effectAllowed: '' } });

      expect(document.querySelector('.bag-cell.is-selected')).not.toBeNull();
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
   * 迴歸測試：`effectAllowed` 必須允許 copy 與 move 兩種。
   *
   * 快捷鍵綁定用 `dropEffect='copy'`、丟到地圖用 `'move'`；
   * 若來源只宣告 `'move'`，瀏覽器會判定與 `'copy'` 不相容而**直接取消放置**，
   * drop 事件根本不會觸發 —— 症狀是「拖不進快捷鍵，但丟到地圖可以」。
   */
  it('拖曳來源的 effectAllowed 同時允許 copy 與 move', () => {
    useGameStore.setState({
      bagItems: [bagItem('紅色藥水', 3)],
      inventory: [],
    });
    render(<BagPanel />);

    const cell = document.querySelector('.bag-cell:not(.empty)');
    expect(cell).not.toBeNull();

    const store: Record<string, string> = {};
    const dataTransfer = {
      types: [] as string[],
      setData: (type: string, value: string) => { store[type] = value; dataTransfer.types.push(type); },
      getData: (type: string) => store[type] ?? '',
      effectAllowed: '',
      dropEffect: '',
    };

    fireEvent.dragStart(cell!, { dataTransfer });

    expect(dataTransfer.effectAllowed).toBe('copyMove');
    // 同時確認負載有寫進去，且解得出來
    expect(decodeBagDrag(store[BAG_DRAG_MIME])).toEqual({
      kind: 'bag', name: '紅色藥水', itemId: getItemId('紅色藥水'), amount: 3, equipmentId: undefined,
    });
  });
});
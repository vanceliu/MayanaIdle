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
  // § 35.17：格子位置改存在 store（跨 session 持久化），是模組層單例 ——
  // 不重置的話上一個測試拖出來的位置會殘留到下一個測試
  beforeEach(() => {
    useGameStore.setState({ bagSlotMap: {} });
  });

  // 面板裡不再重複寫「背包」（視窗標題已經是），分頁列與格數就是唯一的表頭
  it('renders with section header and slot count', () => {
    render(<BagPanel />);
    expect(screen.getByRole('tab', { name: '一般' })).toBeDefined();
    // § 35.1：無腰帶時為基礎 60 格
    expect(screen.getByText(/\/60/)).toBeDefined();
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
    expect(screen.getByRole('tab', { name: '一般' })).toBeDefined();
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

      const header = document.querySelector('.bag-tabs')!;
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

  /** § 35.1：穿上不等於離開背包 —— 裝備中的裝備照樣佔一格，只是多一個標記 */
  describe('裝備中的格子（§ 35.1）', () => {
    const sword = {
      id: 7, templateId: 1, name: '鐵劍', type: 'sword', slot: 'rightHand',
      isTwoHanded: false, quality: 0, enhancement: 0, affixes: [],
      ownerId: 1, equipped: true,
    } as any;

    function tap(el: Element, x = 10, y = 10) {
      fireEvent.pointerDown(el, { button: 0, clientX: x, clientY: y });
      fireEvent.pointerUp(el, { clientX: x, clientY: y });
    }

    const cell = () => document.querySelector('.bag-cell:not(.empty)') as HTMLElement;

    afterEach(() => {
      useGameStore.setState({ equippedGear: {} });
    });

    it('身上的裝備會出現在背包格上並標示裝備中', () => {
      useGameStore.setState({ bagItems: [], inventory: [], equippedGear: { rightHand: sword } });
      render(<BagPanel />);

      expect(screen.getByText('鐵劍')).toBeDefined();
      expect(screen.getByText('裝備中')).toBeDefined();
      expect(cell().className).toContain('is-equipped');
    });

    it('裝備中一樣計入已用格數', () => {
      useGameStore.setState({
        bagItems: [bagItem('紅色藥水', 3)],
        inventory: [],
        equippedGear: { rightHand: sword },
      });
      render(<BagPanel />);

      expect(screen.getByText('2/60')).toBeDefined();
    });

    it('兩段式點擊第二下是卸下，不是穿上', () => {
      const equipItem = vi.fn();
      const unequipItem = vi.fn();
      useGameStore.setState({
        bagItems: [], inventory: [], equippedGear: { rightHand: sword },
        equipItem, unequipItem,
      });
      render(<BagPanel />);

      tap(cell());
      expect(unequipItem).not.toHaveBeenCalled();

      tap(cell());
      expect(unequipItem).toHaveBeenCalledWith('rightHand');
      expect(equipItem).not.toHaveBeenCalled();
    });

    it('右鍵選單不提供丟棄（要先卸下來）', () => {
      useGameStore.setState({ bagItems: [], inventory: [], equippedGear: { rightHand: sword } });
      render(<BagPanel />);

      fireEvent.contextMenu(cell(), { clientX: 10, clientY: 10 });

      expect(document.querySelector('.bag-context-menu')).toBeTruthy();
      expect(screen.queryByText(/^丟棄/)).toBeNull();
      expect(screen.getByText('移動到其他格')).toBeDefined();
    });
  });

  /**
   * § 35.1.3：穿脫**不改變格子位置** —— 預設順序與「是否裝備中」無關，
   * 一律依裝備實例 id 排。分兩段推入的話，穿上 A 的同時 B 被換下來，
   * 兩件在預設順序中的分組互換，沒有手動位置的那兩格會當場對調。
   */
  describe('穿脫不改變格子位置（§ 35.1.3）', () => {
    const equip = (id: number, name: string, equipped: boolean) => ({
      id, templateId: 1, name, type: 'sword', slot: 'rightHand',
      isTwoHanded: false, quality: 0, enhancement: 0, affixes: [],
      ownerId: 1, equipped,
    }) as any;

    const cellNames = () =>
      Array.from(document.querySelectorAll('.bag-cell:not(.empty) .bag-cell-name'))
        .map(el => el.textContent);

    afterEach(() => {
      useGameStore.setState({ equippedGear: {}, inventory: [] });
    });

    it('穿上背包裝備時，不會與原本裝備中的那件對調格子', () => {
      // 先取得的 id=3 在前，後取得的 id=9 在後
      const worn = equip(3, '鐵劍', true);
      const inBag = equip(9, '鋼劍', false);

      useGameStore.setState({
        bagItems: [], inventory: [inBag], equippedGear: { rightHand: worn },
      });
      const first = render(<BagPanel />);
      expect(cellNames()).toEqual(['鐵劍', '鋼劍']);
      first.unmount();

      // 換裝：鋼劍穿上、鐵劍回背包。兩件的 id 沒變，順序就不該變
      useGameStore.setState({
        bagItems: [], inventory: [worn], equippedGear: { rightHand: inBag },
      });
      render(<BagPanel />);
      expect(cellNames()).toEqual(['鐵劍', '鋼劍']);
    });

    it('背包裝備的 id 較小時，穿上後一樣留在前面', () => {
      const worn = equip(9, '鋼劍', true);
      const inBag = equip(3, '鐵劍', false);

      useGameStore.setState({
        bagItems: [], inventory: [inBag], equippedGear: { rightHand: worn },
      });
      const first = render(<BagPanel />);
      // 裝備中的不再自動浮到前面：id 3 在前
      expect(cellNames()).toEqual(['鐵劍', '鋼劍']);
      first.unmount();

      useGameStore.setState({
        bagItems: [], inventory: [worn], equippedGear: { rightHand: inBag },
      });
      render(<BagPanel />);
      expect(cellNames()).toEqual(['鐵劍', '鋼劍']);
    });
  });

  /** § 35.8：整理是一次性落位，把排序結果整批寫進 slotMap */
  describe('整理（§ 35.8）', () => {
    const sword = (id: number, name: string, equipped: boolean) => ({
      id, templateId: 1, name, type: 'sword', slot: 'rightHand',
      isTwoHanded: false, quality: 0, enhancement: 0, affixes: [],
      ownerId: 1, equipped,
    }) as any;

    afterEach(() => {
      useGameStore.setState({ equippedGear: {}, inventory: [] });
    });

    it('按下後把裝備中的排到最前面，並寫進 slotMap', () => {
      useGameStore.setState({
        bagItems: [bagItem('紅色藥水', 3)],
        inventory: [],
        equippedGear: { rightHand: sword(7, '鐵劍', true) },
      });
      render(<BagPanel />);

      // 整理前：id 順序（藥水在前，裝備中的沒有特權）
      const before = Array.from(document.querySelectorAll('.bag-cell:not(.empty) .bag-cell-name'))
        .map(el => el.textContent);
      expect(before).toEqual(['紅色藥水', '鐵劍']);

      fireEvent.click(screen.getByText('整理'));

      const after = Array.from(document.querySelectorAll('.bag-cell:not(.empty) .bag-cell-name'))
        .map(el => el.textContent);
      expect(after).toEqual(['鐵劍', '紅色藥水']);
      expect(useGameStore.getState().bagSlotMap).toEqual({ 'equip-7': 0, 'potion-red': 1 });
    });

    it('是單向動作 —— 再按一次不會還原', () => {
      useGameStore.setState({
        bagItems: [bagItem('紅色藥水', 3)],
        inventory: [],
        equippedGear: { rightHand: sword(7, '鐵劍', true) },
      });
      render(<BagPanel />);

      fireEvent.click(screen.getByText('整理'));
      const afterFirst = useGameStore.getState().bagSlotMap;

      fireEvent.click(screen.getByText('整理'));
      expect(useGameStore.getState().bagSlotMap).toEqual(afterFirst);

      const names = Array.from(document.querySelectorAll('.bag-cell:not(.empty) .bag-cell-name'))
        .map(el => el.textContent);
      expect(names).toEqual(['鐵劍', '紅色藥水']);
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
/**
 * § 35.20：印記收在底部抽屜，不佔格、不進 slotMap、不吃整理。
 * 開合狀態不持久化，重開回到收合。
 */
describe('印記抽屜（§ 35.20）', () => {
  beforeEach(() => {
    useGameStore.setState({ bagSlotMap: {}, inventory: [], equippedGear: {} });
  });

  const toggle = () => screen.getByRole('button', { name: /印記/ });
  const drawer = () => document.querySelector('.bag-sigil-drawer');
  const gridNames = () =>
    Array.from(document.querySelectorAll('.bag-grid-container .bag-cell:not(.empty) .bag-cell-name'))
      .map(el => el.textContent);
  const drawerNames = () =>
    Array.from(document.querySelectorAll('.bag-sigil-drawer .bag-cell .bag-cell-name'))
      .map(el => el.textContent);

  it('印記不出現在背包格，也不算進格數', () => {
    useGameStore.setState({
      bagItems: [bagItem('紅色藥水', 3), bagItem('工藝印記', 43)],
    });
    render(<BagPanel />);

    expect(gridNames()).toEqual(['紅色藥水']);
    expect(screen.getByText('1/60')).toBeDefined();
  });

  it('預設收合，點一下展開、再點一次收合', () => {
    useGameStore.setState({ bagItems: [bagItem('工藝印記', 43), bagItem('混沌印記', 2)] });
    render(<BagPanel />);

    expect(drawer()).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle());
    expect(drawer()).not.toBeNull();
    expect(drawerNames().sort()).toEqual(['工藝印記', '混沌印記']);

    fireEvent.click(toggle());
    expect(drawer()).toBeNull();
  });

  it('抽屜展開時，格數與「整理」照樣在 —— 背包格沒有讓位', () => {
    useGameStore.setState({ bagItems: [bagItem('紅色藥水', 3), bagItem('工藝印記', 5)] });
    render(<BagPanel />);

    fireEvent.click(toggle());

    expect(screen.getByText('整理')).toBeDefined();
    expect(screen.getByText('1/60')).toBeDefined();
    expect(gridNames()).toEqual(['紅色藥水']);
  });

  it('沒有印記時顯示空狀態', () => {
    useGameStore.setState({ bagItems: [bagItem('紅色藥水', 3)] });
    render(<BagPanel />);

    fireEvent.click(toggle());
    expect(screen.getByText('還沒有任何印記')).toBeDefined();
  });

  it('開合時把選取收掉 —— 抽屜蓋上去後那一格就看不到了', () => {
    useGameStore.setState({ bagItems: [bagItem('紅色藥水', 3), bagItem('工藝印記', 5)] });
    render(<BagPanel />);

    const cell = document.querySelector('.bag-grid-container .bag-cell:not(.empty)')!;
    fireEvent.pointerDown(cell, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(cell, { clientX: 10, clientY: 10 });
    expect(document.querySelector('.bag-cell.is-selected')).not.toBeNull();

    fireEvent.click(toggle());
    expect(document.querySelector('.bag-cell.is-selected')).toBeNull();
  });

  it('整理不會把印記排進 slotMap', () => {
    useGameStore.setState({
      bagItems: [bagItem('紅色藥水', 3), bagItem('工藝印記', 43)],
    });
    render(<BagPanel />);

    fireEvent.click(screen.getByText('整理'));

    const map = useGameStore.getState().bagSlotMap;
    expect(Object.keys(map)).toEqual(['potion-red']);
  });
});

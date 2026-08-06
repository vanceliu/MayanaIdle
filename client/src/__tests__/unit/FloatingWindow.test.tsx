// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FloatingWindow } from '../../components/FloatingWindow';
import { usePanelWindowStore, PANEL_KEYS } from '../../stores/panelWindowStore';
import { useWindowLayerStore, getWindowZIndex } from '../../stores/windowLayerStore';

function reset() {
  useWindowLayerStore.setState({ order: [] });
  usePanelWindowStore.getState().closeAll();
  usePanelWindowStore.getState().openPanel('bag');
  usePanelWindowStore.setState({
    positions: {
      stats: { x: 24, y: 120 },
      equipment: { x: 40, y: 120 },
      bag: { x: 100, y: 80 },
      skill: { x: 60, y: 120 },
      quest: { x: 80, y: 120 },
      script: { x: 120, y: 120 },
    },
    order: [...PANEL_KEYS],
  });
}

function renderBag() {
  return render(
    <FloatingWindow panelKey="bag" title="背包" width={400}>
      <div data-testid="bag-content">內容</div>
    </FloatingWindow>
  );
}

describe('FloatingWindow', () => {
  beforeEach(reset);

  it('渲染標題與內容', () => {
    renderBag();
    expect(screen.getByText('背包')).toBeTruthy();
    expect(screen.getByTestId('bag-content')).toBeTruthy();
  });

  it('依 store 位置定位', () => {
    renderBag();
    const win = screen.getByTestId('floating-window-bag') as HTMLElement;
    expect(win.style.left).toBe('100px');
    expect(win.style.top).toBe('80px');
  });

  it('關閉鈕會關閉該面板', () => {
    renderBag();
    fireEvent.click(screen.getByLabelText('關閉背包'));
    expect(usePanelWindowStore.getState().open.bag).toBe(false);
  });

  it('在關閉鈕上按下不會啟動拖曳（避免 pointer capture 吃掉 click）', () => {
    renderBag();
    const closeBtn = screen.getByLabelText('關閉背包');

    fireEvent.pointerDown(closeBtn, { button: 0, clientX: 480, clientY: 90, pointerId: 1 });
    fireEvent.pointerMove(screen.getByTestId('floating-window-header-bag'), {
      clientX: 600, clientY: 300, pointerId: 1,
    });

    expect(usePanelWindowStore.getState().positions.bag).toEqual({ x: 100, y: 80 });
  });

  it('在關閉鈕上完成 down → up → click 仍會關閉視窗', () => {
    renderBag();
    const closeBtn = screen.getByLabelText('關閉背包');

    fireEvent.pointerDown(closeBtn, { button: 0, clientX: 480, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(closeBtn, { clientX: 480, clientY: 90, pointerId: 1 });
    fireEvent.click(closeBtn);

    expect(usePanelWindowStore.getState().open.bag).toBe(false);
  });

  it('點到視窗會提到最上層（與戰鬥日誌／城鎮視窗共用堆疊，§ 32.15）', () => {
    renderBag();
    const win = screen.getByTestId('floating-window-bag') as HTMLElement;
    /*
     * 兩者的 z 一律**當下重算**，不可拿點擊前捕捉的值來比 ——
     * 堆疊是相對順序，任何一次 focus 都會把所有人的數字往上推一格。
     */
    const zOf = (key: Parameters<typeof getWindowZIndex>[1]) =>
      getWindowZIndex(useWindowLayerStore.getState().order, key);

    // 先讓城鎮視窗在上面（視窗開啟時已自動置頂，所以這裡是把它蓋回去）
    useWindowLayerStore.getState().focusWindow('town');
    expect(Number(win.style.zIndex)).toBeLessThan(zOf('town'));

    fireEvent.pointerDown(win, { button: 0, pointerId: 1 });

    expect(zOf('panel:bag')).toBeGreaterThan(zOf('town'));
    expect(Number(win.style.zIndex)).toBe(zOf('panel:bag'));
  });

  /**
   * 開啟這個動作發生在**別的元件**上（底部的面板按鈕），沒人通知堆疊 ——
   * 剛開的面板會被上一個被點過的視窗蓋住。手機最明顯：面板是滿版 sheet，
   * 城鎮設施列卻整條浮在它上面（`47-mobile.md`）。
   */
  it('開啟時就自動提到最上層，不必等玩家點一下', () => {
    useWindowLayerStore.getState().focusWindow('town');
    renderBag();

    const order = useWindowLayerStore.getState().order;
    expect(order[order.length - 1]).toBe('panel:bag');
    expect(getWindowZIndex(order, 'panel:bag'))
      .toBeGreaterThan(getWindowZIndex(order, 'town'));
  });

  it('拖曳標題列會更新位置', () => {
    renderBag();
    const header = screen.getByTestId('floating-window-header-bag');

    fireEvent.pointerDown(header, { button: 0, clientX: 150, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(header, { clientX: 200, clientY: 160, pointerId: 1 });
    fireEvent.pointerUp(header, { clientX: 200, clientY: 160, pointerId: 1 });

    // 起始 offset = (150-100, 100-80) = (50, 20) → 新位置 = (200-50, 160-20)
    expect(usePanelWindowStore.getState().positions.bag).toEqual({ x: 150, y: 140 });
  });

  it('介面縮放時拖曳位置換算回版面座標（§ 34.6）', () => {
    renderBag();
    const win = screen.getByTestId('floating-window-bag') as HTMLElement;
    const header = screen.getByTestId('floating-window-header-bag');

    // 模擬 zoom 1.25：版面寬 400，畫面上量到 500
    Object.defineProperty(win, 'offsetWidth', { value: 400, configurable: true });
    Object.defineProperty(win, 'offsetHeight', { value: 300, configurable: true });
    win.getBoundingClientRect = () => ({
      width: 500, height: 375, top: 100, left: 125, right: 625, bottom: 475, x: 125, y: 100,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(header, { button: 0, clientX: 250, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(header, { clientX: 375, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(header, { clientX: 375, clientY: 300, pointerId: 1 });

    // 指標移動 (125, 100) 視窗座標 = (100, 80) 版面座標 → 起點 (100, 80) 移到 (200, 160)
    expect(usePanelWindowStore.getState().positions.bag).toEqual({ x: 200, y: 160 });
  });

  it('放開後再移動滑鼠不會繼續拖曳', () => {
    renderBag();
    const header = screen.getByTestId('floating-window-header-bag');

    fireEvent.pointerDown(header, { button: 0, clientX: 150, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(header, { clientX: 150, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(header, { clientX: 400, clientY: 400, pointerId: 1 });

    expect(usePanelWindowStore.getState().positions.bag).toEqual({ x: 100, y: 80 });
  });

  it('拖曳位置夾制在 viewport 內，不會被拖出畫面', () => {
    renderBag();
    const header = screen.getByTestId('floating-window-header-bag');

    fireEvent.pointerDown(header, { button: 0, clientX: 100, clientY: 80, pointerId: 1 });
    fireEvent.pointerMove(header, { clientX: -500, clientY: -500, pointerId: 1 });

    const pos = usePanelWindowStore.getState().positions.bag;
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });

  it('點擊視窗會置頂', () => {
    usePanelWindowStore.setState({ order: ['bag', 'stats', 'equipment', 'skill'] });
    renderBag();

    fireEvent.pointerDown(screen.getByTestId('floating-window-bag'), { button: 0, pointerId: 1 });

    const { order } = usePanelWindowStore.getState();
    expect(order[order.length - 1]).toBe('bag');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { FloatingWindow } from '../FloatingWindow';
import { usePanelWindowStore } from '../../stores/panelWindowStore';
import { useWindowLayerStore, getWindowZIndex } from '../../stores/windowLayerStore';
import { installFakeViewport, uninstallFakeViewport, VIEWPORTS } from '../../testing/viewport';

/**
 * @vitest-environment jsdom
 */

/**
 * `47-mobile.md`：手機把浮動視窗切成全螢幕 sheet。
 *
 * 「可拖曳、可多開、無遮罩」是桌機的做法 —— 它預設玩家同時看得到地圖與好幾個面板。
 * 393px 寬連一個 420px 的面板都放不下，多開等於互相蓋住，拖曳也沒有空位可以拖過去。
 */
describe('FloatingWindow sheet 模式（47-mobile）', () => {
  beforeEach(() => {
    usePanelWindowStore.getState().resetPositions();
    useWindowLayerStore.setState({ order: [] });
  });
  afterEach(() => uninstallFakeViewport());

  function renderWindow() {
    render(
      <FloatingWindow panelKey="bag" title="背包" width={420}>
        <div>內容</div>
      </FloatingWindow>,
    );
    return screen.getByTestId('floating-window-bag');
  }

  it('手機：掛上 is-sheet，且不吃 inline 的 left/top/width', () => {
    installFakeViewport(VIEWPORTS.phonePortrait);
    const win = renderWindow();

    expect(win.className).toContain('is-sheet');
    // 尺寸與位置全部交給 CSS；inline style 的優先度壓過 class，留著就會蓋掉 sheet 版面
    expect(win.style.width).toBe('');
    expect(win.style.left).toBe('');
    expect(win.style.top).toBe('');
    expect(win.style.zIndex).not.toBe('');
  });

  it('桌機：維持原本的 left/top/width，不掛 is-sheet', () => {
    installFakeViewport(VIEWPORTS.desktop);
    const win = renderWindow();

    expect(win.className).not.toContain('is-sheet');
    expect(win.style.width).toBe('420px');
    expect(win.style.left).not.toBe('');
  });

  /** 拖曳在滿版 sheet 上沒有意義，拖了只會把面板拖出畫面 */
  it('手機：拖曳標題列不會改變位置', () => {
    installFakeViewport(VIEWPORTS.phonePortrait);
    renderWindow();
    const before = { ...usePanelWindowStore.getState().positions.bag };

    const header = screen.getByTestId('floating-window-header-bag');
    fireEvent.pointerDown(header, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(header, { clientX: 200, clientY: 300 });
    fireEvent.pointerUp(header, { clientX: 200, clientY: 300 });

    expect(usePanelWindowStore.getState().positions.bag).toEqual(before);
  });

  it('桌機：拖曳標題列仍然移動視窗（不可因為支援手機而退化）', () => {
    installFakeViewport(VIEWPORTS.desktop);
    renderWindow();
    const before = { ...usePanelWindowStore.getState().positions.bag };

    const header = screen.getByTestId('floating-window-header-bag');
    fireEvent.pointerDown(header, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(header, { clientX: 200, clientY: 300 });
    fireEvent.pointerUp(header, { clientX: 200, clientY: 300 });

    expect(usePanelWindowStore.getState().positions.bag).not.toEqual(before);
  });

  /**
   * 迴歸：開啟這個動作發生在**別的元件**上（底部的面板按鈕），
   * 沒人通知視窗堆疊（§ 32.15），剛開的面板會被上一個被點過的視窗蓋住 ——
   * 手機更明顯：面板是滿版 sheet，城鎮設施列卻整條浮在它上面。
   */
  it('開啟時自動提到視窗堆疊最上層', () => {
    installFakeViewport(VIEWPORTS.phonePortrait);
    // 先讓城鎮視窗拿到最上層
    useWindowLayerStore.getState().focusWindow('town');

    renderWindow();

    const order = useWindowLayerStore.getState().order;
    expect(order[order.length - 1]).toBe('panel:bag');
    expect(getWindowZIndex(order, 'panel:bag'))
      .toBeGreaterThan(getWindowZIndex(order, 'town'));
  });

  it('sheet 模式仍然關得掉', () => {
    installFakeViewport(VIEWPORTS.phonePortrait);
    usePanelWindowStore.getState().openPanel('bag');
    renderWindow();

    fireEvent.click(screen.getByLabelText('關閉背包'));
    expect(usePanelWindowStore.getState().open.bag).toBe(false);
  });
});

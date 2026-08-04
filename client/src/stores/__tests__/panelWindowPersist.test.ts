import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  restoreLayout,
  scalePositions,
  getCurrentViewport,
  flushPanelPositions,
  usePanelWindowStore,
  PANEL_KEYS,
  type PanelKey,
  type PanelPosition,
} from '../panelWindowStore';

/**
 * @vitest-environment jsdom
 *
 * 浮動視窗位置持久化（`16-tech-frontend-architecture.md` § 32.15）。
 * 存座標時一併記下當時的視窗尺寸，換視窗大小時按比例還原。
 */

const KEY = 'mayana_panel_positions';

/** jsdom 的 innerWidth/Height 可寫，直接指定即可 */
function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, writable: true, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: h, writable: true, configurable: true });
}

function fullPositions(pos: PanelPosition): Record<PanelKey, PanelPosition> {
  return Object.fromEntries(PANEL_KEYS.map(k => [k, { ...pos }])) as Record<PanelKey, PanelPosition>;
}

beforeEach(() => {
  localStorage.clear();
  setViewport(1920, 1080);
});

describe('scalePositions', () => {
  it('尺寸沒變時原樣回傳', () => {
    const positions = fullPositions({ x: 100, y: 200 });
    const result = scalePositions(positions, { w: 1920, h: 1080 }, { w: 1920, h: 1080 });
    expect(result).toBe(positions);
  });

  it('視窗變窄時 x 等比例縮小', () => {
    const result = scalePositions(
      fullPositions({ x: 960, y: 540 }),
      { w: 1920, h: 1080 },
      { w: 1280, h: 1080 },
    );
    expect(result.stats).toEqual({ x: 640, y: 540 });
  });

  it('寬高各自依自己的比例換算', () => {
    const result = scalePositions(
      fullPositions({ x: 960, y: 540 }),
      { w: 1920, h: 1080 },
      { w: 960, h: 270 },
    );
    expect(result.stats).toEqual({ x: 480, y: 135 });
  });

  it('放大視窗時座標跟著往外推', () => {
    const result = scalePositions(
      fullPositions({ x: 100, y: 100 }),
      { w: 1280, h: 720 },
      { w: 2560, h: 1440 },
    );
    expect(result.stats).toEqual({ x: 200, y: 200 });
  });

  it('座標取整數，不留浮點殘渣', () => {
    const result = scalePositions(
      fullPositions({ x: 100, y: 100 }),
      { w: 1920, h: 1080 },
      { w: 1281, h: 1080 },
    );
    expect(Number.isInteger(result.stats.x)).toBe(true);
  });
});

describe('restoreLayout', () => {
  it('沒有存檔時回預設位置', () => {
    const result = restoreLayout(null, { w: 1920, h: 1080 });
    expect(result.stats).toEqual({ x: 24, y: 120 });
  });

  it('依存檔的視窗尺寸換算回目前尺寸', () => {
    const stored = {
      viewport: { w: 1920, h: 1080 },
      positions: fullPositions({ x: 960, y: 540 }),
    };
    expect(restoreLayout(stored, { w: 960, h: 1080 }).stats).toEqual({ x: 480, y: 540 });
  });

  it('舊格式（沒有 viewport）維持絕對座標，不整份丟掉', () => {
    const stored = { positions: fullPositions({ x: 300, y: 400 }) };
    expect(restoreLayout(stored, { w: 1280, h: 720 }).stats).toEqual({ x: 300, y: 400 });
  });

  it('取不到目前視窗尺寸時維持絕對座標', () => {
    const stored = {
      viewport: { w: 1920, h: 1080 },
      positions: fullPositions({ x: 300, y: 400 }),
    };
    expect(restoreLayout(stored, null).stats).toEqual({ x: 300, y: 400 });
  });

  it('只有某個面板壞掉時，只有那一格退回預設', () => {
    const positions: Record<string, unknown> = fullPositions({ x: 300, y: 400 });
    positions.bag = { x: 'NaN', y: 10 };
    const result = restoreLayout({ positions }, null);

    expect(result.stats).toEqual({ x: 300, y: 400 });
    expect(result.bag).toEqual({ x: 780, y: 120 });  // 預設值
  });

  it('新增 PanelKey 後舊存檔缺的那格用預設值補上', () => {
    const partial = { positions: { stats: { x: 5, y: 5 } } };
    const result = restoreLayout(partial, null);

    expect(result.stats).toEqual({ x: 5, y: 5 });
    expect(result.script).toEqual({ x: 700, y: 72 });
  });

  it('負座標視為壞資料（視窗會跑到畫面外）', () => {
    const result = restoreLayout({ positions: { stats: { x: -50, y: 10 } } }, null);
    expect(result.stats).toEqual({ x: 24, y: 120 });
  });

  it('完全不是物件的輸入不會炸', () => {
    expect(restoreLayout('壞掉的字串', null).stats).toEqual({ x: 24, y: 120 });
    expect(restoreLayout(42, null).stats).toEqual({ x: 24, y: 120 });
  });
});

describe('getCurrentViewport', () => {
  it('回傳目前視窗尺寸', () => {
    setViewport(1440, 900);
    expect(getCurrentViewport()).toEqual({ w: 1440, h: 900 });
  });

  it('尺寸為 0 時回 null（視窗尚未量到，不可拿來當除數）', () => {
    setViewport(0, 0);
    expect(getCurrentViewport()).toBeNull();
  });
});

describe('寫入行為', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('拖曳中不會每次都寫 localStorage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    for (let i = 0; i < 30; i++) {
      usePanelWindowStore.getState().setPosition('bag', { x: i, y: i });
    }
    expect(setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(setItem).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it('寫入的內容含視窗尺寸與最後一次座標', () => {
    usePanelWindowStore.getState().setPosition('bag', { x: 111, y: 222 });
    vi.advanceTimersByTime(300);

    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.viewport).toEqual({ w: 1920, h: 1080 });
    expect(saved.positions.bag).toEqual({ x: 111, y: 222 });
  });

  it('flush 可在 debounce 到期前立刻寫入（關閉分頁時不掉資料）', () => {
    usePanelWindowStore.getState().setPosition('skill', { x: 7, y: 8 });
    expect(localStorage.getItem(KEY)).toBeNull();

    flushPanelPositions();
    expect(JSON.parse(localStorage.getItem(KEY)!).positions.skill).toEqual({ x: 7, y: 8 });
  });

  it('localStorage 寫入失敗不影響狀態', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });

    usePanelWindowStore.getState().setPosition('quest', { x: 9, y: 9 });
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    expect(usePanelWindowStore.getState().positions.quest).toEqual({ x: 9, y: 9 });

    setItem.mockRestore();
  });

  it('resetPositions 清掉存檔並回到預設，且不會被待寫入的值蓋回去', () => {
    usePanelWindowStore.getState().setPosition('stats', { x: 500, y: 500 });
    usePanelWindowStore.getState().resetPositions();

    expect(usePanelWindowStore.getState().positions.stats).toEqual({ x: 24, y: 120 });
    expect(localStorage.getItem(KEY)).toBeNull();

    vi.advanceTimersByTime(300);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

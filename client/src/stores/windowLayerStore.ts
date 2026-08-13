import { create } from 'zustand';

/**
 * 視窗層級（`16-tech-frontend-architecture.md` § 32.15）
 *
 * 畫面上會互相重疊的「視窗」不只浮動面板 —— 還有戰鬥日誌、城鎮設施視窗、地圖選擇器。
 * 它們原本各自寫死 z-index，同值時只能靠 DOM 順序決勝負，於是戰鬥日誌永遠蓋住武器店。
 *
 * 這裡統一成一個堆疊順序：**點到誰誰就到最上層**，與視窗種類無關。
 */

/** 視窗層級的起點。HUD 常駐控制（快捷格、面板按鈕）刻意排在這個帶狀區間之上 */
export const WINDOW_Z_BASE = 500;

export type WindowLayerKey =
  | `panel:${string}`
  | 'combat-log'
  | 'town'
  | 'map-nav';

interface WindowLayerState {
  /** 由下而上的堆疊順序，最後一個在最上層 */
  order: WindowLayerKey[];
  focusWindow: (key: WindowLayerKey) => void;
}

export const useWindowLayerStore = create<WindowLayerState>((set, get) => ({
  order: [],

  focusWindow(key) {
    const order = get().order;
    // 已經在最上層就不寫入狀態（避免每次 pointerdown 觸發整批視窗重繪）
    if (order[order.length - 1] === key) return;
    set({ order: [...order.filter(k => k !== key), key] });
  },
}));

/** 沒被點過的視窗一律停在基準層，彼此維持原本的 DOM 順序 */
export function getWindowZIndex(order: WindowLayerKey[], key: WindowLayerKey): number {
  const index = order.indexOf(key);
  return WINDOW_Z_BASE + (index < 0 ? 0 : index + 1);
}

/** 元件用：讀自己的 z-index，順序變動時才重繪 */
export function useWindowZIndex(key: WindowLayerKey): number {
  return useWindowLayerStore(s => getWindowZIndex(s.order, key));
}

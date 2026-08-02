import { create } from 'zustand';

/**
 * 浮動面板視窗狀態（16-tech-frontend-architecture.md § 32.15）
 *
 * 四個面板（詳細狀態 / 裝備欄 / 背包 / 技能）改為可拖曳浮動視窗：
 * 可同時開啟多個、無遮罩、點擊置頂。位置與開關狀態只存在於當下 session。
 */
export type PanelKey = 'stats' | 'equipment' | 'bag' | 'skill' | 'quest';

export const PANEL_KEYS: readonly PanelKey[] = ['stats', 'equipment', 'bag', 'skill', 'quest'];

/**
 * PanelDock 以泛用按鈕渲染的面板。
 * `quest` 不在此列 —— 它的按鈕要顯示任務數量 badge，由 `QuestTrackerButton` 自行渲染。
 */
export const DOCK_PANEL_KEYS: readonly PanelKey[] = ['stats', 'equipment', 'bag', 'skill'];

export const PANEL_TITLES: Record<PanelKey, string> = {
  stats: '詳細狀態',
  equipment: '裝備欄',
  bag: '背包',
  skill: '技能',
  quest: '進行中的任務',
};

export const PANEL_WIDTHS: Record<PanelKey, number> = {
  stats: 340,
  equipment: 360,
  bag: 420,
  skill: 420,
  quest: 320,
};

/** 浮動視窗 z-index 基準：高於地圖 HUD，低於 modal overlay（.modal-overlay = 1000） */
export const PANEL_Z_BASE = 300;

export interface PanelPosition {
  x: number;
  y: number;
}

/** 首次開啟時的停靠位置，四個面板錯開避免完全重疊 */
const DEFAULT_POSITIONS: Record<PanelKey, PanelPosition> = {
  stats: { x: 24, y: 120 },
  equipment: { x: 396, y: 120 },
  bag: { x: 780, y: 120 },
  skill: { x: 1224, y: 120 },
  // 任務預設落在 stage 右上角（小螢幕會被 FloatingWindow 夾回可視範圍）
  quest: { x: 1576, y: 128 },
};

interface PanelWindowState {
  open: Record<PanelKey, boolean>;
  positions: Record<PanelKey, PanelPosition>;
  /** z 順序，陣列末端為最上層 */
  order: PanelKey[];
  toggle: (key: PanelKey) => void;
  openPanel: (key: PanelKey) => void;
  closePanel: (key: PanelKey) => void;
  focusPanel: (key: PanelKey) => void;
  setPosition: (key: PanelKey, pos: PanelPosition) => void;
  closeAll: () => void;
}

function moveToTop(order: PanelKey[], key: PanelKey): PanelKey[] {
  return [...order.filter(k => k !== key), key];
}

export const usePanelWindowStore = create<PanelWindowState>((set) => ({
  open: { stats: false, equipment: false, bag: false, skill: false, quest: false },
  positions: { ...DEFAULT_POSITIONS },
  order: [...PANEL_KEYS],

  toggle: (key) => set(s => (
    s.open[key]
      ? { open: { ...s.open, [key]: false } }
      : { open: { ...s.open, [key]: true }, order: moveToTop(s.order, key) }
  )),

  openPanel: (key) => set(s => ({
    open: { ...s.open, [key]: true },
    order: moveToTop(s.order, key),
  })),

  closePanel: (key) => set(s => ({ open: { ...s.open, [key]: false } })),

  focusPanel: (key) => set(s => ({ order: moveToTop(s.order, key) })),

  setPosition: (key, pos) => set(s => ({ positions: { ...s.positions, [key]: pos } })),

  closeAll: () => set({ open: { stats: false, equipment: false, bag: false, skill: false, quest: false } }),
}));

/** 取得指定面板的 z-index（order 越後面越上層） */
export function getPanelZIndex(order: PanelKey[], key: PanelKey): number {
  const idx = order.indexOf(key);
  return PANEL_Z_BASE + (idx < 0 ? 0 : idx);
}

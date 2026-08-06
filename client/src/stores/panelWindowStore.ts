import { create } from 'zustand';

/**
 * 浮動面板視窗狀態（16-tech-frontend-architecture.md § 32.15）
 *
 * 六個面板（詳細狀態 / 裝備欄 / 背包 / 技能 / 任務 / 自動腳本）改為可拖曳浮動視窗：
 * 可同時開啟多個、無遮罩、點擊置頂。
 *
 * **位置持久化於 localStorage**（開關狀態與 z 順序仍只存在於當下 session）——
 * 排好的版面每次進遊戲都要重排一次是純粹的重工。存全域 key、與角色無關，
 * 因為那是「這台機器上的使用習慣」而不是角色資料。
 *
 * 存的同時記下**當時的視窗尺寸**：換到不同大小的視窗時按比例換算回來，
 * 否則在 1920 寬排好的版面到 1280 就整排擠在畫面外緣（夾制後全部黏在右邊）。
 */
export type PanelKey = 'stats' | 'equipment' | 'bag' | 'skill' | 'quest' | 'script';

export const PANEL_KEYS: readonly PanelKey[] = ['stats', 'equipment', 'bag', 'skill', 'quest', 'script'];

/**
 * PanelDock 以泛用按鈕渲染的面板。
 * `quest` 與 `script` 不在此列 —— 兩者的按鈕要顯示數量 badge，
 * 由 `QuestTrackerButton` / `ScriptEditorButton` 自行渲染。
 */
export const DOCK_PANEL_KEYS: readonly PanelKey[] = ['stats', 'equipment', 'bag', 'skill'];

export const PANEL_TITLES: Record<PanelKey, string> = {
  stats: '詳細狀態',
  equipment: '裝備欄',
  bag: '背包',
  skill: '技能',
  quest: '進行中的任務',
  script: '自動腳本',
};

export const PANEL_WIDTHS: Record<PanelKey, number> = {
  stats: 340,
  equipment: 360,
  bag: 420,
  skill: 420,
  quest: 320,
  script: 480,
};

/** 浮動視窗 z-index 基準：高於地圖 HUD，低於 modal overlay（.modal-overlay = 1000） */
export const PANEL_Z_BASE = 300;

export interface PanelPosition {
  x: number;
  y: number;
}

/** 首次開啟時的停靠位置，各面板錯開避免完全重疊 */
const DEFAULT_POSITIONS: Record<PanelKey, PanelPosition> = {
  stats: { x: 24, y: 120 },
  equipment: { x: 396, y: 120 },
  bag: { x: 780, y: 120 },
  skill: { x: 1224, y: 120 },
  // 任務預設落在 stage 右上角（小螢幕會被 FloatingWindow 夾回可視範圍）
  quest: { x: 1576, y: 128 },
  // 自動腳本較高（82vh），預設靠上避免下緣被夾動
  script: { x: 700, y: 72 },
};

/** 全部面板的統一開關狀態（新增 PanelKey 時不必逐處補值） */
function allClosed(): Record<PanelKey, boolean> {
  return Object.fromEntries(PANEL_KEYS.map(k => [k, false])) as Record<PanelKey, boolean>;
}

// ─── 位置持久化 ────────────────────────────────────────────────────────────

const POSITIONS_KEY = 'mayana_panel_positions';

/** 拖曳每個 pointermove 都會呼叫 setPosition，直接寫等於每秒同步寫 60 次 */
const WRITE_DEBOUNCE_MS = 300;

export interface Viewport {
  w: number;
  h: number;
}

interface StoredLayout {
  /** 存檔當下的視窗尺寸，用來換算相對位置 */
  viewport: Viewport;
  positions: Record<PanelKey, PanelPosition>;
}

export function getCurrentViewport(): Viewport | null {
  if (typeof window === 'undefined') return null;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h };
}

function isValidPosition(value: unknown): value is PanelPosition {
  if (!value || typeof value !== 'object') return false;
  const { x, y } = value as PanelPosition;
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0;
}

function isValidViewport(value: unknown): value is Viewport {
  if (!value || typeof value !== 'object') return false;
  const { w, h } = value as Viewport;
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
}

/**
 * 依視窗尺寸變化等比例換算座標。
 *
 * 只換算左上角，不管視窗自身尺寸 —— 超出邊界由 `FloatingWindow` 掛載時的
 * clamp 收尾。靠右擺放的面板縮小視窗後會被夾到右緣，正是預期的結果。
 */
export function scalePositions(
  positions: Record<PanelKey, PanelPosition>,
  from: Viewport,
  to: Viewport,
): Record<PanelKey, PanelPosition> {
  if (from.w === to.w && from.h === to.h) return positions;
  const rx = to.w / from.w;
  const ry = to.h / from.h;
  return Object.fromEntries(
    PANEL_KEYS.map(key => [key, {
      x: Math.round(positions[key].x * rx),
      y: Math.round(positions[key].y * ry),
    }]),
  ) as Record<PanelKey, PanelPosition>;
}

/**
 * 把存下來的版面還原成本次可用的座標。
 *
 * 任何一項壞掉就退回該面板的預設值，而不是整份丟掉 —— 新增 PanelKey 後
 * 舊存檔會缺那一格，那是正常升級路徑，不該讓玩家其他五個面板也一起重置。
 */
export function restoreLayout(raw: unknown, viewport: Viewport | null): Record<PanelKey, PanelPosition> {
  const result = { ...DEFAULT_POSITIONS };
  if (!raw || typeof raw !== 'object') return result;

  const stored = raw as Partial<StoredLayout>;
  const storedPositions = stored.positions;
  if (!storedPositions || typeof storedPositions !== 'object') return result;

  for (const key of PANEL_KEYS) {
    const pos = (storedPositions as Record<string, unknown>)[key];
    if (isValidPosition(pos)) result[key] = { x: pos.x, y: pos.y };
  }

  // 視窗尺寸沒存到（舊格式）或取不到目前尺寸時，維持絕對座標
  if (!isValidViewport(stored.viewport) || !viewport) return result;
  return scalePositions(result, stored.viewport, viewport);
}

function readStoredPositions(): Record<PanelKey, PanelPosition> {
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    if (!raw) return { ...DEFAULT_POSITIONS };
    return restoreLayout(JSON.parse(raw), getCurrentViewport());
  } catch {
    // 無痕模式、壞掉的 JSON：走預設值，不可讓開機流程中斷
    return { ...DEFAULT_POSITIONS };
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPositions: Record<PanelKey, PanelPosition> | null = null;

function persistNow(): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  const positions = pendingPositions;
  pendingPositions = null;
  if (!positions) return;

  const viewport = getCurrentViewport();
  if (!viewport) return;
  try {
    const payload: StoredLayout = { viewport, positions };
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(payload));
  } catch {
    // 存不進去就只在本次 session 生效
  }
}

function schedulePersist(positions: Record<PanelKey, PanelPosition>): void {
  pendingPositions = positions;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(persistNow, WRITE_DEBOUNCE_MS);
}

/** 立刻寫入待存的位置。分頁被關掉時 debounce 還沒到期的那筆不能掉。 */
export function flushPanelPositions(): void {
  persistNow();
}

if (typeof window !== 'undefined') {
  // pagehide 涵蓋關閉分頁與行動裝置切到背景，比 beforeunload 可靠
  window.addEventListener('pagehide', flushPanelPositions);
}

interface PanelWindowState {
  open: Record<PanelKey, boolean>;
  positions: Record<PanelKey, PanelPosition>;
  /** z 順序，陣列末端為最上層 */
  order: PanelKey[];
  /**
   * @param exclusive 開啟時同時關掉其他面板。手機的 sheet 是滿版的（§ 34.8），
   *   多開只會互相蓋住，關掉的那些玩家也看不到 —— 一次只留一個才對得上畫面。
   */
  toggle: (key: PanelKey, exclusive?: boolean) => void;
  openPanel: (key: PanelKey) => void;
  closePanel: (key: PanelKey) => void;
  focusPanel: (key: PanelKey) => void;
  setPosition: (key: PanelKey, pos: PanelPosition) => void;
  closeAll: () => void;
  /** 版面亂掉時的逃生門：回到各面板的預設停靠位置並清掉存檔 */
  resetPositions: () => void;
}

function moveToTop(order: PanelKey[], key: PanelKey): PanelKey[] {
  return [...order.filter(k => k !== key), key];
}

export const usePanelWindowStore = create<PanelWindowState>((set) => ({
  open: allClosed(),
  positions: readStoredPositions(),
  order: [...PANEL_KEYS],

  toggle: (key, exclusive = false) => set(s => (
    s.open[key]
      ? { open: { ...s.open, [key]: false } }
      : {
        open: { ...(exclusive ? allClosed() : s.open), [key]: true },
        order: moveToTop(s.order, key),
      }
  )),

  openPanel: (key) => set(s => ({
    open: { ...s.open, [key]: true },
    order: moveToTop(s.order, key),
  })),

  closePanel: (key) => set(s => ({ open: { ...s.open, [key]: false } })),

  focusPanel: (key) => set(s => ({ order: moveToTop(s.order, key) })),

  setPosition: (key, pos) => set(s => {
    const positions = { ...s.positions, [key]: pos };
    schedulePersist(positions);
    return { positions };
  }),

  closeAll: () => set({ open: allClosed() }),

  resetPositions: () => {
    pendingPositions = null;
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    try {
      localStorage.removeItem(POSITIONS_KEY);
    } catch {
      // 清不掉就只影響下次開啟，狀態本身已重設
    }
    set({ positions: { ...DEFAULT_POSITIONS } });
  },
}));

/** 取得指定面板的 z-index（order 越後面越上層） */
export function getPanelZIndex(order: PanelKey[], key: PanelKey): number {
  const idx = order.indexOf(key);
  return PANEL_Z_BASE + (idx < 0 ? 0 : idx);
}

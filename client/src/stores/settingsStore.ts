import { create } from 'zustand';

/**
 * 顯示設定（`34-ui-guidelines.md` § 34.6）
 *
 * 兩個預設互相獨立的倍率（勾選 `linkScales` 後才綁在一起同步變動）：
 * - `uiScale`：HUD／面板／視窗的整體大小（`zoom`）。**遊戲地圖不受影響** ——
 *   Pixi 畫面自己佔滿視窗，縮放它等於改變可視範圍，那是另一回事。
 * - `fontScale`：只影響文字（`--fs-*` token）。想要「介面小、字大」是常見需求，
 *   所以兩者不合併成同一條滑桿。
 *
 * 設定與角色無關，存在 localStorage 全域 key，換角色不必重設。
 */

export const SCALE_MIN = 0.8;
export const SCALE_MAX = 1.5;
export const SCALE_STEP = 0.05;
export const SCALE_DEFAULT = 1;

const UI_SCALE_KEY = 'mayana_ui_scale';
const FONT_SCALE_KEY = 'mayana_font_scale';
const LINK_SCALES_KEY = 'mayana_scale_linked';

/** 夾到 [0.8, 1.5] 並對齊 5% 級距；非數值一律回預設 */
export function normalizeScale(value: unknown): number {
  // `Number(null)` 與 `Number('')` 都是 0，會被夾成 80%：必須先擋掉再夾制
  if (value == null || value === '') return SCALE_DEFAULT;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return SCALE_DEFAULT;
  const clamped = Math.min(Math.max(num, SCALE_MIN), SCALE_MAX);
  const snapped = Math.round(clamped / SCALE_STEP) * SCALE_STEP;
  // 0.05 的浮點誤差會讓 1.15 存成 1.1500000000000001，顯示與比對都難看
  return Math.round(snapped * 100) / 100;
}

function readStored(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return SCALE_DEFAULT;
    return normalizeScale(raw);
  } catch {
    // 無痕模式等取不到 localStorage 時走預設，不可讓開機流程中斷
    return SCALE_DEFAULT;
  }
}

function writeStored(key: string, value: number | boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // 存不進去就只在本次 session 生效
  }
}

function readStoredFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

/** 把倍率寫進 CSS 變數 —— 所有樣式都讀這兩個變數，元件不必各自套 style */
export function applyDisplaySettings(uiScale: number, fontScale: number): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(uiScale));
  root.style.setProperty('--font-scale', String(fontScale));
}

interface SettingsState {
  uiScale: number;
  fontScale: number;
  /** 連動模式：介面與文字同一個倍率一起變（見 `34-ui-guidelines.md` § 34.6） */
  linkScales: boolean;
  setUiScale: (value: number) => void;
  setFontScale: (value: number) => void;
  setLinkScales: (linked: boolean) => void;
  resetDisplaySettings: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  uiScale: readStored(UI_SCALE_KEY),
  fontScale: readStored(FONT_SCALE_KEY),
  linkScales: readStoredFlag(LINK_SCALES_KEY),

  setUiScale(value) {
    const uiScale = normalizeScale(value);
    // 連動時文字跟著同一個倍率；此時兩條滑桿等同同一條
    const fontScale = get().linkScales ? uiScale : get().fontScale;
    if (uiScale === get().uiScale && fontScale === get().fontScale) return;
    set({ uiScale, fontScale });
    writeStored(UI_SCALE_KEY, uiScale);
    writeStored(FONT_SCALE_KEY, fontScale);
    applyDisplaySettings(uiScale, fontScale);
  },

  setFontScale(value) {
    const fontScale = normalizeScale(value);
    const uiScale = get().linkScales ? fontScale : get().uiScale;
    if (fontScale === get().fontScale && uiScale === get().uiScale) return;
    set({ uiScale, fontScale });
    writeStored(UI_SCALE_KEY, uiScale);
    writeStored(FONT_SCALE_KEY, fontScale);
    applyDisplaySettings(uiScale, fontScale);
  },

  setLinkScales(linked) {
    // 打開連動時以「介面大小」為準把文字拉齊
    const fontScale = linked ? get().uiScale : get().fontScale;
    set({ linkScales: linked, fontScale });
    writeStored(LINK_SCALES_KEY, linked);
    writeStored(FONT_SCALE_KEY, fontScale);
    applyDisplaySettings(get().uiScale, fontScale);
  },

  resetDisplaySettings() {
    set({ uiScale: SCALE_DEFAULT, fontScale: SCALE_DEFAULT });
    writeStored(UI_SCALE_KEY, SCALE_DEFAULT);
    writeStored(FONT_SCALE_KEY, SCALE_DEFAULT);
    applyDisplaySettings(SCALE_DEFAULT, SCALE_DEFAULT);
  },
}));

/** 開機時套用已存的設定（`main.tsx` 呼叫一次） */
export function initDisplaySettings(): void {
  const { uiScale, fontScale } = useSettingsStore.getState();
  applyDisplaySettings(uiScale, fontScale);
}

/**
 * 元素實際的縮放比（`zoom` 生效後 `getBoundingClientRect` 與版面座標的比值）。
 *
 * 拖曳事件的 `clientX/Y` 是視窗座標（已含縮放），`left/top` 寫的是版面座標，
 * 兩者在縮放後不同單位，必須除以這個比值。
 */
export function getElementScale(el: HTMLElement | null): number {
  if (!el) return 1;
  const layoutWidth = el.offsetWidth;
  if (!layoutWidth) return 1;
  const rendered = el.getBoundingClientRect().width;
  if (!rendered) return 1;
  const scale = rendered / layoutWidth;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

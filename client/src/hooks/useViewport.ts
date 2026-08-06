import { useSyncExternalStore } from 'react';

/**
 * 視窗尺寸與輸入方式的**唯一真相來源**（`16-tech-frontend-architecture.md` § 32.17）。
 *
 * 行動裝置支援走「響應式單一版面」：同一組元件用斷點切換行為，不另開一套手機版元件。
 * 因此「現在算不算手機」必須只有一個答案 —— 元件各自寫 `window.innerWidth < 768`
 * 或自己開 `matchMedia`，遲早會出現「CSS 認為是手機、JS 認為不是」的半套版面
 * （浮動視窗以為自己是 sheet、CSS 卻還在畫拖曳標題列）。
 *
 * 斷點與 `App.css` 的 `--bp-mobile` 是同一個數字，改一邊要改兩邊。
 */

/** 手機斷點：< 768px 視為手機版面（與 `App.css` 的 `--bp-mobile` 同步） */
export const MOBILE_BREAKPOINT = 768;

export interface Viewport {
  /** 視窗寬度 < 768px。決定版面走手機排版（sheet／tab bar） */
  isMobile: boolean;
  /** 主要輸入裝置沒有 hover 能力。決定互動走觸控替代（長按／tap tooltip） */
  isTouch: boolean;
  /** 直向或橫向 */
  orientation: 'portrait' | 'landscape';
}

/*
 * `isMobile` 與 `isTouch` 是**兩件事**，不可合併：
 * - 觸控筆電是 `isTouch` 但不是 `isMobile`（要 tap tooltip，但版面照桌機走）
 * - 桌機把視窗拉窄是 `isMobile` 但不是 `isTouch`（要 sheet 版面，但 hover 仍可用）
 */
const QUERIES = {
  mobile: `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
  /* `hover: none` 才是「這台機器沒有滑鼠」的正解。用 `'ontouchstart' in window`
     會把有觸控螢幕的桌機一起判成手機，害它失去 hover tooltip。 */
  touch: '(hover: none)',
  portrait: '(orientation: portrait)',
} as const;

/** SSR／jsdom 沒有 matchMedia 時的預設值：一律當桌機，避免測試環境誤入手機分支 */
const DESKTOP: Viewport = { isMobile: false, isTouch: false, orientation: 'landscape' };

function query(q: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(q).matches;
}

/*
 * `useSyncExternalStore` 的 getSnapshot 必須回傳**同一個參照**，否則每次 render
 * 都會被判定為「外部狀態變了」而無限重繪。快照只在媒體查詢真的翻面時才換新物件。
 */
let snapshot: Viewport = DESKTOP;

function computeSnapshot(): Viewport {
  const next: Viewport = {
    isMobile: query(QUERIES.mobile),
    isTouch: query(QUERIES.touch),
    orientation: query(QUERIES.portrait) ? 'portrait' : 'landscape',
  };
  if (
    next.isMobile === snapshot.isMobile &&
    next.isTouch === snapshot.isTouch &&
    next.orientation === snapshot.orientation
  ) {
    return snapshot;
  }
  snapshot = next;
  return snapshot;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};

  const lists = Object.values(QUERIES).map(q => window.matchMedia(q));
  // Safari < 14 只有 addListener；漏掉它等於在舊 iPhone 上轉螢幕不重排
  for (const list of lists) {
    if (list.addEventListener) list.addEventListener('change', onChange);
    else list.addListener?.(onChange);
  }
  return () => {
    for (const list of lists) {
      if (list.removeEventListener) list.removeEventListener('change', onChange);
      else list.removeListener?.(onChange);
    }
  };
}

/** 訂閱視窗尺寸／輸入方式。任何元件要判斷「是不是手機」一律走這裡 */
export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, computeSnapshot, () => DESKTOP);
}

/** 只要 `isMobile` 的簡寫（多數呼叫端只關心版面走哪一套） */
export function useIsMobile(): boolean {
  return useViewport().isMobile;
}

/**
 * 非 hook 版本，給 effect 裡的一次性量測用（例如 `useHudBand`）。
 *
 * 斷點仍然只有這一個出處 —— 呼叫端不可自己拼 media query 字串。
 */
export function isMobileViewport(): boolean {
  return query(QUERIES.mobile);
}

/**
 * 這台機器是不是**手持裝置**（沒有滑鼠）。
 *
 * 與 `isMobileViewport()` 的差別是「裝置」而不是「版面」：手機轉成橫向會跨過
 * 寬度斷點，但它還是同一台會發熱、靠電池的機器。渲染上限（`47-mobile.md` § 47.8）
 * 該看這個，不是看寬度。
 */
export function isHandheldDevice(): boolean {
  return query(QUERIES.touch);
}

/** 測試用：清掉快取的快照，讓下一次 render 重新讀 matchMedia */
export function resetViewportSnapshot(): void {
  snapshot = DESKTOP;
}

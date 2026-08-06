import { MOBILE_BREAKPOINT, resetViewportSnapshot } from '../hooks/useViewport';

/**
 * jsdom 沒有 `matchMedia`，而行動版版面全靠它分流（`hooks/useViewport.ts`）。
 * 這裡提供一個「假裝視窗是某個尺寸」的替身，讓版面測試不必真的改視窗大小。
 *
 * 只實作 `max-width` / `hover` / `orientation` 三種查詢 —— 這三種就是
 * `useViewport` 用到的全部；再多解析 CSS 媒體查詢語法是替身不該有的複雜度。
 */

export interface FakeViewportOptions {
  width: number;
  height?: number;
  /** 主要輸入裝置有沒有 hover 能力（預設依寬度推斷：手機沒有） */
  hover?: boolean;
}

interface FakeMediaQueryList {
  matches: boolean;
  media: string;
  listeners: Set<() => void>;
}

let lists: FakeMediaQueryList[] = [];
let current: Required<FakeViewportOptions> = { width: 1920, height: 1080, hover: true };

function evaluate(media: string): boolean {
  const maxWidth = /\(max-width:\s*(\d+)px\)/.exec(media);
  if (maxWidth) return current.width <= Number(maxWidth[1]);
  if (media.includes('hover: none')) return !current.hover;
  if (media.includes('orientation: portrait')) return current.height > current.width;
  return false;
}

/** 安裝替身。回傳的函式可用來改變尺寸並通知訂閱者（模擬轉螢幕／改視窗大小） */
export function installFakeViewport(options: FakeViewportOptions): (next: FakeViewportOptions) => void {
  applyOptions(options);
  lists = [];
  resetViewportSnapshot();

  window.matchMedia = ((media: string) => {
    const list: FakeMediaQueryList = { matches: evaluate(media), media, listeners: new Set() };
    lists.push(list);
    return {
      get matches() { return list.matches; },
      media,
      addEventListener: (_: string, fn: () => void) => list.listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => list.listeners.delete(fn),
      // 舊 Safari 路徑也要留著：useViewport 會在缺 addEventListener 時退回這兩個
      addListener: (fn: () => void) => list.listeners.add(fn),
      removeListener: (fn: () => void) => list.listeners.delete(fn),
      onchange: null,
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;

  return (next: FakeViewportOptions) => {
    applyOptions(next);
    for (const list of lists) {
      list.matches = evaluate(list.media);
      for (const fn of list.listeners) fn();
    }
  };
}

function applyOptions(options: FakeViewportOptions): void {
  const width = options.width;
  const height = options.height ?? (width < MOBILE_BREAKPOINT ? 844 : 1080);
  current = { width, height, hover: options.hover ?? width >= MOBILE_BREAKPOINT };
}

/** 還原 `matchMedia`，避免測試之間互相污染 */
export function uninstallFakeViewport(): void {
  lists = [];
  resetViewportSnapshot();
  // @ts-expect-error jsdom 本來就沒有這個屬性，刪回未定義才算真的還原
  delete window.matchMedia;
}

/** 常用尺寸捷徑 */
export const VIEWPORTS = {
  /** iPhone 15 直向 */
  phonePortrait: { width: 393, height: 852 } satisfies FakeViewportOptions,
  /** iPhone 15 橫向 */
  phoneLandscape: { width: 852, height: 393, hover: false } satisfies FakeViewportOptions,
  desktop: { width: 1920, height: 1080 } satisfies FakeViewportOptions,
} as const;

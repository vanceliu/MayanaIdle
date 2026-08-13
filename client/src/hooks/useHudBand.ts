import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { isMobileViewport } from './useViewport';

/**
 * 底部常駐 HUD 帶的量測（`16-tech-frontend-architecture.md` § 32.15.1）。
 *
 * 快捷格與面板按鈕列是 z-index 800，**永遠壓在視窗之上**；城鎮設施視窗的
 * 底部動作列必須整條停在這條帶子上面。
 * **帶寬不可寫死**（快捷格會隨視窗寬度換行、整條 HUD 又吃 `--ui-scale`）：
 * 量到的值寫進 `--hud-band-bottom`，由 `.town-modal-overlay` 的 padding 讀。
 */

/** 底部 HUD 島（順序無意義，只是要一起量） */
const BOTTOM_ISLANDS = ['.hud-bottomcenter', '.hud-bottomright'];

/** 手機的上下 HUD 帶容器（桌機是 `display: contents`，量不到盒子） */
const BOTTOM_BAR = '.hud-bottombar';
const TOP_BAR = '.hud-topbar';

/**
 * 從島內元素的位置算出帶寬。
 *
 * 量的是**島內元素**而不是島本身：島是透明容器，且城鎮的 ExploreBar 佔位格是
 * `visibility: hidden`（保留高度讓快捷格不位移，§ 32.3），它不收滑鼠事件，
 * 也就不該把帶寬撐高。
 */
export function hudBandBottom(tops: number[], viewportHeight: number): number {
  if (tops.length === 0) return 0;
  return Math.max(0, Math.ceil(viewportHeight - Math.min(...tops)));
}

/**
 * 手機把兩座島收進 `.hud-bottombar`，而那條帶子是**實心的**（有底色與上緣線，
 * `47-mobile.md`）—— 整條都會擋住底下的東西，量島內元素會少算：
 * 城鎮那格 `visibility: hidden` 的 ExploreBar 佔位在帶子裡照樣佔高度，
 * 少算的那 60 幾 px 就是地圖與日誌被帶子壓掉的部分。
 *
 * 桌機的帶子是 `display: contents`（沒有盒子），回 null 交還給逐元素量測。
 */
function solidBandTop(): number | null {
  /*
   * **只有手機**走整條帶子的量測。桌機的帶子雖然也成形（要讓快捷格與面板列
   * 排在同一列而不互相重疊），但它是透明的，而且城鎮那格 `visibility: hidden`
   * 的 ExploreBar 佔位會把盒子撐高 60 幾 px —— 那段不擋任何東西，
   * 算進帶寬會讓設施視窗白白往下讓位。
   */
  if (!isMobileViewport()) return null;
  return barBox(BOTTOM_BAR)?.top ?? null;
}

/** 帶子成形時的盒子；桌機的 `display: contents` 沒有盒子，回 null */
function barBox(selector: string): DOMRect | null {
  const bar = document.querySelector(selector);
  if (!bar) return null;
  if (getComputedStyle(bar).display === 'contents') return null;
  const box = bar.getBoundingClientRect();
  return box.height > 0 ? box : null;
}

/**
 * 上方 HUD 帶的下緣（手機才有，`47-mobile.md`）。
 *
 * 城鎮設施列是全寬的，要停在**整條帶**下面 —— 不讓位就整條蓋在狀態卡上面。
 * 高度隨 buff 數量與字級變動，一樣不可寫死。
 */
export function hudBandTop(): number {
  const box = barBox(TOP_BAR);
  return box ? Math.max(0, Math.ceil(box.bottom)) : 0;
}

/**
 * **角色卡**的下緣。怪物卡錨在這裡 —— 那就是「放在使用者的下方」
 * （`24-buff-debuff.md` § 24.8.3）。
 *
 * 不用整條帶的下緣：左欄的 buff 往下疊多長都會把卡片一路推走。
 * 也不用右欄（地圖選擇器）：那太上面，卡片會跟選擇器擠在一起。
 * 角色卡的高度是固定的，是這兩者之間唯一穩定的參考線。
 */
export function hudCardBottom(): number {
  return islandChildBottom('.status-panel');
}

/**
 * 戰鬥日誌抽屜的高度（手機才有）。
 *
 * 抽屜貼在下方 HUD 帶上、蓋在地圖上（刻意的設計）。城鎮設施列是靠右的直排，
 * 不知道這個高度就會有最後幾顆圖示躲在日誌底下 —— 看得到卻點不到。
 * 高度會隨 `▲` 的三段大小變動，一樣不可寫死。
 */
export function hudLogHeight(): number {
  if (!barBox(BOTTOM_BAR)) return 0;
  const el = document.querySelector('.combat-log-window');
  if (!el) return 0;
  const box = el.getBoundingClientRect();
  return box.height > 0 ? Math.max(0, Math.ceil(box.height)) : 0;
}

/** 帶子成形（手機）時，指定元素的下緣；桌機回 0 */
function islandChildBottom(selector: string): number {
  const el = document.querySelector(selector);
  if (!el || !barBox(TOP_BAR)) return 0;
  const box = el.getBoundingClientRect();
  return box.height > 0 ? Math.max(0, Math.ceil(box.bottom)) : 0;
}

/** 島內「真的會擋住點擊」的元素上緣 */
function visibleChildTops(): number[] {
  const solid = solidBandTop();
  if (solid != null) return [solid];

  const tops: number[] = [];
  for (const selector of BOTTOM_ISLANDS) {
    const island = document.querySelector(selector);
    if (!island) continue;
    for (const child of Array.from(island.children)) {
      if (getComputedStyle(child).visibility === 'hidden') continue;
      tops.push(child.getBoundingClientRect().top);
    }
  }
  return tops;
}

export function useHudBandBottom(): void {
  /*
   * `zoom` 改變**不會**觸發 ResizeObserver —— 版面盒沒變，只有算繪結果被乘上倍率，
   * 所以介面大小必須另外訂閱，靠 effect 重跑來重量。
   */
  const uiScale = useSettingsStore(s => s.uiScale);

  useEffect(() => {
    const measure = () => {
      const band = hudBandBottom(visibleChildTops(), window.innerHeight);
      if (band > 0) {
        document.documentElement.style.setProperty('--hud-band-bottom', `${band}px`);
      }
      // 上方帶只有手機才成形；桌機量到 0 就寫 0，讓城鎮設施列回到原本的貼頂位置
      document.documentElement.style.setProperty('--hud-band-top', `${hudBandTop()}px`);
      document.documentElement.style.setProperty('--hud-card-bottom', `${hudCardBottom()}px`);
      document.documentElement.style.setProperty('--hud-log-height', `${hudLogHeight()}px`);
    };

    measure();

    // 換行、快捷格增減都會改變帶寬，一律靠觀察器重量（jsdom 沒有 ResizeObserver，
    // 少了它只是不會即時重量，開機那次仍然算得出來，不該讓整個版面掛掉）
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    for (const selector of [...BOTTOM_ISLANDS, BOTTOM_BAR, TOP_BAR, '.combat-log-window']) {
      const island = document.querySelector(selector);
      if (island) observer?.observe(island);
    }
    window.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [uiScale]);
}

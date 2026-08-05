import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

/**
 * 底部常駐 HUD 帶的量測（`16-tech-frontend-architecture.md` § 32.15.1）。
 *
 * 快捷格與面板按鈕列是 z-index 800，**永遠壓在視窗之上**，所以城鎮設施視窗的
 * 底部動作列必須整條停在這條帶子上面 —— 否則按鈕看得到卻點不到。
 * 帶寬不能寫死：快捷格會隨視窗寬度換行、整條 HUD 又吃 `--ui-scale`，
 * 量到的值寫進 `--hud-band-bottom`，由 `.town-modal-overlay` 的 padding 讀。
 */

/** 底部 HUD 島（順序無意義，只是要一起量） */
const BOTTOM_ISLANDS = ['.hud-bottomcenter', '.hud-bottomright'];

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

/** 島內「真的會擋住點擊」的元素上緣 */
function visibleChildTops(): number[] {
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
    };

    measure();

    // 換行、快捷格增減都會改變帶寬，一律靠觀察器重量（jsdom 沒有 ResizeObserver，
    // 少了它只是不會即時重量，開機那次仍然算得出來，不該讓整個版面掛掉）
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    for (const selector of BOTTOM_ISLANDS) {
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

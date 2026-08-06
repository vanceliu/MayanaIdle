// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hudBandBottom, hudBandTop } from '../../hooks/useHudBand';

/**
 * 常駐 HUD 蓋住視窗按鈕的回歸測試（`16-tech-frontend-architecture.md` § 32.15.1）。
 *
 * 起因：`.hud-bottomcenter` 是透明容器，右緣剛好切在商店購買鈕中間，
 * 導致按鈕只有右側十幾 px 點得動。jsdom 沒有版面，因此幾何只測純函式，
 * 兩條 CSS 規則改用原始碼斷言把守。
 */

const APP_CSS = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf-8');

describe('hudBandBottom', () => {
  it('取最上緣的島內元素算帶寬', () => {
    // 面板按鈕列 623、快捷格 647 → 以 623 為準
    expect(hudBandBottom([623, 647], 775)).toBe(152);
  });

  it('量不到任何元素時回 0，讓 CSS 走 fallback', () => {
    expect(hudBandBottom([], 775)).toBe(0);
  });

  it('島掉出畫面外時不給負值', () => {
    expect(hudBandBottom([900], 775)).toBe(0);
  });

  it('無條件進位，不會因為小數少留一格', () => {
    expect(hudBandBottom([622.4], 775)).toBe(153);
  });
});

describe('CSS 規則', () => {
  it('四個 HUD 島本身不吃滑鼠事件', () => {
    const block = APP_CSS.match(
      /\.hud-topleft,\s*\n\.hud-topright,\s*\n\.hud-bottomcenter,\s*\n\.hud-bottomright\s*\{([^}]*)\}/
    );
    expect(block?.[1]).toContain('pointer-events: none');
  });

  it('島內容仍要收滑鼠事件', () => {
    const block = APP_CSS.match(
      /\.hud-topleft > \*,\s*\n\.hud-topright > \*,\s*\n\.hud-bottomcenter > \*,\s*\n\.hud-bottomright > \*\s*\{([^}]*)\}/
    );
    expect(block?.[1]).toContain('pointer-events: auto');
  });

  it('設施視窗的底部保留區讀量測值，不是寫死的數字', () => {
    const block = APP_CSS.match(/\.town-modal-overlay\s*\{([^}]*)\}/);
    expect(block?.[1]).toMatch(/padding:[^;]*var\(--hud-band-bottom/);
  });
});

/**
 * 行動版的 HUD 帶（`34-ui-guidelines.md` § 34.8）。
 *
 * 手機把兩座島收進 `.hud-bottombar`，而那條帶子是**實心**的 ——
 * 逐元素量測會漏掉城鎮那格 `visibility: hidden` 的 ExploreBar 佔位，
 * 少算的那 60 幾 px 正是地圖與戰鬥日誌被帶子壓掉的部分。
 */
describe('行動版 HUD 帶量測（§ 34.8）', () => {
  function mountBars(display: 'contents' | 'flex') {
    document.body.innerHTML = `
      <div class="hud-topbar" style="display:${display}"></div>
      <div class="hud-bottombar" style="display:${display}"></div>
    `;
    const top = document.querySelector('.hud-topbar') as HTMLElement;
    const bottom = document.querySelector('.hud-bottombar') as HTMLElement;
    // jsdom 沒有版面，尺寸只能自己給
    top.getBoundingClientRect = () => ({ top: 0, bottom: 190, height: 190 }) as DOMRect;
    bottom.getBoundingClientRect = () => ({ top: 640, bottom: 852, height: 212 }) as DOMRect;
    return { top, bottom };
  }

  afterEach(() => { document.body.innerHTML = ''; });

  it('帶子成形時（手機）以整條帶子的高度為準', () => {
    mountBars('flex');
    expect(hudBandTop()).toBe(190);
  });

  it('帶子是 display: contents 時（桌機）回 0，不干擾原本的逐元素量測', () => {
    mountBars('contents');
    expect(hudBandTop()).toBe(0);
  });

  it('沒有帶子（舊版面／測試替身）也不可拋錯', () => {
    document.body.innerHTML = '';
    expect(hudBandTop()).toBe(0);
  });

  it('城鎮設施列讀量測值定位，不是寫死的數字', () => {
    const block = APP_CSS.match(/@media \(max-width: 767px\)[\s\S]*?\.town-view\s*\{([^}]*)\}/);
    expect(block?.[1]).toMatch(/top:[^;]*var\(--hud-band-top/);
  });

  it('sheet 與抽屜的尺寸走 --vh-unit / --vw-unit，不可直接寫 vh / vw', () => {
    // 這一層吃 `zoom: var(--ui-scale)`，裸 vh 會被乘上倍率而爆出畫面（§ 34.6）
    const mobile = APP_CSS.slice(APP_CSS.indexOf('@media (max-width: 767px)'));
    for (const selector of ['.floating-window.is-sheet', '.combat-log-window.is-drawer']) {
      const block = mobile.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
      expect(block?.[1], selector).not.toMatch(/:\s*[^;]*\d+v[hw]\b/);
    }
  });
});

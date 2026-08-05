// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hudBandBottom } from '../../hooks/useHudBand';

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

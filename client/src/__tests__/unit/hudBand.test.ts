// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hudBandBottom, hudBandTop, hudCardBottom, hudLogHeight } from '../../hooks/useHudBand';

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
 * 行動版的 HUD 帶（`47-mobile.md`）。
 *
 * 手機把兩座島收進 `.hud-bottombar`，而那條帶子是**實心**的 ——
 * 逐元素量測會漏掉城鎮那格 `visibility: hidden` 的 ExploreBar 佔位，
 * 少算的那 60 幾 px 正是地圖與戰鬥日誌被帶子壓掉的部分。
 */
describe('行動版 HUD 帶量測（47-mobile）', () => {
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

  /**
   * 怪物卡與城鎮設施列都錨在**角色卡下緣**（＝「放在使用者的下方」）。
   * 用整條帶的下緣會被左欄的 buff 一路往下推；用右欄（地圖選擇器）又太上面。
   * 角色卡的高度固定，是這兩者之間唯一穩定的參考線。
   */
  it('角色卡下緣獨立量測，不受 buff 把整條帶撐高影響', () => {
    mountBars('flex');
    const card = document.createElement('div');
    card.className = 'status-panel';
    card.getBoundingClientRect = () => ({ top: 6, bottom: 154, height: 148 }) as DOMRect;
    document.querySelector('.hud-topbar')!.appendChild(card);

    expect(hudCardBottom()).toBe(154);
    // 整條帶（含左欄一路往下疊的 buff）是 190，角色卡只到 154
    expect(hudBandTop()).toBe(190);
  });

  /**
   * 日誌抽屜蓋在地圖上（刻意的設計）。城鎮設施列是靠右的直排，
   * 不知道抽屜多高就會有最後幾顆圖示躲在它底下 —— 看得到卻點不到。
   */
  it('量得到戰鬥日誌抽屜的高度', () => {
    mountBars('flex');
    const log = document.createElement('div');
    log.className = 'combat-log-window';
    log.getBoundingClientRect = () => ({ top: 613, bottom: 738, height: 125 }) as DOMRect;
    document.body.appendChild(log);

    expect(hudLogHeight()).toBe(125);
  });

  it('桌機（帶子是 display: contents）時這些量測一律回 0', () => {
    mountBars('contents');
    expect(hudCardBottom()).toBe(0);
    expect(hudLogHeight()).toBe(0);
  });

  /**
   * 城鎮設施列的上下界都讀量測值，不可寫死：
   * 上緣是角色卡下緣，下緣要停在日誌抽屜之上（抽屜蓋在地圖上，
   * 只算到 HUD 帶會有最後幾顆圖示躲在日誌底下，看得到卻點不到）。
   *
   * `.town-view` 是 `.game-layout` 的子節點，定位基準是整個視窗 ——
   * HUD 帶與日誌兩段都要自己扣。
   */
  it('城鎮設施列的上下界都讀量測值，不是寫死的數字', () => {
    const block = APP_CSS.match(/@media \(max-width: 767px\)[\s\S]*?\.town-view\s*\{([^}]*)\}/);
    expect(block?.[1]).toMatch(/top:[^;]*var\(--hud-card-bottom/);
    expect(block?.[1]).toMatch(/bottom:[^;]*var\(--hud-band-bottom/);
    expect(block?.[1]).toMatch(/bottom:[^;]*var\(--hud-log-height/);
  });

  /** 十一個設施橫排在 393px 寬要捲兩三次，直排靠右只佔一條窄帶 */
  it('城鎮設施列在手機是靠右的圖示直排，且可捲動', () => {
    const mobile = APP_CSS.slice(APP_CSS.indexOf('@media (max-width: 767px)'));
    const bar = mobile.match(/\n {2}\.town-npc-bar\s*\{([^}]*)\}/);
    expect(bar?.[1]).toContain('flex-direction: column');
    // 超過畫面高度時要捲得動 —— 容器本身得收事件
    expect(bar?.[1]).toContain('overflow-y: auto');
    expect(bar?.[1]).toContain('pointer-events: auto');
    // 只留圖示，名稱由 title／aria-label 承載
    expect(mobile).toMatch(/\.town-npc-bar \.npc-label\s*\{[^}]*display:\s*none/);
  });

  /**
   * 桌機的觸發鈕與選單同寬，選單去掉上邊框與鈕接成一體（§ 32.3）。
   * 手機的鈕只剩半寬、選單要滿版才讀得下區域名 —— 接縫只會有一半對得上，
   * 改成四邊完整的獨立卡片。
   */
  it('行動版地圖下拉選單是四邊完整的獨立卡片', () => {
    const mobile = APP_CSS.slice(APP_CSS.indexOf('@media (max-width: 767px)'));
    const block = mobile.match(/\.hud-topbar \.map-selector-dropdown\s*\{([^}]*)\}/);
    expect(block?.[1]).toMatch(/border-top:\s*1px/);
    expect(block?.[1]).toMatch(/border-radius:/);
    expect(block?.[1]).toMatch(/top:\s*calc\(100%/);
  });

  /**
   * 地圖選擇器在 DOM 上是右上島，照順序會落在狀態卡與 BuffBar 之後 ——
   * buff 一多就被往下推、夾在一堆圖示中間，看起來像是掛在 buff 上。
   * 它是「目前在哪張地圖」的位置資訊，該在最上面。
   */
  it('行動版上方帶是左右兩欄：狀態卡在左、地圖選擇器在右', () => {
    const mobile = APP_CSS.slice(APP_CSS.indexOf('@media (max-width: 767px)'));
    const bar = mobile.match(/\n {2}\.hud-topbar\s*\{([^}]*)\}/);
    expect(bar?.[1]).toContain('flex-direction: row');
    // 右欄要貼齊上緣，不被左欄的高度撐開
    expect(bar?.[1]).toContain('align-items: flex-start');

    const cols = mobile.match(/\.hud-topbar > \.hud-topleft,\s*\n\s*\.hud-topbar > \.hud-topright\s*\{([^}]*)\}/);
    expect(cols?.[1]).toContain('flex: 1 1 50%');
  });

  /**
   * 橫排會沿著角色卡的寬度往右伸，效果一多就整片橫在畫面上方、吃掉地圖上緣。
   * 手機更明顯：狀態卡只剩半個螢幕寬，第五顆就伸進右半邊壓住地圖選擇器與怪物卡。
   * **桌機與手機一致**，規則寫在基底。
   */
  it('buff 往下疊，不往右長（桌機與手機一致）', () => {
    const base = APP_CSS.slice(0, APP_CSS.indexOf('@media (max-width: 1200px)'));
    const block = base.match(/\n\.buff-row\s*\{([^}]*)\}/);
    expect(block?.[1]).toContain('flex-direction: column');
    expect(block?.[1]).toContain('flex-wrap: nowrap');
  });

  /**
   * § 32.3 要求下拉選單與觸發鈕同寬。
   * 手機為例外：觸發鈕只剩半寬，選單靠 `right: 0` 往左長到滿版。
   */
  it('行動版地圖下拉選單往左展開到滿版，且不可頂出畫面', () => {
    const mobile = APP_CSS.slice(APP_CSS.indexOf('@media (max-width: 767px)'));
    const block = mobile.match(/\.hud-topbar \.map-selector-dropdown\s*\{([^}]*)\}/);
    expect(block?.[1]).toContain('right: 0');
    expect(block?.[1]).toContain('left: auto');
  });

  /**
   * 怪物卡在手機改成「狀態卡下方、靠右的直向列」（`24-buff-debuff.md` § 24.8.3）。
   * 原本是地圖上方置中，正好被上方 HUD 帶蓋住；就算讓開，168px 的卡在 393px 寬
   * 只排得下兩張，十隻怪就是五列、蓋掉半個地圖。
   */
  it('行動版怪物卡靠右直排，錨在角色卡下緣', () => {
    const mobile = APP_CSS.slice(APP_CSS.indexOf('@media (max-width: 767px)'));
    const block = mobile.match(/\.monster-list-overlay\s*\{([^}]*)\}/);
    expect(block?.[1]).toMatch(/top:[^;]*var\(--hud-card-bottom/);
    expect(block?.[1]).toContain('flex-direction: column');
    // 排不下時往左長出第二欄，而不是溢出到日誌底下 —— 所有怪都要看得到
    expect(block?.[1]).toContain('align-content: flex-end');
    expect(block?.[1]).toContain('flex-wrap: wrap');
  });

  /** 抽屜是滿版的，內容盒若沿用桌機的固定寬就會在右邊露出一條沒對齊的縫 */
  it('日誌抽屜的內容盒與抽屜同寬', () => {
    const mobile = APP_CSS.slice(APP_CSS.indexOf('@media (max-width: 767px)'));
    const block = mobile.match(/\.combat-log-window\.is-drawer \.bottom-log-wrap\s*\{([^}]*)\}/);
    expect(block?.[1]).toContain('width: 100%');
    expect(block?.[1]).toContain('max-width: none');
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

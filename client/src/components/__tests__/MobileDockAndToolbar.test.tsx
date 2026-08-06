import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PanelDock } from '../PanelDock';
import { GameToolbar } from '../GameToolbar';
import { usePanelWindowStore, PANEL_KEYS, PANEL_ICONS, PANEL_BUTTON_LABELS } from '../../stores/panelWindowStore';
import { installFakeViewport, uninstallFakeViewport, VIEWPORTS } from '../../testing/viewport';

/**
 * @vitest-environment jsdom
 */

/*
 * 這兩顆按鈕的內容由 `PanelDock` 匯出的 `PanelDockFace` 產生，
 * 但 mock 工廠**不可以**回頭 `import('../PanelDock')` —— PanelDock 也匯入這兩個模組，
 * 循環等待會讓整個測試檔卡住不結束。改用等價的靜態替身。
 */
vi.mock('../ScriptEditorPanel', () => ({
  // `vi.mock` 會被提升到檔案最上面，工廠裡不可以引用外層變數
  ScriptEditorButton: () => (
    <button className="panel-dock-btn" title="自動腳本" aria-label="自動腳本">
      <span className="panel-dock-icon" aria-hidden="true">📜</span>
      <span className="panel-dock-label">自動腳本</span>
    </button>
  ),
}));
vi.mock('../QuestTracker', () => ({
  QuestTrackerButton: () => (
    <button className="panel-dock-btn" title="任務" aria-label="任務">
      <span className="panel-dock-icon" aria-hidden="true">📋</span>
      <span className="panel-dock-label">任務</span>
    </button>
  ),
}));

const APP_CSS = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf-8');

/**
 * `47-mobile.md`：手機的面板按鈕只畫圖示（六顆帶文字在 393px 寬會擠成兩列），
 * 名字改由 tooltip 與可及名稱承載。
 */
describe('面板按鈕圖示模式（47-mobile）', () => {
  beforeEach(() => usePanelWindowStore.getState().closeAll());
  afterEach(() => uninstallFakeViewport());

  it('每個面板都有圖示與短標籤，且一一對應', () => {
    for (const key of PANEL_KEYS) {
      expect(PANEL_ICONS[key], key).toBeTruthy();
      expect(PANEL_BUTTON_LABELS[key], key).toBeTruthy();
    }
  });

  /**
   * 只剩圖示時，兩顆長一樣就等於兩顆都沒有名字。
   * 城鎮設施列也在同一個畫面上（靠右直排，`47-mobile.md`），所以要一起比 ——
   * 曾經「詳細狀態」與「統計中心」都用 📊。
   */
  it('面板圖示彼此不重複，也不與城鎮設施撞號', () => {
    const panelIcons = PANEL_KEYS.map(k => PANEL_ICONS[k]);
    expect(new Set(panelIcons).size, panelIcons.join(' ')).toBe(panelIcons.length);

    const townIcons = readFileSync(resolve(process.cwd(), 'src/components/TownView.tsx'), 'utf-8')
      .match(/icon:\s*'([^']+)'/g)
      ?.map(m => m.replace(/icon:\s*'|'/g, '')) ?? [];
    expect(townIcons.length).toBeGreaterThan(5);

    const clash = panelIcons.filter(i => townIcons.includes(i));
    expect(clash, `與城鎮設施重複：${clash.join(' ')}`).toEqual([]);
  });

  it('圖示與文字兩者都畫進 DOM（顯示哪一個交給 CSS）', () => {
    render(<PanelDock />);
    expect(document.querySelectorAll('.panel-dock-icon').length).toBe(PANEL_KEYS.length);
    expect(document.querySelectorAll('.panel-dock-label').length).toBe(PANEL_KEYS.length);
  });

  /** 只剩圖示時，按鈕的名字全靠這兩個屬性 —— 少了就變成「六顆看不懂的方塊」 */
  it('每顆按鈕都有 title（滑鼠 tooltip）與 aria-label（觸控／螢幕閱讀器）', () => {
    render(<PanelDock />);
    for (const btn of document.querySelectorAll('.panel-dock-btn')) {
      expect(btn.getAttribute('title'), btn.outerHTML.slice(0, 60)).toBeTruthy();
      expect(btn.getAttribute('aria-label')).toBe(btn.getAttribute('title'));
    }
  });

  it('圖示對螢幕閱讀器隱藏，否則名字會被唸兩次', () => {
    render(<PanelDock />);
    for (const icon of document.querySelectorAll('.panel-dock-icon')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });

  /** 桌機的樣子是已定案的設計：任務鈕本來就長「📋 任務」，不可因為支援手機而弄不見 */
  it('CSS：寬螢幕的任務鈕保留圖示（其餘藏起來）', () => {
    const wide = APP_CSS.slice(0, APP_CSS.indexOf('@media (max-width: 1200px)'));
    expect(wide).toMatch(/\.quest-tracker-btn \.panel-dock-icon\s*\{[^}]*display:\s*inline/);
    expect(wide).toMatch(/\.panel-dock-icon\s*\{[^}]*display:\s*none/);
  });

  /**
   * 改圖示的**真正條件是「空間不足」，不是「手機」** ——
   * 文字版的一排七顆約 550px 寬，加上置中的快捷格在 1200px 以下就會互相擠壓，
   * 平板橫向與小筆電都中。斷點因此在 1200 而不是手機的 767。
   */
  it('CSS：1200px 以下改圖示模式', () => {
    const narrow = APP_CSS.slice(APP_CSS.indexOf('@media (max-width: 1200px)'));
    expect(narrow).toMatch(/\.panel-dock-label\s*\{[^}]*display:\s*none/);
  });
});

/**
 * `47-mobile.md`：Wiki／匯出／匯入／登出／版本號全部收進設定視窗的「帳號」頁，
 * 右下只留一顆 ⚙ —— 桌機與手機因此共用同一個「面板按鈕列 ＋ ⚙」結構。
 */
describe('系統按鈕整合（47-mobile）', () => {
  afterEach(() => uninstallFakeViewport());

  it('工具列只剩 ⚙，常駐的 Wiki／匯出／匯入／登出都不在了', () => {
    installFakeViewport(VIEWPORTS.desktop);
    render(<GameToolbar />);

    const toolbar = document.querySelector('.game-toolbar')!;
    expect(toolbar.querySelector('.btn-settings')).toBeTruthy();
    expect(toolbar.querySelector('.btn-wiki')).toBeNull();
    expect(toolbar.querySelector('.btn-transfer')).toBeNull();
    expect(toolbar.querySelector('.btn-logout')).toBeNull();
    expect(toolbar.querySelector('.build-label')).toBeNull();
  });

  /** ⚙ 是面板按鈕列的第七顆，不自成一列 */
  it('⚙ 套用面板按鈕的外觀（與同一列的六顆一致）', () => {
    installFakeViewport(VIEWPORTS.phonePortrait);
    render(<GameToolbar />);
    expect(screen.getByLabelText('系統設定').className).toContain('panel-dock-btn');
  });

  it('點 ⚙ 開設定視窗，且有「顯示」與「帳號」兩頁', () => {
    installFakeViewport(VIEWPORTS.phonePortrait);
    render(<GameToolbar />);

    fireEvent.click(screen.getByLabelText('系統設定'));

    expect(screen.getByText('系統設定')).toBeTruthy();
    expect(screen.getByRole('button', { name: '顯示' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '帳號' })).toBeTruthy();
  });

  it('帳號頁裝著原本在右下角的四個動作', () => {
    installFakeViewport(VIEWPORTS.phonePortrait);
    render(<GameToolbar />);

    fireEvent.click(screen.getByLabelText('系統設定'));
    fireEvent.click(screen.getByRole('button', { name: '帳號' }));

    for (const name of ['匯出角色', '匯入角色', '登出']) {
      expect(screen.getByRole('button', { name }), name).toBeTruthy();
    }
    expect(screen.getByRole('link', { name: '開啟 Wiki' })).toBeTruthy();
  });

  /** 桌機與手機共用同一個排法：⚙ 是那一列的第七顆，不自成一列 */
  it('CSS：⚙ 與面板按鈕列併成一排（右下不再有第二列）', () => {
    const wide = APP_CSS.slice(0, APP_CSS.indexOf('@media (max-width: 1200px)'));
    const block = wide.match(/\n\.hud-bottomright\s*\{([^}]*)\}/g)?.join('');
    expect(block).toContain('flex-direction: row');
  });

  /**
   * 面板列變寬之後會撞上置中的快捷格（1024px 寬時曾重疊 180px）。
   * 三欄格線的左右兩欄必須用**預設的 `1fr`（最小寬＝內容寬）**，
   * `minmax(0, 1fr)` 允許欄位縮到比內容窄，面板列就會往左溢出去蓋住快捷格。
   */
  /**
   * 快捷格（約 536px）與面板列（圖示模式約 425px）加上留白要 1000px 才排得下，
   * 1200 以下就開始互相擠壓 —— 症狀是最後一顆按鈕的數量 badge 被擠到溢出去。
   * 擠不下就換行，不要硬塞在同一列。
   */
  it('CSS：1200px 以下底部帶改成上下堆疊', () => {
    const narrow = APP_CSS.slice(APP_CSS.indexOf('@media (max-width: 1200px)'));
    const block = narrow.match(/\n {2}\.hud-bottombar\s*\{([^}]*)\}/);
    expect(block?.[1]).toContain('flex-direction: column');
  });

  /**
   * ⚙ 也掛 `.panel-dock-btn`（為了長得跟那六顆一樣），
   * 等分寬度的規則若不限定在 `.panel-dock` 之內，它會跟著吃到 `min-width: 0`
   * 而被壓到 33px —— 低於 44px 的命中區下限。
   */
  it('CSS：等分寬度只套在面板列自己的按鈕上，不波及 ⚙', () => {
    const mobile = APP_CSS.slice(APP_CSS.indexOf('@media (max-width: 767px)'));
    expect(mobile).toContain('.hud-bottomright .panel-dock > .panel-dock-btn');
  });

  it('CSS：底部帶用三欄格線，欄寬不可壓過內容', () => {
    const wide = APP_CSS.slice(0, APP_CSS.indexOf('@media (max-width: 1200px)'));
    const block = wide.match(/\n\.hud-bottombar\s*\{([^}]*)\}/);
    expect(block?.[1]).toContain('grid-template-columns: 1fr auto 1fr');
    expect(block?.[1]).not.toContain('minmax(0, 1fr)');
  });
});

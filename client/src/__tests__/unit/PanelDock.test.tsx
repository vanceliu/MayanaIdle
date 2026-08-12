// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelDock } from '../../components/PanelDock';
import { usePanelWindowStore, PANEL_KEYS, DOCK_PANEL_KEYS } from '../../stores/panelWindowStore';

vi.mock('../../components/ScriptEditorPanel', () => ({
  ScriptEditorButton: () => <button className="panel-dock-btn script-panel-trigger">自動天賦</button>,
}));

vi.mock('../../components/MailboxPanel', () => ({
  MailboxButton: () => <button className="panel-dock-btn mailbox-btn">✉️ 信箱</button>,
}));

vi.mock('../../components/QuestTracker', () => ({
  QuestTrackerButton: () => <button className="panel-dock-btn quest-tracker-btn">📋 任務</button>,
}));

function reset() {
  usePanelWindowStore.getState().closeAll();
  usePanelWindowStore.setState({ order: [...PANEL_KEYS] });
}

/**
 * 按鈕改成「圖示 + 文字兩者都畫、由 CSS 決定顯示哪一個」之後（`47-mobile.md`），
 * `getByText` 會抓到裡面的 `<span>` 而不是按鈕本身。
 * 一律以**可及名稱**取按鈕 —— 它同時把 `aria-label` 有沒有設對一起驗了。
 */
const dockButton = (name: string) => screen.getByRole('button', { name });

describe('PanelDock', () => {
  beforeEach(reset);

  it('渲染任務、信箱、四個面板按鈕與自動天賦按鈕', () => {
    render(<PanelDock />);
    for (const label of ['📋 任務', '✉️ 信箱', '詳細狀態', '裝備欄', '背包', '技能', '自動天賦']) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
  });

  /**
   * § 34.10 的分組：角色四顆一組，任務／信箱／自動天賦一組。
   * 間隔掛在 `.quest-tracker-btn` 自己的 class 上，所以**任務鈕必須是第二組的第一顆** ——
   * 順序被改時間隔會落在錯的位置，而且不會有任何錯誤訊息。
   */
  it('按鈕順序＝分組：角色四顆在前，任務／信箱／自動天賦在後', () => {
    render(<PanelDock />);
    const names = [...document.querySelectorAll<HTMLElement>('.panel-dock > button')]
      .map(b => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual(['詳細狀態', '裝備欄', '背包', '技能', '📋 任務', '✉️ 信箱', '自動天賦']);
  });

  it('任務／信箱／自動天賦不在泛用按鈕清單內（按鈕由各自組件渲染以帶指示）', () => {
    for (const key of ['quest', 'mail', 'script'] as const) {
      expect(DOCK_PANEL_KEYS, key).not.toContain(key);
      expect(PANEL_KEYS, key).toContain(key);
    }
  });

  it('點擊按鈕開啟對應面板', () => {
    render(<PanelDock />);
    fireEvent.click(dockButton('背包'));
    expect(usePanelWindowStore.getState().open.bag).toBe(true);
  });

  it('再次點擊同一按鈕關閉面板', () => {
    render(<PanelDock />);
    fireEvent.click(dockButton('技能'));
    fireEvent.click(dockButton('技能'));
    expect(usePanelWindowStore.getState().open.skill).toBe(false);
  });

  it('可同時開啟多個面板', () => {
    render(<PanelDock />);
    fireEvent.click(screen.getByText('裝備欄'));
    fireEvent.click(dockButton('背包'));

    const { open } = usePanelWindowStore.getState();
    expect(open.equipment).toBe(true);
    expect(open.bag).toBe(true);
  });

  it('開啟中的按鈕標記為 active 與 aria-pressed', () => {
    render(<PanelDock />);
    const btn = dockButton('詳細狀態');

    expect(btn.className).not.toContain('active');
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(btn);

    expect(btn.className).toContain('active');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});

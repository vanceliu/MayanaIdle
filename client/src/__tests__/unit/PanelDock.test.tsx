// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelDock } from '../../components/PanelDock';
import { usePanelWindowStore, PANEL_KEYS, DOCK_PANEL_KEYS } from '../../stores/panelWindowStore';

vi.mock('../../components/ScriptEditorPanel', () => ({
  ScriptEditorButton: () => <button className="panel-dock-btn script-panel-trigger">自動腳本</button>,
}));

vi.mock('../../components/QuestTracker', () => ({
  QuestTrackerButton: () => <button className="panel-dock-btn quest-tracker-btn">📋 任務</button>,
}));

function reset() {
  usePanelWindowStore.getState().closeAll();
  usePanelWindowStore.setState({ order: [...PANEL_KEYS] });
}

describe('PanelDock', () => {
  beforeEach(reset);

  it('渲染任務、四個面板按鈕與自動腳本按鈕', () => {
    render(<PanelDock />);
    for (const label of ['📋 任務', '詳細狀態', '裝備欄', '背包', '技能', '自動腳本']) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
  });

  it('任務與自動腳本不在泛用按鈕清單內（按鈕由各自組件渲染以帶 badge）', () => {
    for (const key of ['quest', 'script'] as const) {
      expect(DOCK_PANEL_KEYS, key).not.toContain(key);
      expect(PANEL_KEYS, key).toContain(key);
    }
  });

  it('點擊按鈕開啟對應面板', () => {
    render(<PanelDock />);
    fireEvent.click(screen.getByText('背包'));
    expect(usePanelWindowStore.getState().open.bag).toBe(true);
  });

  it('再次點擊同一按鈕關閉面板', () => {
    render(<PanelDock />);
    fireEvent.click(screen.getByText('技能'));
    fireEvent.click(screen.getByText('技能'));
    expect(usePanelWindowStore.getState().open.skill).toBe(false);
  });

  it('可同時開啟多個面板', () => {
    render(<PanelDock />);
    fireEvent.click(screen.getByText('裝備欄'));
    fireEvent.click(screen.getByText('背包'));

    const { open } = usePanelWindowStore.getState();
    expect(open.equipment).toBe(true);
    expect(open.bag).toBe(true);
  });

  it('開啟中的按鈕標記為 active 與 aria-pressed', () => {
    render(<PanelDock />);
    const btn = screen.getByText('詳細狀態');

    expect(btn.className).not.toContain('active');
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(btn);

    expect(btn.className).toContain('active');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});

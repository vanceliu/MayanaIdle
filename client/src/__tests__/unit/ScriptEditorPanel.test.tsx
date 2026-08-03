// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScriptEditorButton, ScriptEditorContent } from '../../components/ScriptEditorPanel';
import { PanelWindows } from '../../components/PanelWindows';
import { useGameStore } from '../../stores/gameStore';
import { usePanelWindowStore } from '../../stores/panelWindowStore';
import { DEFAULT_COMBAT_SCRIPT, DEFAULT_PERSISTENT_SCRIPT } from '../../models/scriptEngine';

vi.mock('../../components/CombatScriptEditor', () => ({
  CombatScriptEditor: () => <div data-testid="combat-script-editor">CombatScriptEditor</div>,
}));

vi.mock('../../components/PersistentScriptEditor', () => ({
  PersistentScriptEditor: () => <div data-testid="persistent-script-editor">PersistentScriptEditor</div>,
}));

// PanelWindows 的其他面板需要角色資料，這裡只驗自動腳本
vi.mock('../../components/CharacterStats', () => ({ CharacterStats: () => null }));
vi.mock('../../components/EquipmentPanel', () => ({ EquipmentPanel: () => null }));
vi.mock('../../components/BagPanel', () => ({ BagPanel: () => null }));
vi.mock('../../components/SkillPanel', () => ({ SkillPanel: () => null }));
vi.mock('../../components/QuestTracker', () => ({ QuestTrackerContent: () => null }));

describe('ScriptEditorButton（PanelDock 觸發鈕）', () => {
  beforeEach(() => {
    useGameStore.setState({
      combatRules: DEFAULT_COMBAT_SCRIPT,
      persistentRules: DEFAULT_PERSISTENT_SCRIPT,
    });
    usePanelWindowStore.getState().closeAll();
  });

  it('顯示規則總數 badge', () => {
    render(<ScriptEditorButton />);
    expect(screen.getByText('自動腳本')).toBeTruthy();
    const total = DEFAULT_COMBAT_SCRIPT.length + DEFAULT_PERSISTENT_SCRIPT.length;
    expect(screen.getByText(String(total))).toBeTruthy();
  });

  it('點擊切換 script 面板開關（與其他面板同一套 store）', () => {
    render(<ScriptEditorButton />);
    const btn = screen.getByRole('button', { name: /自動腳本/ });

    expect(usePanelWindowStore.getState().open.script).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(btn);
    expect(usePanelWindowStore.getState().open.script).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(btn);
    expect(usePanelWindowStore.getState().open.script).toBe(false);
  });

  it('開啟時同時置頂（點擊置頂語意）', () => {
    render(<ScriptEditorButton />);
    fireEvent.click(screen.getByRole('button', { name: /自動腳本/ }));
    const order = usePanelWindowStore.getState().order;
    expect(order[order.length - 1]).toBe('script');
  });
});

describe('ScriptEditorContent（tab 切換）', () => {
  it('預設顯示常駐腳本', () => {
    render(<ScriptEditorContent />);
    expect(screen.getByTestId('persistent-script-editor')).toBeTruthy();
    expect(screen.queryByTestId('combat-script-editor')).toBeNull();
  });

  it('切到戰鬥腳本', () => {
    render(<ScriptEditorContent />);
    fireEvent.click(screen.getByText('戰鬥腳本'));
    expect(screen.getByTestId('combat-script-editor')).toBeTruthy();
    expect(screen.queryByTestId('persistent-script-editor')).toBeNull();
  });
});

describe('自動腳本走可拖曳浮動視窗（§ 32.16）', () => {
  beforeEach(() => {
    usePanelWindowStore.getState().closeAll();
  });

  it('關閉時不渲染任何腳本編輯器', () => {
    render(<PanelWindows />);
    expect(screen.queryByTestId('persistent-script-editor')).toBeNull();
  });

  it('開啟時包在 FloatingWindow 內，且不產生遮罩', () => {
    usePanelWindowStore.getState().openPanel('script');
    render(<PanelWindows />);

    expect(screen.getByTestId('floating-window-script')).toBeTruthy();
    expect(screen.getByTestId('persistent-script-editor')).toBeTruthy();
    // 無遮罩：不擋住 idle 進行中的地圖與戰鬥
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('拖曳標題列可移動視窗位置', () => {
    usePanelWindowStore.getState().openPanel('script');
    render(<PanelWindows />);

    // 掛載時預設座標已被夾回可視範圍，因此往左上拖（往右會再次撞到夾制邊界）
    const before = usePanelWindowStore.getState().positions.script;
    const header = screen.getByTestId('floating-window-header-script');

    fireEvent.pointerDown(header, { button: 0, pointerId: 1, clientX: before.x + 100, clientY: before.y + 60 });
    fireEvent.pointerMove(header, { pointerId: 1, clientX: before.x + 40, clientY: before.y + 20 });
    fireEvent.pointerUp(header, { pointerId: 1 });

    const after = usePanelWindowStore.getState().positions.script;
    expect(after.x).toBe(before.x - 60);
    expect(after.y).toBe(before.y - 40);
  });

  it('✕ 關閉視窗', () => {
    usePanelWindowStore.getState().openPanel('script');
    render(<PanelWindows />);

    fireEvent.click(screen.getByLabelText('關閉自動腳本'));
    expect(usePanelWindowStore.getState().open.script).toBe(false);
  });
});

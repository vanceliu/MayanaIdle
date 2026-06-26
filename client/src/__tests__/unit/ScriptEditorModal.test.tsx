import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScriptEditorModal } from '../../components/ScriptEditorModal';
import { useGameStore } from '../../stores/gameStore';
import { DEFAULT_COMBAT_SCRIPT, DEFAULT_PERSISTENT_SCRIPT } from '../../models/scriptEngine';

vi.mock('../../components/CombatScriptEditor', () => ({
  CombatScriptEditor: () => <div data-testid="combat-script-editor">CombatScriptEditor</div>,
}));

vi.mock('../../components/PersistentScriptEditor', () => ({
  PersistentScriptEditor: () => <div data-testid="persistent-script-editor">PersistentScriptEditor</div>,
}));

describe('ScriptEditorModal', () => {
  beforeEach(() => {
    useGameStore.setState({
      combatRules: DEFAULT_COMBAT_SCRIPT,
      persistentRules: DEFAULT_PERSISTENT_SCRIPT,
    });
  });

  it('renders trigger button with total rule count badge', () => {
    render(<ScriptEditorModal />);
    expect(screen.getByText('自動腳本')).toBeTruthy();
    const total = DEFAULT_COMBAT_SCRIPT.length + DEFAULT_PERSISTENT_SCRIPT.length;
    expect(screen.getByText(String(total))).toBeTruthy();
  });

  it('does not show modal initially', () => {
    render(<ScriptEditorModal />);
    expect(screen.queryByTestId('persistent-script-editor')).toBeNull();
    expect(screen.queryByTestId('combat-script-editor')).toBeNull();
  });

  it('opens modal on button click showing persistent tab by default', () => {
    render(<ScriptEditorModal />);
    fireEvent.click(screen.getByText('自動腳本'));
    expect(screen.getByTestId('persistent-script-editor')).toBeTruthy();
  });

  it('switches to combat tab', () => {
    render(<ScriptEditorModal />);
    fireEvent.click(screen.getByText('自動腳本'));
    fireEvent.click(screen.getByText('戰鬥腳本'));
    expect(screen.getByTestId('combat-script-editor')).toBeTruthy();
  });

  it('closes modal on X button click', () => {
    render(<ScriptEditorModal />);
    fireEvent.click(screen.getByText('自動腳本'));
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByTestId('persistent-script-editor')).toBeNull();
  });

  it('closes modal on overlay click', () => {
    render(<ScriptEditorModal />);
    fireEvent.click(screen.getByText('自動腳本'));
    const overlay = document.querySelector('.modal-overlay');
    fireEvent.click(overlay!);
    expect(screen.queryByTestId('persistent-script-editor')).toBeNull();
  });
});

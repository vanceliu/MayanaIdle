import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LeftPanelTabs } from '../../components/LeftPanelTabs';

// Mock child components
vi.mock('../../components/CharacterStats', () => ({
  CharacterStats: () => <div data-testid="character-stats">CharacterStats</div>,
}));
vi.mock('../../components/EquipmentPanel', () => ({
  EquipmentPanel: () => <div data-testid="equipment-panel">EquipmentPanel</div>,
}));

describe('LeftPanelTabs', () => {
  it('defaults to equipment tab', () => {
    render(<LeftPanelTabs />);
    expect(screen.getByTestId('equipment-panel')).toBeTruthy();
    expect(screen.queryByTestId('character-stats')).toBeNull();
  });

  it('switches to stats tab on click', () => {
    render(<LeftPanelTabs />);
    fireEvent.click(screen.getByText('詳細狀態'));
    expect(screen.getByTestId('character-stats')).toBeTruthy();
    expect(screen.queryByTestId('equipment-panel')).toBeNull();
  });

  it('switches back to equipment tab', () => {
    render(<LeftPanelTabs />);
    fireEvent.click(screen.getByText('詳細狀態'));
    fireEvent.click(screen.getByText('裝備欄'));
    expect(screen.getByTestId('equipment-panel')).toBeTruthy();
    expect(screen.queryByTestId('character-stats')).toBeNull();
  });

  it('highlights active tab', () => {
    render(<LeftPanelTabs />);
    const equipBtn = screen.getByText('裝備欄');
    const statsBtn = screen.getByText('詳細狀態');
    expect(equipBtn.className).toContain('active');
    expect(statsBtn.className).not.toContain('active');
  });
});

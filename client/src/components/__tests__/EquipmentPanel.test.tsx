import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EquipmentPanel } from '../EquipmentPanel';
import { useGameStore } from '../../stores/gameStore';

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name, size }: { name: string; size: number }) => (
    <span data-testid={`icon-${name}`} data-size={size}>icon</span>
  ),
}));

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

describe('EquipmentPanel', () => {
  beforeEach(() => {
    useGameStore.setState({ equippedGear: {} });
  });

  it('renders all equipment slots directly', () => {
    render(<EquipmentPanel />);
    expect(screen.getByText('右手')).toBeDefined();
    expect(screen.getByText('左手')).toBeDefined();
    expect(screen.getByText('頭盔')).toBeDefined();
    expect(screen.getByText('胸甲')).toBeDefined();
    expect(screen.getByText('腰帶')).toBeDefined();
    expect(screen.getByText('手套')).toBeDefined();
    expect(screen.getByText('鞋子')).toBeDefined();
    expect(screen.getByText('項鍊')).toBeDefined();
    expect(screen.getByText('戒指1')).toBeDefined();
    expect(screen.getByText('戒指2')).toBeDefined();
  });

  it('shows empty slot text when nothing equipped', () => {
    render(<EquipmentPanel />);
    const emptySlots = screen.getAllByText('-- 空 --');
    expect(emptySlots.length).toBe(10);
  });

  it('renders slot icons', () => {
    const { container } = render(<EquipmentPanel />);
    const icons = container.querySelectorAll('.slot-icon');
    expect(icons.length).toBe(10);
  });
});

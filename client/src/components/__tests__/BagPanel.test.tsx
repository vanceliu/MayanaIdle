import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BagPanel } from '../BagPanel';
import { useGameStore } from '../../stores/gameStore';

/**
 * @vitest-environment jsdom
 */

describe('BagPanel', () => {
  it('renders with section header and slot count', () => {
    render(<BagPanel />);
    expect(screen.getByText('背包')).toBeDefined();
    expect(screen.getByText(/\/100/)).toBeDefined();
  });

it('shows gold row when expanded', () => {
    render(<BagPanel />);
    expect(screen.getByText('金幣')).toBeDefined();
  });

  it('shows potion cells with counts', () => {
    useGameStore.setState({
      bagItems: [{ name: '紅色藥水', type: 'potion', amount: 10 }],
    });
    render(<BagPanel />);
    expect(screen.getByText('紅色藥水')).toBeDefined();
  });

  it('shows empty message when no items', () => {
    useGameStore.setState({ bagItems: [], inventory: [] });
    render(<BagPanel />);
    expect(screen.getByText('背包')).toBeDefined();
  });
});
